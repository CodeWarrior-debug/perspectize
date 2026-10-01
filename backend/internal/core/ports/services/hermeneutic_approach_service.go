package services

import (
	"context"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// HermeneuticApproachService defines the contract for reading the
// hermeneutic approach lookup list.
type HermeneuticApproachService interface {
	// ListAll returns every hermeneutic approach, ordered for display.
	ListAll(ctx context.Context) ([]*domain.HermeneuticApproach, error)
}
