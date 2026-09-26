package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	"gorm.io/gorm"
)

// GormHermeneuticApproachRepository implements the HermeneuticApproachRepository
// interface using GORM.
type GormHermeneuticApproachRepository struct {
	db *gorm.DB
}

// Compile-time interface check
var _ repositories.HermeneuticApproachRepository = (*GormHermeneuticApproachRepository)(nil)

// NewGormHermeneuticApproachRepository creates a new GORM hermeneutic approach repository
func NewGormHermeneuticApproachRepository(db *gorm.DB) *GormHermeneuticApproachRepository {
	return &GormHermeneuticApproachRepository{db: db}
}

// ListAll returns every hermeneutic approach, ordered by display_order.
func (r *GormHermeneuticApproachRepository) ListAll(ctx context.Context) ([]*domain.HermeneuticApproach, error) {
	var models []HermeneuticApproachModel
	if err := r.db.WithContext(ctx).Order("display_order").Find(&models).Error; err != nil {
		return nil, fmt.Errorf("failed to list hermeneutic approaches: %w", err)
	}

	approaches := make([]*domain.HermeneuticApproach, 0, len(models))
	for i := range models {
		approaches = append(approaches, hermeneuticApproachModelToDomain(&models[i]))
	}
	return approaches, nil
}

// GetByID fetches a single hermeneutic approach by its primary key.
func (r *GormHermeneuticApproachRepository) GetByID(ctx context.Context, id int) (*domain.HermeneuticApproach, error) {
	var model HermeneuticApproachModel
	err := r.db.WithContext(ctx).First(&model, id).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("failed to get hermeneutic approach by id: %w", err)
	}

	return hermeneuticApproachModelToDomain(&model), nil
}
