package resolvers

// User todo ("Plan") resolvers: todos, their named lists and the action picker.
// Split out of the single gqlgen-generated schema.resolvers.go for navigability,
// see resolver.go. Mapping lives in helpers.go; this file only authenticates,
// calls UserTodoService and maps the result.
//
// Identity: writes take the actor from auth.RequireAuth (never a client id), and
// reads take the optional viewer from auth.ForContext. Ownership and privacy are
// decided by UserTodoService and the owner-scoped SQL under it.

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/auth"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/dataloader"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/generated"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/model"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// UserTodos is the resolver for the userTodos field.
func (r *queryResolver) UserTodos(ctx context.Context, first *int, after *string, last *int, before *string, sortBy *domain.UserTodoSortBy, sortOrder *domain.SortOrder, includeTotalCount *bool, filter *model.UserTodoFilter) (*model.PaginatedUserTodos, error) {
	params := domain.UserTodoListParams{
		First:     first,
		After:     after,
		Last:      last,
		Before:    before,
		SortBy:    domain.UserTodoSortByCreatedAt,
		SortOrder: domain.SortOrderDesc,
		Filter:    modelToUserTodoFilter(filter),
		ViewerID:  optionalID(callerID(ctx)),
	}
	if sortBy != nil {
		params.SortBy = *sortBy
	}
	if sortOrder != nil {
		params.SortOrder = *sortOrder
	}
	if includeTotalCount != nil {
		params.IncludeTotalCount = *includeTotalCount
	}

	result, err := r.UserTodoService.ListUserTodos(ctx, params)
	if err != nil {
		return nil, userTodoError(err, "todo")
	}

	return &model.PaginatedUserTodos{
		Items: userTodosToModel(result.Items),
		PageInfo: &model.PageInfo{
			HasNextPage:     result.HasNext,
			HasPreviousPage: result.HasPrev,
			StartCursor:     result.StartCursor,
			EndCursor:       result.EndCursor,
		},
		TotalCount: result.TotalCount,
	}, nil
}

// UserTodoByID is the resolver for the userTodoByID field. It answers null for a
// missing todo and for someone else's PRIVATE todo, so the id isn't confirmed.
func (r *queryResolver) UserTodoByID(ctx context.Context, id string) (*model.UserTodo, error) {
	intID, err := parseIntID("id", id)
	if err != nil {
		return nil, userTodoError(err, "todo")
	}

	todo, err := r.UserTodoService.GetUserTodo(ctx, intID, optionalID(callerID(ctx)))
	if err != nil {
		return nil, userTodoError(err, "todo")
	}
	if todo == nil {
		return nil, nil
	}
	return userTodoDomainToModel(todo), nil
}

// UserTodoLists is the resolver for the userTodoLists field. Private lists come
// back only to their owner.
func (r *queryResolver) UserTodoLists(ctx context.Context, userID int) ([]*model.UserTodoList, error) {
	lists, err := r.UserTodoService.ListUserTodoLists(ctx, userID, optionalID(callerID(ctx)))
	if err != nil {
		return nil, userTodoError(err, "list")
	}
	return userTodoListsToModel(lists), nil
}

// TodoActions is the resolver for the todoActions field: the presets plus the
// caller's own actions, in picker order.
func (r *queryResolver) TodoActions(ctx context.Context) ([]*model.TodoAction, error) {
	authUser, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, fmt.Errorf("access denied: authentication required")
	}
	actions, err := r.UserTodoService.ListTodoActions(ctx, authUser.ID)
	if err != nil {
		return nil, userTodoError(err, "action")
	}
	return todoActionsToModel(actions), nil
}

// CreateUserTodo is the resolver for the createUserTodo field.
func (r *mutationResolver) CreateUserTodo(ctx context.Context, input model.CreateUserTodoInput) (*model.UserTodo, error) {
	authUser, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, fmt.Errorf("access denied: authentication required")
	}
	in, err := modelToCreateUserTodoInput(input)
	if err != nil {
		return nil, userTodoError(err, "todo")
	}

	todo, err := r.UserTodoService.CreateUserTodo(ctx, authUser.ID, in)
	if err != nil {
		return nil, userTodoError(err, "todo")
	}
	return userTodoDomainToModel(todo), nil
}

