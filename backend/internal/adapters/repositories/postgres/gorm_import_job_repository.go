package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Constraint names from migration 000036_add_import_staging.
const importJobsUserFK = "import_jobs_user_fk"

// importItemListColumns is every item column except details (the detail panel
// fetches those lazily), plus the id of content with the same URL.
const importItemListColumns = `i.id, i.job_id, i.source_id, i.external_id, i.destination_type, i.canonical_url,
	i.kind, i.title, i.summary, i.published_at, i.duration_seconds, i.view_count, i.like_count,
	i.comment_count, i.rating, i.rating_count, i.rating_source, i.chapter_count, i.has_captions, i.genres, i.top_cast,
	i.popularity, i.review_count, i.revenue, i.budget,
	i.thumbnail_url, i.position, i.stats_fetched_at, i.import_status, i.import_error, i.content_id,
	i.imported_at, i.created_at, i.updated_at, c.id AS library_content_id`

// importItemUpsertColumns are refreshed when a candidate is staged again. The
// import outcome columns are deliberately absent so a re-list never forgets
// what was imported.
var importItemUpsertColumns = []string{
	"title", "summary", "published_at", "duration_seconds", "view_count", "like_count",
	"comment_count", "rating", "rating_count", "rating_source", "chapter_count", "has_captions", "genres", "top_cast",
	"popularity", "review_count", "revenue", "budget",
	"thumbnail_url", "position", "details", "stats_fetched_at", "kind", "updated_at",
}

// GormImportJobRepository implements repositories.ImportJobRepository using GORM
type GormImportJobRepository struct {
	db *gorm.DB
}

// Compile-time interface check
var _ repositories.ImportJobRepository = (*GormImportJobRepository)(nil)

// NewGormImportJobRepository creates a new GORM import job repository
func NewGormImportJobRepository(db *gorm.DB) *GormImportJobRepository {
	return &GormImportJobRepository{db: db}
}

// CreateJob inserts the job, then all its sources in one multi-row INSERT.
func (r *GormImportJobRepository) CreateJob(ctx context.Context, job *domain.ImportJob) (*domain.ImportJob, error) {
	jm := &ImportJobModel{UserID: job.UserID, Name: job.Name, RequestStatus: importRequestStatusToDB(job.RequestStatus)}
	if err := r.db.WithContext(ctx).Clauses(clause.Returning{}).Create(jm).Error; err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == pgForeignKeyViolation && pgErr.ConstraintName == importJobsUserFK {
			return nil, fmt.Errorf("%w: user %d", domain.ErrNotFound, job.UserID)
		}
		return nil, fmt.Errorf("failed to insert import job: %w", err)
	}
	out := importJobModelToDomain(jm)
	if len(job.Sources) == 0 {
		return out, nil
	}

	models := make([]*ImportSourceModel, len(job.Sources))
	for i, s := range job.Sources {
		models[i] = importSourceDomainToModel(s)
		models[i].JobID = jm.ID
	}
	if err := r.db.WithContext(ctx).Clauses(clause.Returning{}).Create(&models).Error; err != nil {
		return nil, fmt.Errorf("failed to insert import sources: %w", err)
	}
	for _, m := range models {
		out.Sources = append(out.Sources, importSourceModelToDomain(m))
	}
	return out, nil
}

// ListJobs returns every job newest first, then loads all their sources in one query.
func (r *GormImportJobRepository) ListJobs(ctx context.Context) ([]*domain.ImportJob, error) {
	var models []ImportJobModel
	if err := r.db.WithContext(ctx).Order("created_at DESC, id DESC").Find(&models).Error; err != nil {
		return nil, fmt.Errorf("failed to list import jobs: %w", err)
	}
	jobs := make([]*domain.ImportJob, len(models))
	ids := make([]int, len(models))
	for i := range models {
		jobs[i] = importJobModelToDomain(&models[i])
		ids[i] = models[i].ID
	}
	if err := r.attachSources(ctx, jobs, ids); err != nil {
		return nil, err
	}
	return jobs, nil
}

// GetJob returns one job with its sources.
func (r *GormImportJobRepository) GetJob(ctx context.Context, id int) (*domain.ImportJob, error) {
	var m ImportJobModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).Take(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("%w: import job %d", domain.ErrNotFound, id)
		}
		return nil, fmt.Errorf("failed to get import job: %w", err)
	}
	job := importJobModelToDomain(&m)
	if err := r.attachSources(ctx, []*domain.ImportJob{job}, []int{id}); err != nil {
		return nil, err
	}
	return job, nil
}

