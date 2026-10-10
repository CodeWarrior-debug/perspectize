package repositories

import (
	"context"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// UserTodoRepository defines the contract for user todo persistence
type UserTodoRepository interface {
	// List returns one page of todos matching params, applying the privacy
	// predicate (public OR owned by ViewerID) when RestrictToPublicOrOwner is set.
	List(ctx context.Context, params domain.UserTodoListParams) (*domain.PaginatedUserTodos, error)

	// GetByID fetches a todo by its primary key. Returns domain.ErrNotFound when
	// no row matches.
	GetByID(ctx context.Context, id int) (*domain.UserTodo, error)

	// GetByIDs fetches multiple todos by primary key in a single query. IDs with
	// no matching row are simply absent from the result slice.
	GetByIDs(ctx context.Context, ids []int) ([]*domain.UserTodo, error)

	// Create inserts the todo. Returns domain.ErrAlreadyExists when the owner
	// already has an open todo for the same content and action, and
	// domain.ErrNotFound when a referenced user, content, action or list is missing.
	Create(ctx context.Context, todo *domain.UserTodo) (*domain.UserTodo, error)

	// Update writes the todo ONLY if it belongs to actorUserID; the ownership
	// predicate is part of the UPDATE statement itself. Returns domain.ErrNotFound
	// when no row matched.
	Update(ctx context.Context, todo *domain.UserTodo, actorUserID int) (*domain.UserTodo, error)

	// Delete removes the todo with the given id ONLY if it belongs to
	// actorUserID. Returns domain.ErrNotFound when no row matched.
	Delete(ctx context.Context, id int, actorUserID int) error

	// NextListPosition returns max(list_position)+1 for the list, or 1 when the
	// list is empty. Used to append a todo to the end of a list.
	NextListPosition(ctx context.Context, listID int) (int, error)

	// UnlistAll clears list_id and list_position on every todo in listID that
	// actorUserID owns. Called before a list is deleted, because the list FK
	// blocks deletion while todos reference it.
	UnlistAll(ctx context.Context, listID int, actorUserID int) error

	// Reorder rewrites list_position to 1..N in the order of todoIDs, for todos
	// in listID owned by actorUserID, in one statement. Returns the reordered
	// todos.
	Reorder(ctx context.Context, listID int, todoIDs []int, actorUserID int) ([]*domain.UserTodo, error)

	// ReassignByUser moves ownership of every todo from fromUserID to toUserID.
	// Used when a user is deleted (sentinel reassignment).
	ReassignByUser(ctx context.Context, fromUserID, toUserID int) error
}

// UserTodoListRepository defines the contract for user todo list persistence
type UserTodoListRepository interface {
	// ListByUser returns the lists owned by userID. Private lists are included
	// only when includePrivate is true.
	ListByUser(ctx context.Context, userID int, includePrivate bool) ([]*domain.UserTodoList, error)

	// GetByID fetches a list by its primary key. Returns domain.ErrNotFound when
	// no row matches.
	GetByID(ctx context.Context, id int) (*domain.UserTodoList, error)

	// GetByIDs fetches multiple lists by primary key in a single query. IDs with
	// no matching row are simply absent from the result slice.
	GetByIDs(ctx context.Context, ids []int) ([]*domain.UserTodoList, error)

	// Create inserts the list. Returns domain.ErrAlreadyExists when the owner
	// already has a list with the same name.
	Create(ctx context.Context, list *domain.UserTodoList) (*domain.UserTodoList, error)

	// Update writes the list ONLY if it belongs to actorUserID. Returns
	// domain.ErrNotFound when no row matched.
	Update(ctx context.Context, list *domain.UserTodoList, actorUserID int) (*domain.UserTodoList, error)

	// Delete removes the list with the given id ONLY if it belongs to
	// actorUserID. Returns domain.ErrNotFound when no row matched.
	Delete(ctx context.Context, id int, actorUserID int) error

	// ReassignByUser moves ownership of every list from fromUserID to toUserID.
	ReassignByUser(ctx context.Context, fromUserID, toUserID int) error
}
