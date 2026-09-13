package repositories

import (
	"context"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// CategoryRepository defines the contract for category persistence
type CategoryRepository interface {
	// Upsert inserts or updates a category by wikidata_qid
	Upsert(ctx context.Context, category *domain.Category) (*domain.Category, error)

	// GetByID fetches a category by its primary key
	GetByID(ctx context.Context, id int) (*domain.Category, error)

	// GetByIDs fetches multiple categories by primary key in a single query
	// (WHERE id = ANY($1)). IDs with no matching row are simply absent from
	// the result slice; a missing ID is not an error. Order is not guaranteed.
	GetByIDs(ctx context.Context, ids []int) ([]*domain.Category, error)
}
