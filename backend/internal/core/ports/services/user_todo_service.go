package services

import (
	"context"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// UserTodoService defines the contract for user todo (plan) business logic.
// Mutations take the authenticated actor's id and enforce ownership; reads take
// the viewer id (nil when anonymous) and apply the privacy rule.
type UserTodoService interface {
	// ListUserTodos returns one page of todos visible to params.ViewerID.
	ListUserTodos(ctx context.Context, params domain.UserTodoListParams) (*domain.PaginatedUserTodos, error)

	// GetUserTodo returns the todo with the given id, or (nil, nil) when it does
	// not exist or is private to someone other than viewerID.
	GetUserTodo(ctx context.Context, id int, viewerID *int) (*domain.UserTodo, error)

	// CreateUserTodo creates a todo owned by actorUserID. Defaults privacy to
	// PUBLIC and validates priority, percent, content-or-name and list ownership.
	CreateUserTodo(ctx context.Context, actorUserID int, input domain.CreateUserTodoInput) (*domain.UserTodo, error)

	// UpdateUserTodo partially updates a todo. Returns domain.ErrForbidden when
	// actorUserID does not own a PUBLIC todo, and domain.ErrNotFound when the
	// todo is PRIVATE to someone else (so its id isn't confirmed).
	UpdateUserTodo(ctx context.Context, actorUserID int, input domain.UpdateUserTodoInput) (*domain.UserTodo, error)

	// DeleteUserTodo removes a todo. Returns domain.ErrForbidden when
	// actorUserID does not own a PUBLIC todo, and domain.ErrNotFound for a
	// PRIVATE todo owned by someone else.
	DeleteUserTodo(ctx context.Context, actorUserID, id int) error

	// ListTodoActions returns the presets plus the actions actorUserID entered,
	// in picker order.
	ListTodoActions(ctx context.Context, actorUserID int) ([]*domain.TodoAction, error)

	// CreateTodoAction adds a user-entered action for actorUserID. A duplicate
	// key returns the existing row.
	CreateTodoAction(ctx context.Context, actorUserID int, input domain.CreateTodoActionInput) (*domain.TodoAction, error)

	// GetTodoActionsByIDs fetches actions by id in a single batch (dataloader).
	GetTodoActionsByIDs(ctx context.Context, ids []int) ([]*domain.TodoAction, error)

	// ListUserTodoLists returns the lists owned by ownerUserID that viewerID may
	// see: private lists only to their owner.
	ListUserTodoLists(ctx context.Context, ownerUserID int, viewerID *int) ([]*domain.UserTodoList, error)

	// GetUserTodoListsByIDs fetches lists by id in a single batch (dataloader),
	// omitting any private list that viewerID may not see.
	GetUserTodoListsByIDs(ctx context.Context, ids []int, viewerID *int) ([]*domain.UserTodoList, error)

	// CreateUserTodoList creates a list owned by actorUserID.
	CreateUserTodoList(ctx context.Context, actorUserID int, input domain.CreateUserTodoListInput) (*domain.UserTodoList, error)

	// UpdateUserTodoList partially updates a list. Same ownership rule as
	// UpdateUserTodo: ErrForbidden for a PUBLIC list, ErrNotFound for a PRIVATE one.
	UpdateUserTodoList(ctx context.Context, actorUserID int, input domain.UpdateUserTodoListInput) (*domain.UserTodoList, error)

	// DeleteUserTodoList unlists the list's todos, then deletes the list. Todos
	// are never deleted with a list. Same ownership rule as UpdateUserTodo.
	DeleteUserTodoList(ctx context.Context, actorUserID, id int) error

	// ReorderUserTodoList rewrites positions 1..N of listID to the order of
	// todoIDs. todoIDs must be non-empty and unique (domain.ErrInvalidInput).
	// Same ownership rule as UpdateUserTodo: ErrForbidden for a PUBLIC list,
	// ErrNotFound for a PRIVATE one.
	ReorderUserTodoList(ctx context.Context, actorUserID, listID int, todoIDs []int) ([]*domain.UserTodo, error)
}
