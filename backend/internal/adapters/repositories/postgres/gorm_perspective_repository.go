package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	paginator "github.com/pilagod/gorm-cursor-paginator/v2/paginator"
	"gorm.io/gorm"
)

// GormPerspectiveRepository implements the PerspectiveRepository interface using GORM
type GormPerspectiveRepository struct {
	db *gorm.DB
}

// Compile-time interface check
var _ repositories.PerspectiveRepository = (*GormPerspectiveRepository)(nil)

// NewGormPerspectiveRepository creates a new GORM perspective repository
func NewGormPerspectiveRepository(db *gorm.DB) *GormPerspectiveRepository {
	return &GormPerspectiveRepository{db: db}
}

// Create inserts a new perspective record into the database
func (r *GormPerspectiveRepository) Create(ctx context.Context, p *domain.Perspective) (*domain.Perspective, error) {
	model := perspectiveDomainToModel(p)

	if err := r.db.WithContext(ctx).Create(model).Error; err != nil {
		return nil, fmt.Errorf("failed to insert perspective: %w", err)
	}

	// Fetch fresh record with DB-generated timestamps
	return r.GetByID(ctx, model.ID)
}

// GetByID retrieves a perspective by its ID
func (r *GormPerspectiveRepository) GetByID(ctx context.Context, id int) (*domain.Perspective, error) {
	var model PerspectiveModel
	err := r.db.WithContext(ctx).First(&model, id).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("failed to get perspective by id: %w", err)
	}

	return perspectiveModelToDomain(&model), nil
}

// Update updates an existing perspective
func (r *GormPerspectiveRepository) Update(ctx context.Context, p *domain.Perspective) (*domain.Perspective, error) {
	model := perspectiveDomainToModel(p)

	if err := r.db.WithContext(ctx).Save(model).Error; err != nil {
		return nil, fmt.Errorf("failed to update perspective: %w", err)
	}

	// Fetch fresh record with updated timestamps
	return r.GetByID(ctx, model.ID)
}

// Delete removes a perspective by ID
func (r *GormPerspectiveRepository) Delete(ctx context.Context, id int) error {
	result := r.db.WithContext(ctx).Delete(&PerspectiveModel{}, id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete perspective: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return domain.ErrNotFound
	}

	return nil
}

// List retrieves a paginated list of perspectives
func (r *GormPerspectiveRepository) List(ctx context.Context, params domain.PerspectiveListParams) (*domain.PaginatedPerspectives, error) {
	limit := 10
	if params.First != nil {
		limit = *params.First
	}

	// Build sort rules using helper from helpers.go
	rules := buildPerspectiveSortRules(params.SortBy, params.SortOrder)

	// Configure paginator options
	opts := []paginator.Option{
		paginator.WithRules(rules...),
		paginator.WithLimit(limit),
		paginator.WithAllowTupleCmp(paginator.TRUE),
	}
	if params.After != nil {
		opts = append(opts, paginator.WithAfter(*params.After))
	}
	p := paginator.New(opts...)

	// Start query with context and apply filters BEFORE pagination
	query := r.db.WithContext(ctx).Model(&PerspectiveModel{})

	// Apply filters via GORM chaining
	if params.Filter != nil {
		if params.Filter.UserID != nil {
			query = query.Where("user_id = ?", *params.Filter.UserID)
		}
		if params.Filter.ContentID != nil {
			query = query.Where("content_id = ?", *params.Filter.ContentID)
		}
		if params.Filter.Privacy != nil {
			query = query.Where("privacy = ?", privacyToDBValue(*params.Filter.Privacy))
		}
	}

	// Read-authorization predicate (see PerspectiveService.ListPerspectives).
	// WHERE shape chosen over UNION: benchmark 2026-09-10 (plan Task 6) — WHERE
	// ~8.9ms vs UNION ~9.3ms unindexed, 0.02ms vs 0.29ms with a (user_id,created_at) index.
	if params.RestrictToPublicOrOwner {
		if params.ViewerID != nil {
			query = query.Where("privacy = ? OR user_id = ?",
				privacyToDBValue(domain.PrivacyPublic), *params.ViewerID)
		} else {
			query = query.Where("privacy = ?", privacyToDBValue(domain.PrivacyPublic))
		}
	}

	// Total count (before cursor/limit — respects filters only)
	var totalCountInt *int
	if params.IncludeTotalCount {
		// Clone query to avoid Paginate() modifying count query
		countQuery := query.Session(&gorm.Session{})
		var count int64
		if err := countQuery.Count(&count).Error; err != nil {
			return nil, fmt.Errorf("failed to count perspectives: %w", err)
		}
		countInt := int(count)
		totalCountInt = &countInt
	}

	// Execute pagination
	var models []PerspectiveModel
	pageResult, cursor, err := p.Paginate(query, &models)
	if err != nil {
		return nil, fmt.Errorf("failed to list perspectives: %w", err)
	}
	if pageResult.Error != nil {
		return nil, fmt.Errorf("failed to list perspectives: %w", pageResult.Error)
	}

	// Map results to domain
	items := make([]*domain.Perspective, len(models))
	for i := range models {
		items[i] = perspectiveModelToDomain(&models[i])
	}

	result := &domain.PaginatedPerspectives{
		Items:      items,
		HasNext:    cursor.After != nil,
		HasPrev:    cursor.Before != nil,
		TotalCount: totalCountInt,
	}

	// StartCursor = cursor.Before, EndCursor = cursor.After
	result.StartCursor = cursor.Before
	result.EndCursor = cursor.After

	return result, nil
}