// attachSources loads the sources of every job in ids in one query (none for no ids).
func (r *GormImportJobRepository) attachSources(ctx context.Context, jobs []*domain.ImportJob, ids []int) error {
	if len(ids) == 0 {
		return nil
	}
	var sources []ImportSourceModel
	if err := r.db.WithContext(ctx).
		Where("job_id = ANY(CAST(? AS bigint[]))", intsToArray(ids)).
		Order("id").
		Find(&sources).Error; err != nil {
		return fmt.Errorf("failed to list import sources: %w", err)
	}
	byJob := make(map[int]*domain.ImportJob, len(jobs))
	for _, j := range jobs {
		byJob[j.ID] = j
	}
	for i := range sources {
		if j := byJob[sources[i].JobID]; j != nil {
			j.Sources = append(j.Sources, importSourceModelToDomain(&sources[i]))
		}
	}
	return nil
}

// UpdateSource writes listing progress. Status is always written; nil pointer fields are skipped.
func (r *GormImportJobRepository) UpdateSource(ctx context.Context, sourceID int, u repositories.ImportSourceUpdate) error {
	values := map[string]any{"status": strings.ToLower(string(u.Status))}
	if u.StatusDetail != nil {
		values["status_detail"] = *u.StatusDetail
	}
	if u.Title != nil {
		values["title"] = *u.Title
	}
	if u.URL != nil {
		values["url"] = *u.URL
	}
	if u.ItemCount != nil {
		values["item_count"] = *u.ItemCount
	}
	if u.FetchedAt != nil {
		values["fetched_at"] = *u.FetchedAt
	}
	result := r.db.WithContext(ctx).Model(&ImportSourceModel{}).Where("id = ?", sourceID).Updates(values)
	if result.Error != nil {
		return fmt.Errorf("failed to update import source: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return fmt.Errorf("%w: import source %d", domain.ErrNotFound, sourceID)
	}
	return nil
}

// UpsertItems stages the batch with one INSERT ... ON CONFLICT (source_id, external_id) DO UPDATE.
func (r *GormImportJobRepository) UpsertItems(ctx context.Context, items []*domain.ImportItemWithDetails) error {
	if len(items) == 0 {
		return nil
	}
	models := make([]*ImportItemModel, len(items))
	for i, it := range items {
		m, err := importItemDomainToModel(it)
		if err != nil {
			return fmt.Errorf("failed to encode import item details: %w", err)
		}
		models[i] = m
	}
	err := r.db.WithContext(ctx).
		Omit("library_content_id").
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "source_id"}, {Name: "external_id"}},
			DoUpdates: clause.AssignmentColumns(importItemUpsertColumns),
		}).
		Create(&models).Error
	if err != nil {
		return fmt.Errorf("failed to stage import items: %w", err)
	}
	return nil
}

// itemsQuery selects list columns with the URL join to content.
func (r *GormImportJobRepository) itemsQuery(ctx context.Context) *gorm.DB {
	return r.db.WithContext(ctx).
		Table("import_job_items AS i").
		Select(importItemListColumns).
		Joins("LEFT JOIN content c ON c.url = i.canonical_url")
}

// ListItems returns a job's rows in listing order (source, then position).
func (r *GormImportJobRepository) ListItems(ctx context.Context, jobID int) ([]*domain.ImportItem, error) {
	var models []ImportItemModel
	if err := r.itemsQuery(ctx).
		Where("i.job_id = ?", jobID).
		Order("i.source_id, i.position, i.id").
		Scan(&models).Error; err != nil {
		return nil, fmt.Errorf("failed to list import items: %w", err)
	}
	return importItemModelsToDomain(models), nil
}

// GetItemsByIDs returns the rows of jobID among ids.
func (r *GormImportJobRepository) GetItemsByIDs(ctx context.Context, jobID int, ids []int) ([]*domain.ImportItem, error) {
	if len(ids) == 0 {
		return []*domain.ImportItem{}, nil
	}
	var models []ImportItemModel
	if err := r.itemsQuery(ctx).
		Where("i.job_id = ? AND i.id = ANY(CAST(? AS bigint[]))", jobID, intsToArray(ids)).
		Order("i.id").
		Scan(&models).Error; err != nil {
		return nil, fmt.Errorf("failed to get import items: %w", err)
	}
	return importItemModelsToDomain(models), nil
}

// GetItemWithDetails returns one row and decodes its details payload.
func (r *GormImportJobRepository) GetItemWithDetails(ctx context.Context, itemID int) (*domain.ImportItemWithDetails, error) {
	var models []ImportItemModel
	if err := r.itemsQuery(ctx).
		Select(importItemListColumns+", i.details").
		Where("i.id = ?", itemID).
		Limit(1).
		Scan(&models).Error; err != nil {
		return nil, fmt.Errorf("failed to get import item: %w", err)
	}
	if len(models) == 0 {
		return nil, fmt.Errorf("%w: import item %d", domain.ErrNotFound, itemID)
	}
	out := &domain.ImportItemWithDetails{Item: *importItemModelToDomain(&models[0])}
	if len(models[0].Details) > 0 {
		if err := json.Unmarshal(models[0].Details, &out.Details); err != nil {
			return nil, fmt.Errorf("failed to decode import item details: %w", err)
		}
	}
	return out, nil
}

