package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// GormCategoryRepository implements the CategoryRepository interface using GORM
type GormCategoryRepository struct {
	db *gorm.DB
}

// Compile-time interface check
var _ repositories.CategoryRepository = (*GormCategoryRepository)(nil)

// NewGormCategoryRepository creates a new GORM category repository
func NewGormCategoryRepository(db *gorm.DB) *GormCategoryRepository {
	return &GormCategoryRepository{db: db}
}

// Upsert inserts a new category or updates an existing one by wikidata_qid.
// Uses clause.OnConflict for atomic upsert (same pattern as GetOrCreateByURL).
func (r *GormCategoryRepository) Upsert(ctx context.Context, category *domain.Category) (*domain.Category, error) {
	model := categoryDomainToModel(category)
	model.UpdatedAt = time.Now()

	// RETURNING * gives back the stored row (inserted or updated): no re-read.
	// wikipedia_url is refreshed too, but a blank one (the Wikidata lookup
	// failed or found no sitelink) never overwrites a URL already stored.
	err := r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "wikidata_qid"}},
		DoUpdates: append(clause.AssignmentColumns([]string{"label", "description", "entity_type", "updated_at"}),
			clause.Assignment{
				Column: clause.Column{Name: "wikipedia_url"},
				Value:  gorm.Expr("COALESCE(NULLIF(EXCLUDED.wikipedia_url, ''), categories.wikipedia_url)"),
			}),
	}, clause.Returning{}).Create(model).Error
	if err != nil {
		return nil, fmt.Errorf("failed to upsert category: %w", err)
	}

	return categoryModelToDomain(model), nil
}

// GetByID fetches a category by its primary key
func (r *GormCategoryRepository) GetByID(ctx context.Context, id int) (*domain.Category, error) {
	var model CategoryModel
	err := r.db.WithContext(ctx).First(&model, id).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("failed to get category by id: %w", err)
	}

	return categoryModelToDomain(&model), nil
}

// GetByIDs fetches multiple categories by primary key in a single query.
// Emits `WHERE id IN (...)` (GORM expands a slice bind to ANY-equivalent).
// Missing IDs are omitted; an empty input returns an empty slice with no query.
func (r *GormCategoryRepository) GetByIDs(ctx context.Context, ids []int) ([]*domain.Category, error) {
	if len(ids) == 0 {
		return []*domain.Category{}, nil
	}

	var models []CategoryModel
	if err := r.db.WithContext(ctx).Where("id = ANY(CAST(? AS bigint[]))", intsToArray(ids)).Find(&models).Error; err != nil {
		return nil, fmt.Errorf("failed to get categories by ids: %w", err)
	}

	categories := make([]*domain.Category, 0, len(models))
	for i := range models {
		categories = append(categories, categoryModelToDomain(&models[i]))
	}
	return categories, nil
}