// aggregateRow is the scan target for the grouped count/avg query below.
type aggregateRow struct {
	ContentID    int
	Count        int
	QualityCount int
	AvgQuality   *float64
}

// AggregateByContentIDs computes, per content ID, the count of ALL
// perspectives (public and private alike — a perspective's Privacy controls
// who can read its content, not whether it counts toward the aggregate;
// see FEATURE_BACKLOG.md for a possible future opt-out), how many of those
// set a Quality rating, and their average Quality.
//
// QualityCount (COUNT(quality), which skips NULLs) can be smaller than Count
// (COUNT(*), every perspective) since Quality is optional — that's the
// number shown in the average-rating tooltip so "N ratings" always matches
// what AverageQuality was actually computed over.
func (r *GormPerspectiveRepository) AggregateByContentIDs(ctx context.Context, contentIDs []int) (map[int]*domain.PerspectiveAggregate, error) {
	if len(contentIDs) == 0 {
		return map[int]*domain.PerspectiveAggregate{}, nil
	}

	var rows []aggregateRow
	err := r.db.WithContext(ctx).
		Model(&PerspectiveModel{}).
		Select("content_id AS content_id, COUNT(*) AS count, COUNT(quality) AS quality_count, AVG(quality) AS avg_quality").
		Where("content_id IN ?", contentIDs).
		Group("content_id").
		Find(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("failed to aggregate perspectives by content: %w", err)
	}

	out := make(map[int]*domain.PerspectiveAggregate, len(rows))
	for _, row := range rows {
		out[row.ContentID] = &domain.PerspectiveAggregate{
			ContentID:      row.ContentID,
			Count:          row.Count,
			QualityCount:   row.QualityCount,
			AverageQuality: row.AvgQuality,
		}
	}
	return out, nil
}

// feelingStatsRow is the scan target for FeelingStats' grouped query below.
type feelingStatsRow struct {
	Count           int
	AvgIntensity    *float64
	StddevIntensity *float64
}

