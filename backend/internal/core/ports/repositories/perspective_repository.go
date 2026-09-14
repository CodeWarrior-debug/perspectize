package repositories

import (
	"context"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// PerspectiveRepository defines the contract for perspective persistence
type PerspectiveRepository interface {
	Create(ctx context.Context, perspective *domain.Perspective) (*domain.Perspective, error)
	GetByID(ctx context.Context, id int) (*domain.Perspective, error)
	Update(ctx context.Context, perspective *domain.Perspective) (*domain.Perspective, error)
	Delete(ctx context.Context, id int) error
	List(ctx context.Context, params domain.PerspectiveListParams) (*domain.PaginatedPerspectives, error)
	ReassignByUser(ctx context.Context, fromUserID, toUserID int) error

	// AggregateByContentIDs computes, for each given content ID, the count and
	// average Quality rating of its PUBLIC perspectives. Content IDs with no
	// public perspectives are simply absent from the result map (count 0).
	AggregateByContentIDs(ctx context.Context, contentIDs []int) (map[int]*domain.PerspectiveAggregate, error)
}