// UpdateUserTodo is the resolver for the updateUserTodo field. A non-owner gets
// forbidden for a PUBLIC todo and not-found for a PRIVATE one (see the service).
func (r *mutationResolver) UpdateUserTodo(ctx context.Context, input model.UpdateUserTodoInput) (*model.UserTodo, error) {
	authUser, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, fmt.Errorf("access denied: authentication required")
	}
	in, err := modelToUpdateUserTodoInput(input)
	if err != nil {
		return nil, userTodoError(err, "todo")
	}

	todo, err := r.UserTodoService.UpdateUserTodo(ctx, authUser.ID, in)
	if err != nil {
		return nil, userTodoError(err, "todo")
	}
	return userTodoDomainToModel(todo), nil
}

// DeleteUserTodo is the resolver for the deleteUserTodo field.
func (r *mutationResolver) DeleteUserTodo(ctx context.Context, id string) (bool, error) {
	authUser, err := auth.RequireAuth(ctx)
	if err != nil {
		return false, fmt.Errorf("access denied: authentication required")
	}
	intID, err := parseIntID("id", id)
	if err != nil {
		return false, userTodoError(err, "todo")
	}

	if err := r.UserTodoService.DeleteUserTodo(ctx, authUser.ID, intID); err != nil {
		return false, userTodoError(err, "todo")
	}
	return true, nil
}

// CreateTodoAction is the resolver for the createTodoAction field. A duplicate
// key returns the existing action.
func (r *mutationResolver) CreateTodoAction(ctx context.Context, input model.CreateTodoActionInput) (*model.TodoAction, error) {
	authUser, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, fmt.Errorf("access denied: authentication required")
	}

	action, err := r.UserTodoService.CreateTodoAction(ctx, authUser.ID, modelToCreateTodoActionInput(input))
	if err != nil {
		return nil, userTodoError(err, "action")
	}
	return todoActionDomainToModel(action), nil
}

// CreateUserTodoList is the resolver for the createUserTodoList field.
func (r *mutationResolver) CreateUserTodoList(ctx context.Context, input model.CreateUserTodoListInput) (*model.UserTodoList, error) {
	authUser, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, fmt.Errorf("access denied: authentication required")
	}

	list, err := r.UserTodoService.CreateUserTodoList(ctx, authUser.ID, modelToCreateUserTodoListInput(input))
	if err != nil {
		return nil, userTodoError(err, "list")
	}
	return userTodoListDomainToModel(list), nil
}

// UpdateUserTodoList is the resolver for the updateUserTodoList field.
func (r *mutationResolver) UpdateUserTodoList(ctx context.Context, input model.UpdateUserTodoListInput) (*model.UserTodoList, error) {
	authUser, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, fmt.Errorf("access denied: authentication required")
	}

	list, err := r.UserTodoService.UpdateUserTodoList(ctx, authUser.ID, modelToUpdateUserTodoListInput(input))
	if err != nil {
		return nil, userTodoError(err, "list")
	}
	return userTodoListDomainToModel(list), nil
}

// DeleteUserTodoList is the resolver for the deleteUserTodoList field. The
// service unlists the list's todos first; the todos are never deleted.
func (r *mutationResolver) DeleteUserTodoList(ctx context.Context, id string) (bool, error) {
	authUser, err := auth.RequireAuth(ctx)
	if err != nil {
		return false, fmt.Errorf("access denied: authentication required")
	}
	intID, err := parseIntID("id", id)
	if err != nil {
		return false, userTodoError(err, "list")
	}

	if err := r.UserTodoService.DeleteUserTodoList(ctx, authUser.ID, intID); err != nil {
		return false, userTodoError(err, "list")
	}
	return true, nil
}

// ReorderUserTodoList is the resolver for the reorderUserTodoList field.
func (r *mutationResolver) ReorderUserTodoList(ctx context.Context, listID int, todoIds []int) ([]*model.UserTodo, error) {
	authUser, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, fmt.Errorf("access denied: authentication required")
	}

	todos, err := r.UserTodoService.ReorderUserTodoList(ctx, authUser.ID, listID, todoIds)
	if err != nil {
		return nil, userTodoError(err, "list")
	}
	return userTodosToModel(todos), nil
}