// FeelingStats computes count/average/population-stddev of Intensity for
// perspectives carrying the given feeling. Matching is on the exact Emoji
// grapheme (feelings.emoji, unnested from the jsonb[] column); when label is
// non-nil it further narrows to a case-insensitive label match (defends
// against the same emoji being reused for two curated feelings -- see
// FeelingEntry's doc comment). CROSS JOIN LATERAL unnest fans each
// perspective's feelings array out into one row per feeling so the jsonb
// object's ->>'emoji'/->>'intensity' text extraction can filter/aggregate
// directly; COUNT(DISTINCT p.id) guards against double-counting a
// perspective that (unusually) lists the same feeling twice.
func (r *GormPerspectiveRepository) FeelingStats(ctx context.Context, contentID *int, emoji string, label *string) (*domain.FeelingStats, error) {
	query := `
		SELECT
			COUNT(DISTINCT p.id) AS count,
			AVG((f->>'intensity')::float8) AS avg_intensity,
			STDDEV_POP((f->>'intensity')::float8) AS stddev_intensity
		FROM perspectives p
		CROSS JOIN LATERAL unnest(p.feelings) AS f
		WHERE f->>'emoji' = ?`
	args := []interface{}{emoji}

	if label != nil {
		query += ` AND lower(f->>'label') = lower(?)`
		args = append(args, *label)
	}
	if contentID != nil {
		query += ` AND p.content_id = ?`
		args = append(args, *contentID)
	}

	var row feelingStatsRow
	if err := r.db.WithContext(ctx).Raw(query, args...).Scan(&row).Error; err != nil {
		return nil, fmt.Errorf("failed to compute feeling stats: %w", err)
	}

	// STDDEV_POP of a single value comes back 0 from Postgres, but a spread
	// computed over one data point isn't a meaningful "0" -- force nil to
	// match FeelingStats' doc comment.
	if row.Count < 2 {
		row.StddevIntensity = nil
	}

	total, err := r.countPerspectives(ctx, contentID)
	if err != nil {
		return nil, err
	}

	return &domain.FeelingStats{
		Emoji:             emoji,
		Label:             label,
		Count:             row.Count,
		TotalPerspectives: total,
		AverageIntensity:  row.AvgIntensity,
		StdDevIntensity:   row.StddevIntensity,
	}, nil
}

// CustomFieldStats computes how many perspectives set the given top-level
// CustomFields key, for any value. jsonb_exists (rather than the `?`
// containment operator) sidesteps GORM Raw()'s own `?` placeholder parsing,
// which would otherwise misread a literal `?` operator as an extra bind arg.
func (r *GormPerspectiveRepository) CustomFieldStats(ctx context.Context, contentID *int, key string) (*domain.CustomFieldStats, error) {
	query := `
		SELECT COUNT(*) AS count
		FROM perspectives p
		WHERE jsonb_exists(p.custom_fields, ?)`
	args := []interface{}{key}

	if contentID != nil {
		query += ` AND p.content_id = ?`
		args = append(args, *contentID)
	}

	var count int
	if err := r.db.WithContext(ctx).Raw(query, args...).Scan(&count).Error; err != nil {
		return nil, fmt.Errorf("failed to compute custom field stats: %w", err)
	}

	total, err := r.countPerspectives(ctx, contentID)
	if err != nil {
		return nil, err
	}

	return &domain.CustomFieldStats{
		Key:               key,
		Count:             count,
		TotalPerspectives: total,
	}, nil
}

// countPerspectives is the shared "total perspectives in scope" denominator
// behind FeelingStats and CustomFieldStats' PercentOfPerspectives.
func (r *GormPerspectiveRepository) countPerspectives(ctx context.Context, contentID *int) (int, error) {
	q := r.db.WithContext(ctx).Model(&PerspectiveModel{})
	if contentID != nil {
		q = q.Where("content_id = ?", *contentID)
	}
	var count int64
	if err := q.Count(&count).Error; err != nil {
		return 0, fmt.Errorf("failed to count perspectives: %w", err)
	}
	return int(count), nil
}

// ReassignByUser updates all perspectives owned by fromUserID to toUserID
func (r *GormPerspectiveRepository) ReassignByUser(ctx context.Context, fromUserID, toUserID int) error {
	return r.db.WithContext(ctx).
		Model(&PerspectiveModel{}).
		Where("user_id = ?", fromUserID).
		Update("user_id", toUserID).Error
}
