package repositories

import (
	"context"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// TodoActionRepository defines the contract for todo action persistence
type TodoActionRepository interface {
	// GetByID fetches an action by its primary key. Returns domain.ErrNotFound
	// when no row matches.
	GetByID(ctx context.Context, id int) (*domain.TodoAction, error)

	// GetByIDs fetches multiple actions by primary key in a single query. IDs
	// with no matching row are simply absent from the result slice.
	GetByIDs(ctx context.Context, ids []int) ([]*domain.TodoAction, error)

	// ListForUser returns the presets plus the actions userID entered, ordered
	// by typical_sequence NULLS LAST, then label.
	ListForUser(ctx context.Context, userID int) ([]*domain.TodoAction, error)

	// GetByKey fetches the action with the given key. A nil userID looks up a
	// preset; a set userID looks up that user's own action. Returns
	// domain.ErrNotFound when no row matches.
	GetByKey(ctx context.Context, userID *int, key string) (*domain.TodoAction, error)

	// Create inserts an action. Returns domain.ErrAlreadyExists when the same
	// key already exists for the same owner (or as a preset).
	Create(ctx context.Context, action *domain.TodoAction) (*domain.TodoAction, error)

	// ReassignByUser moves ownership of every user-entered action from
	// fromUserID to toUserID. Presets (user_id NULL) are never touched.
	ReassignByUser(ctx context.Context, fromUserID, toUserID int) error
}