// MarkQueued queues never-imported or failed rows and returns the ids it changed.
func (r *GormImportJobRepository) MarkQueued(ctx context.Context, jobID int, ids []int) ([]int, error) {
	if len(ids) == 0 {
		return []int{}, nil
	}
	var changed []ImportItemModel
	result := r.db.WithContext(ctx).
		Model(&changed).
		Clauses(clause.Returning{Columns: []clause.Column{{Name: "id"}}}).
		Where("job_id = ? AND id = ANY(CAST(? AS bigint[])) AND (import_status IS NULL OR import_status = 'failed')",
			jobID, intsToArray(ids)).
		Updates(map[string]any{"import_status": "queued", "import_error": nil})
	if result.Error != nil {
		return nil, fmt.Errorf("failed to queue import items: %w", result.Error)
	}
	out := make([]int, len(changed))
	for i := range changed {
		out[i] = changed[i].ID
	}
	return out, nil
}

// RecordOutcome stores the result of importing one row.
func (r *GormImportJobRepository) RecordOutcome(ctx context.Context, itemID int, status domain.ImportItemStatus, errMsg *string, contentID *int) error {
	values := map[string]any{
		"import_status": strings.ToLower(string(status)),
		"import_error":  errMsg,
	}
	if contentID != nil {
		values["content_id"] = *contentID
	}
	if status == domain.ImportItemStatusImported || status == domain.ImportItemStatusSkipped {
		values["imported_at"] = time.Now().UTC()
	}
	if err := r.db.WithContext(ctx).Model(&ImportItemModel{}).Where("id = ?", itemID).Updates(values).Error; err != nil {
		return fmt.Errorf("failed to record import outcome: %w", err)
	}
	return nil
}

// FailInterrupted fails sources still listing and rows still queued.
func (r *GormImportJobRepository) FailInterrupted(ctx context.Context, detail string) (int, int, error) {
	src := r.db.WithContext(ctx).Model(&ImportSourceModel{}).
		Where("status = 'listing'").
		Updates(map[string]any{"status": "failed", "status_detail": detail})
	if src.Error != nil {
		return 0, 0, fmt.Errorf("failed to fail interrupted import sources: %w", src.Error)
	}
	items := r.db.WithContext(ctx).Model(&ImportItemModel{}).
		Where("import_status = 'queued'").
		Updates(map[string]any{"import_status": "failed", "import_error": detail})
	if items.Error != nil {
		return 0, 0, fmt.Errorf("failed to fail interrupted import items: %w", items.Error)
	}
	return int(src.RowsAffected), int(items.RowsAffected), nil
}

// CountPendingRequests counts the user's imports still waiting for an admin.
func (r *GormImportJobRepository) CountPendingRequests(ctx context.Context, userID int) (int, error) {
	var n int64
	if err := r.db.WithContext(ctx).Model(&ImportJobModel{}).
		Where("user_id = ? AND request_status = 'requested'", userID).
		Count(&n).Error; err != nil {
		return 0, fmt.Errorf("failed to count import requests: %w", err)
	}
	return int(n), nil
}

// ReviewJob approves or declines a request. The UPDATE only matches a job still
// requested, so two admins reviewing at once can't both win: the loser gets
// ErrNotFound. Approving also moves the job's waiting sources to listing.
func (r *GormImportJobRepository) ReviewJob(ctx context.Context, jobID int, status domain.ImportRequestStatus, note *string, at time.Time) error {
	result := r.db.WithContext(ctx).Model(&ImportJobModel{}).
		Where("id = ? AND request_status = 'requested'", jobID).
		Updates(map[string]any{"request_status": importRequestStatusToDB(status), "review_note": note, "reviewed_at": at})
	if result.Error != nil {
		return fmt.Errorf("failed to review import job: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return fmt.Errorf("%w: no pending request %d", domain.ErrNotFound, jobID)
	}
	if status != domain.ImportRequestStatusApproved {
		return nil
	}
	if err := r.db.WithContext(ctx).Model(&ImportSourceModel{}).
		Where("job_id = ? AND status = 'waiting'", jobID).
		Update("status", "listing").Error; err != nil {
		return fmt.Errorf("failed to start approved import sources: %w", err)
	}
	return nil
}

// ReassignByUser moves job creation credit from one user to another.
func (r *GormImportJobRepository) ReassignByUser(ctx context.Context, fromUserID, toUserID int) error {
	if err := r.db.WithContext(ctx).Model(&ImportJobModel{}).
		Where("user_id = ?", fromUserID).
		Update("user_id", toUserID).Error; err != nil {
		return fmt.Errorf("failed to reassign import jobs: %w", err)
	}
	return nil
}

func importItemModelsToDomain(models []ImportItemModel) []*domain.ImportItem {
	out := make([]*domain.ImportItem, len(models))
	for i := range models {
		out[i] = importItemModelToDomain(&models[i])
	}
	return out
}
