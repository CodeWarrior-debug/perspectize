package postgres

import (
	"context"
	"errors"
	"fmt"
	"strings"

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
			query = query.Where("privacy = ?", strings.ToLower(string(*params.Filter.Privacy)))
		}
	}

	// Read-authorization predicate (see PerspectiveService.ListPerspectives).
	// WHERE shape — benchmarked against a UNION in
	// docs/superpowers/plans/2026-09-09-perspective-privacy-plan.md Task 6.
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

// ReassignByUser updates all perspectives owned by fromUserID to toUserID
func (r *GormPerspectiveRepository) ReassignByUser(ctx context.Context, fromUserID, toUserID int) error {
	return r.db.WithContext(ctx).
		Model(&PerspectiveModel{}).
		Where("user_id = ?", fromUserID).
		Update("user_id", toUserID).Error
}