// User is the resolver for the user field: batched through the user loader.
func (r *userTodoResolver) User(ctx context.Context, obj *model.UserTodo) (*model.User, error) {
	u, err := r.userByID(ctx, obj.UserID)
	if err != nil {
		return nil, err
	}
	return userDomainToModel(u), nil
}

// Content is the resolver for the content field: batched through the content
// loader. A free-text todo has no content and resolves to null.
func (r *userTodoResolver) Content(ctx context.Context, obj *model.UserTodo) (*model.Content, error) {
	if obj.ContentID == nil {
		return nil, nil
	}
	c, err := r.contentByID(ctx, *obj.ContentID)
	if err != nil || c == nil {
		return nil, err
	}
	return domainToModel(c), nil
}

// Action is the resolver for the action field: batched through the action loader.
func (r *userTodoResolver) Action(ctx context.Context, obj *model.UserTodo) (*model.TodoAction, error) {
	a, err := r.todoActionByID(ctx, obj.ActionID)
	if err != nil {
		return nil, err
	}
	return todoActionDomainToModel(a), nil
}

// List is the resolver for the list field. It is batched through the list
// loader, keyed by the caller, so a PRIVATE list another user owns resolves to
// null rather than leaking its name.
func (r *userTodoResolver) List(ctx context.Context, obj *model.UserTodo) (*model.UserTodoList, error) {
	if obj.ListID == nil {
		return nil, nil
	}
	list, err := r.userTodoListByKey(ctx, dataloader.UserTodoListKey{
		ViewerID: callerID(ctx),
		ListID:   *obj.ListID,
	})
	if err != nil || list == nil {
		return nil, err
	}
	return userTodoListDomainToModel(list), nil
}

// User is the resolver for the user field of a list: batched through the user loader.
func (r *userTodoListResolver) User(ctx context.Context, obj *model.UserTodoList) (*model.User, error) {
	u, err := r.userByID(ctx, obj.UserID)
	if err != nil {
		return nil, err
	}
	return userDomainToModel(u), nil
}

// UserTodo returns generated.UserTodoResolver implementation.
func (r *Resolver) UserTodo() generated.UserTodoResolver { return &userTodoResolver{r} }

// UserTodoList returns generated.UserTodoListResolver implementation.
func (r *Resolver) UserTodoList() generated.UserTodoListResolver {
	return &userTodoListResolver{r}
}

type userTodoResolver struct{ *Resolver }
type userTodoListResolver struct{ *Resolver }

// callerID returns the authenticated caller's local user id, or 0 when the
// request is anonymous.
func callerID(ctx context.Context) int {
	if v, ok := auth.ForContext(ctx); ok {
		return v.ID
	}
	return 0
}

// optionalID turns a caller id into the service's nil-means-anonymous form.
func optionalID(id int) *int {
	if id == 0 {
		return nil
	}
	return &id
}

// userTodoError maps a service or input error to the client-facing error. what
// names the thing the operation was about ("todo", "list", "action") so the
// messages read the same as the perspective resolvers'.
func userTodoError(err error, what string) error {
	switch {
	case errors.Is(err, domain.ErrForbidden):
		return fmt.Errorf("access denied: you can only modify your own %ss", what)
	case errors.Is(err, domain.ErrNotFound):
		return fmt.Errorf("%s not found", what)
	case errors.Is(err, domain.ErrInvalidRating):
		return fmt.Errorf("invalid rating: %w", err)
	case errors.Is(err, domain.ErrInvalidPercent):
		return fmt.Errorf("invalid percent complete: %w", err)
	case errors.Is(err, domain.ErrAlreadyExists):
		return fmt.Errorf("already exists: %w", err)
	case errors.Is(err, domain.ErrInvalidInput):
		return fmt.Errorf("invalid input: %w", err)
	}
	slog.Error("user todo operation failed", "what", what, "error", err)
	return fmt.Errorf("failed to process %s", what)
}
