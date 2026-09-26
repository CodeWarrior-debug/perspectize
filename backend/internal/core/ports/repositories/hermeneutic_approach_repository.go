package repositories

import (
	"context"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// HermeneuticApproachRepository defines the contract for reading the
// hermeneutic_approach lookup table. The list is small and fixed (seeded by
// migration), so there is no Create/Update -- only reads.
type HermeneuticApproachRepository interface {
	// ListAll returns every hermeneutic approach, ordered by display_order.
	ListAll(ctx context.Context) ([]*domain.HermeneuticApproach, error)

	// GetByID fetches a single hermeneutic approach by its primary key.
	GetByID(ctx context.Context, id int) (*domain.HermeneuticApproach, error)
}
