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

	// FeelingStats computes count/average/stddev for perspectives carrying the
	// given feeling (matched by emoji, optionally narrowed by label), scoped
	// to one content ID or, when contentID is nil, every perspective.
	FeelingStats(ctx context.Context, contentID *int, emoji string, label *string) (*domain.FeelingStats, error)

	// CustomFieldStats computes how many perspectives set the given
	// CustomFields top-level key, scoped to one content ID or, when
	// contentID is nil, every perspective.
	CustomFieldStats(ctx context.Context, contentID *int, key string) (*domain.CustomFieldStats, error)
}
