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
	paginator "github.com/pilagod/gorm-cursor-paginator/v2/paginator"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// GormContentRepository implements the ContentRepository interface using GORM
type GormContentRepository struct {
	db *gorm.DB
}

// Compile-time interface check
var _ repositories.ContentRepository = (*GormContentRepository)(nil)

// NewGormContentRepository creates a new GORM content repository
func NewGormContentRepository(db *gorm.DB) *GormContentRepository {
	return &GormContentRepository{db: db}
}

// Create inserts a new content record into the database
func (r *GormContentRepository) Create(ctx context.Context, content *domain.Content) (*domain.Content, error) {
	model := contentDomainToModel(content)

	if err := r.db.WithContext(ctx).Create(model).Error; err != nil {
		return nil, fmt.Errorf("failed to insert content: %w", err)
	}

	return contentModelToDomain(model), nil
}

// GetByID retrieves a content record by its ID
func (r *GormContentRepository) GetByID(ctx context.Context, id int) (*domain.Content, error) {
	var model ContentModel
	err := r.db.WithContext(ctx).First(&model, id).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("failed to get content by id: %w", err)
	}

	return contentModelToDomain(&model), nil
}

// GetByURL retrieves a content record by its URL
func (r *GormContentRepository) GetByURL(ctx context.Context, url string) (*domain.Content, error) {
	var model ContentModel
	err := r.db.WithContext(ctx).Where("url = ?", url).First(&model).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("failed to get content by url: %w", err)
	}

	return contentModelToDomain(&model), nil
}

// GetOrCreateByURL atomically inserts content or returns existing content matching the URL.
// When refreshOnConflict is true, updates response and updated_at on conflict (refreshes metadata).
// When refreshOnConflict is false, does nothing on conflict (preserves original data).
// Returns (content, alreadyExisted, error).
func (r *GormContentRepository) GetOrCreateByURL(ctx context.Context, content *domain.Content, refreshOnConflict bool) (*domain.Content, bool, error) {
	model := contentDomainToModel(content)

	conflictClause := clause.OnConflict{
		Columns: []clause.Column{{Name: "url"}},
	}
	if refreshOnConflict {
		conflictClause.DoUpdates = clause.AssignmentColumns([]string{"response", "updated_at"})
	} else {
		conflictClause.DoNothing = true
	}

	result := r.db.WithContext(ctx).Clauses(conflictClause).Create(model)

	if result.Error != nil {
		return nil, false, fmt.Errorf("failed to upsert content: %w", result.Error)
	}

	// If RowsAffected == 0, the row already existed — fetch it by URL
	if result.RowsAffected == 0 {
		existing, err := r.GetByURL(ctx, *content.URL)
		if err != nil {
			return nil, false, fmt.Errorf("failed to fetch existing content after conflict: %w", err)
		}
		return existing, true, nil
	}

	// Freshly created — re-fetch to get DB-generated timestamps
	fresh, err := r.GetByID(ctx, model.ID)
	if err != nil {
		return nil, false, fmt.Errorf("failed to fetch created content: %w", err)
	}
	return fresh, false, nil
}

// UpdateMetadata performs a direct UPDATE of an existing content row's refreshable
// fields (name, response, length) plus updated_at. It never touches created_at or
// added_by_user_id, and it does not insert — the row must already exist.
func (r *GormContentRepository) UpdateMetadata(ctx context.Context, id int, name string, response json.RawMessage, length *int) (*domain.Content, error) {
	result := r.db.WithContext(ctx).
		Model(&ContentModel{}).
		Where("id = ?", id).
		Updates(map[string]interface{}{
			"name":       name,
			"response":   response,
			"length":     length,
			"updated_at": time.Now(),
		})

	if result.Error != nil {
		return nil, fmt.Errorf("failed to update content metadata: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return nil, domain.ErrNotFound
	}

	fresh, err := r.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated content: %w", err)
	}
	return fresh, nil
}

// List retrieves a paginated list of content using cursor-based pagination
// contentSearchColumns maps each ContentSearchField to the SQL expression (and its own
// ILIKE) used to match it. Keeping the expressions here (rather than inline in
// applyContentSearch) keeps the OR-assembly loop free of per-field SQL detail.
var contentSearchColumns = map[domain.ContentSearchField]string{
	domain.ContentSearchFieldTitle:        "name ILIKE ?",
	domain.ContentSearchFieldDescription:  "response->'items'->0->'snippet'->>'description' ILIKE ?",
	domain.ContentSearchFieldChannelTitle: "response->'items'->0->'snippet'->>'channelTitle' ILIKE ?",
	domain.ContentSearchFieldTags:         "(response->'items'->0->'snippet'->'tags')::text ILIKE ?",
}

// applyContentSearch scopes a free-text search term to one or more content columns,
// OR'd together (so "everything except tags" still matches a title-only or
// description-only hit). An empty/omitted fields list preserves the historical
// default of matching on the title (name) alone.
func applyContentSearch(query *gorm.DB, term string, fields []domain.ContentSearchField) *gorm.DB {
	if len(fields) == 0 {
		fields = []domain.ContentSearchField{domain.ContentSearchFieldTitle}
	}

	pattern := "%" + term + "%"
	var group *gorm.DB
	for _, field := range fields {
		expr, ok := contentSearchColumns[field]
		if !ok {
			continue
		}
		if group == nil {
			// Session(&gorm.Session{}) gives an independent statement (its own clause
			// builder) scoped off `query`, so chaining Or() below only groups these
			// field conditions together rather than mutating `query`'s own filters.
			group = query.Session(&gorm.Session{}).Where(expr, pattern)
		} else {
			group = group.Or(expr, pattern)
		}
	}
	if group == nil {
		return query
	}
	return query.Where(group)
}

func (r *GormContentRepository) List(ctx context.Context, params domain.ContentListParams) (*domain.PaginatedContent, error) {
	limit := 10
	if params.First != nil {
		limit = *params.First
	}

	// Build sort rules using helper from helpers.go
	rules := buildContentSortRules(params.SortBy, params.SortOrder)

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
	query := r.db.WithContext(ctx).Model(&ContentModel{})

	// Apply filters via GORM chaining
	if params.Filter != nil {
		if params.Filter.ContentType != nil {
			query = query.Where("content_type = ?", strings.ToLower(string(*params.Filter.ContentType)))
		}
		if params.Filter.MinLengthSeconds != nil {
			query = query.Where("length >= ?", *params.Filter.MinLengthSeconds)
		}
		if params.Filter.MaxLengthSeconds != nil {
			query = query.Where("length <= ?", *params.Filter.MaxLengthSeconds)
		}
		if params.Filter.Search != nil && *params.Filter.Search != "" {
			query = applyContentSearch(query, *params.Filter.Search, params.Filter.SearchFields)
		}
		// View count filters (JSONB extraction)
		if params.Filter.MinViewCount != nil {
			query = query.Where("(response->'items'->0->'statistics'->>'viewCount')::BIGINT >= ?", *params.Filter.MinViewCount)
		}
		if params.Filter.MaxViewCount != nil {
			query = query.Where("(response->'items'->0->'statistics'->>'viewCount')::BIGINT <= ?", *params.Filter.MaxViewCount)
		}
		// Like count filters (JSONB extraction)
		if params.Filter.MinLikeCount != nil {
			query = query.Where("(response->'items'->0->'statistics'->>'likeCount')::BIGINT >= ?", *params.Filter.MinLikeCount)
		}
		if params.Filter.MaxLikeCount != nil {
			query = query.Where("(response->'items'->0->'statistics'->>'likeCount')::BIGINT <= ?", *params.Filter.MaxLikeCount)
		}
		// Published date filters (JSONB extraction, ISO 8601 string comparison)
		if params.Filter.PublishedAfter != nil {
			query = query.Where("response->'items'->0->'snippet'->>'publishedAt' >= ?", *params.Filter.PublishedAfter)
		}
		if params.Filter.PublishedBefore != nil {
			query = query.Where("response->'items'->0->'snippet'->>'publishedAt' <= ?", *params.Filter.PublishedBefore)
		}
		// Channel title filter (JSONB extraction + ILIKE)
		if params.Filter.ChannelTitle != nil && *params.Filter.ChannelTitle != "" {
			query = query.Where("response->'items'->0->'snippet'->>'channelTitle' ILIKE ?", "%"+*params.Filter.ChannelTitle+"%")
		}
		// Tag contains filter (JSONB array cast to text for ILIKE search)
		if params.Filter.TagContains != nil && *params.Filter.TagContains != "" {
			query = query.Where("(response->'items'->0->'snippet'->'tags')::text ILIKE ?", "%"+*params.Filter.TagContains+"%")
		}
		// Description search (JSONB extraction + ILIKE)
		if params.Filter.DescriptionSearch != nil && *params.Filter.DescriptionSearch != "" {
			query = query.Where("response->'items'->0->'snippet'->>'description' ILIKE ?", "%"+*params.Filter.DescriptionSearch+"%")
		}
		// Created/Updated date filters (direct columns)
		if params.Filter.CreatedAfter != nil {
			query = query.Where("created_at >= ?", *params.Filter.CreatedAfter)
		}
		if params.Filter.CreatedBefore != nil {
			query = query.Where("created_at <= ?", *params.Filter.CreatedBefore)
		}
		if params.Filter.UpdatedAfter != nil {
			query = query.Where("updated_at >= ?", *params.Filter.UpdatedAfter)
		}
		if params.Filter.UpdatedBefore != nil {
			query = query.Where("updated_at <= ?", *params.Filter.UpdatedBefore)
		}
	}

	// Total count (before cursor/limit — respects filters only)
	var totalCountInt *int
	if params.IncludeTotalCount {
		// Clone query to avoid Paginate() modifying count query
		countQuery := query.Session(&gorm.Session{})
		var count int64
		if err := countQuery.Count(&count).Error; err != nil {
			return nil, fmt.Errorf("failed to count content: %w", err)
		}
		countInt := int(count)
		totalCountInt = &countInt
	}

	// Execute pagination
	var models []ContentModel
	pageResult, cursor, err := p.Paginate(query, &models)
	if err != nil {
		return nil, fmt.Errorf("failed to list content: %w", err)
	}
	if pageResult.Error != nil {
		return nil, fmt.Errorf("failed to list content: %w", pageResult.Error)
	}

	// Map results to domain
	items := make([]*domain.Content, len(models))
	for i := range models {
		items[i] = contentModelToDomain(&models[i])
	}

	result := &domain.PaginatedContent{
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

// ReassignByUser updates all content owned by fromUserID to toUserID
func (r *GormContentRepository) ReassignByUser(ctx context.Context, fromUserID, toUserID int) error {
	return r.db.WithContext(ctx).
		Model(&ContentModel{}).
		Where("added_by_user_id = ?", fromUserID).
		Update("added_by_user_id", toUserID).Error
}

// UpdatePrimaryCategoryID sets the primary_category_id FK on a content record
func (r *GormContentRepository) UpdatePrimaryCategoryID(ctx context.Context, contentID int, categoryID *int) error {
	result := r.db.WithContext(ctx).
		Model(&ContentModel{}).
		Where("id = ?", contentID).
		Update("primary_category_id", categoryID)
	if result.Error != nil {
		return fmt.Errorf("failed to update primary category: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}
