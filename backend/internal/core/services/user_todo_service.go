package services

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

const (
	userTodoNameMaxLen     = 255 // user_todos.name is varchar(255)
	userTodoListNameMaxLen = 100 // user_todo_lists.name is varchar(100)
	todoActionLabelMaxLen  = 50
)

// UserTodoService implements the plan: todos, their named lists and the action
// picker. Writes take the actor's id and check ownership here, and the
// repositories repeat the check in their owner-scoped SQL.
type UserTodoService struct {
	todos   repositories.UserTodoRepository
	lists   repositories.UserTodoListRepository
	actions repositories.TodoActionRepository
}

// Compile-time interface check
var _ portservices.UserTodoService = (*UserTodoService)(nil)

// NewUserTodoService creates a new user todo service
func NewUserTodoService(
	todos repositories.UserTodoRepository,
	lists repositories.UserTodoListRepository,
	actions repositories.TodoActionRepository,
) *UserTodoService {
	return &UserTodoService{todos: todos, lists: lists, actions: actions}
}

// ListUserTodos returns one page of todos visible to the viewer: public rows
// plus the viewer's own. Always privacy-filtered; there is no unfiltered read.
func (s *UserTodoService) ListUserTodos(ctx context.Context, params domain.UserTodoListParams) (*domain.PaginatedUserTodos, error) {
	if params.First != nil && (*params.First < 1 || *params.First > 100) {
		return nil, fmt.Errorf("%w: first must be between 1 and 100", domain.ErrInvalidInput)
	}
	if params.Last != nil && (*params.Last < 1 || *params.Last > 100) {
		return nil, fmt.Errorf("%w: last must be between 1 and 100", domain.ErrInvalidInput)
	}

	// Filtering by someone else's private list answers like a missing list
	// (an empty page), so membership of their public todos isn't revealed.
	if params.Filter != nil && params.Filter.ListID != nil {
		list, err := s.lists.GetByID(ctx, *params.Filter.ListID)
		if err != nil && !errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("failed to get user todo list: %w", err)
		}
		hidden := list != nil && list.Privacy == domain.PrivacyPrivate &&
			(params.ViewerID == nil || *params.ViewerID != list.UserID)
		if err != nil || hidden {
			return emptyUserTodoPage(params.IncludeTotalCount), nil
		}
	}

	params.RestrictToPublicOrOwner = true
	result, err := s.todos.List(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("failed to list user todos: %w", err)
	}
	return result, nil
}

// GetUserTodo returns the todo, or (nil, nil) when it doesn't exist or is
// private to someone other than the viewer. A hidden row answers like a
// missing one, so the id isn't confirmed.
func (s *UserTodoService) GetUserTodo(ctx context.Context, id int, viewerID *int) (*domain.UserTodo, error) {
	if id <= 0 {
		return nil, fmt.Errorf("%w: todo id must be a positive integer", domain.ErrInvalidInput)
	}

	todo, err := s.todos.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get user todo: %w", err)
	}
	if !canViewUserTodoRow(todo.Privacy, todo.UserID, viewerID) {
		return nil, nil
	}
	return todo, nil
}

// CreateUserTodo creates a todo owned by actorUserID. Privacy defaults to
// PUBLIC and status to NOT_STARTED. Comments are sanitized. A list assignment
// appends the todo to that list.
func (s *UserTodoService) CreateUserTodo(ctx context.Context, actorUserID int, input domain.CreateUserTodoInput) (*domain.UserTodo, error) {
	if actorUserID <= 0 {
		return nil, fmt.Errorf("%w: authentication required to create a todo", domain.ErrForbidden)
	}

	todo := &domain.UserTodo{
		UserID:          actorUserID,
		ContentID:       input.ContentID,
		Name:            normalizeTodoName(input.Name),
		ActionID:        input.ActionID,
		Priority:        input.Priority,
		Status:          domain.UserTodoStatusNotStarted,
		PercentComplete: 0,
		StartDate:       dateOnly(input.StartDate),
		EndDate:         dateOnly(input.EndDate),
		DueDate:         dateOnly(input.DueDate),
		Comments:        sanitizeTodoComments(input.Comments),
		Privacy:         domain.PrivacyPublic,
	}
	if input.Status != nil {
		todo.Status = *input.Status
	}
	if input.PercentComplete != nil {
		todo.PercentComplete = *input.PercentComplete
	}
	if input.Privacy != nil {
		todo.Privacy = *input.Privacy
	}

	if err := validateUserTodo(todo); err != nil {
		return nil, err
	}
	if err := s.requireUsableAction(ctx, actorUserID, todo.ActionID); err != nil {
		return nil, err
	}
	if input.ListID != nil {
		if err := s.placeInList(ctx, actorUserID, todo, *input.ListID); err != nil {
			return nil, err
		}
	}
	applyStatusStartDate(todo, false, time.Now().UTC())

	created, err := s.todos.Create(ctx, todo)
	if err != nil {
		return nil, fmt.Errorf("failed to create user todo: %w", err)
	}
	return created, nil
}

// UpdateUserTodo merges input onto the stored todo. Only the owner may update
// it. Someone else's PUBLIC todo is ErrForbidden, and their PRIVATE one is
// ErrNotFound. Status, percent and done are independent: setting one never
// changes the other.
func (s *UserTodoService) UpdateUserTodo(ctx context.Context, actorUserID int, input domain.UpdateUserTodoInput) (*domain.UserTodo, error) {
	if actorUserID <= 0 {
		return nil, fmt.Errorf("%w: authentication required to update a todo", domain.ErrForbidden)
	}
	if input.ID <= 0 {
		return nil, fmt.Errorf("%w: todo id must be a positive integer", domain.ErrInvalidInput)
	}

	existing, err := s.todos.GetByID(ctx, input.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user todo: %w", err)
	}
	if existing.UserID != actorUserID {
		return nil, notOwnedUserTodoError(existing.Privacy)
	}

	todo := *existing
	mergeUserTodoUpdate(&todo, input)

	if err := validateUserTodo(&todo); err != nil {
		return nil, err
	}
	if input.ActionID != nil && *input.ActionID != existing.ActionID {
		if err := s.requireUsableAction(ctx, actorUserID, todo.ActionID); err != nil {
			return nil, err
		}
	}
	if input.ClearListID {
		todo.ListID = nil
		todo.ListPosition = nil
	} else if input.ListID != nil && (existing.ListID == nil || *existing.ListID != *input.ListID) {
		if err := s.placeInList(ctx, actorUserID, &todo, *input.ListID); err != nil {
			return nil, err
		}
	}
	applyStatusStartDate(&todo, existing.Status == domain.UserTodoStatusInProgress, time.Now().UTC())

	updated, err := s.todos.Update(ctx, &todo, actorUserID)
	if err != nil {
		if errors.Is(err, domain.ErrForbidden) {
			return nil, notOwnedUserTodoError(existing.Privacy)
		}
		return nil, fmt.Errorf("failed to update user todo: %w", err)
	}
	return updated, nil
}

// DeleteUserTodo removes a todo the actor owns. The owner-scoped DELETE does the
// check; only a refused delete reads the row, to choose between forbidden and
// not found.
func (s *UserTodoService) DeleteUserTodo(ctx context.Context, actorUserID, id int) error {
	if actorUserID <= 0 {
		return fmt.Errorf("%w: authentication required to delete a todo", domain.ErrForbidden)
	}
	if id <= 0 {
		return fmt.Errorf("%w: todo id must be a positive integer", domain.ErrInvalidInput)
	}

	err := s.todos.Delete(ctx, id, actorUserID)
	if err == nil {
		return nil
	}
	if !errors.Is(err, domain.ErrForbidden) {
		return fmt.Errorf("failed to delete user todo: %w", err)
	}
	existing, getErr := s.todos.GetByID(ctx, id)
	if getErr != nil {
		return fmt.Errorf("failed to get user todo: %w", getErr)
	}
	return notOwnedUserTodoError(existing.Privacy)
}

// ListTodoActions returns the presets plus the actor's own actions, in picker order.
func (s *UserTodoService) ListTodoActions(ctx context.Context, actorUserID int) ([]*domain.TodoAction, error) {
	if actorUserID <= 0 {
		return nil, fmt.Errorf("%w: authentication required to list todo actions", domain.ErrForbidden)
	}
	actions, err := s.actions.ListForUser(ctx, actorUserID)
	if err != nil {
		return nil, fmt.Errorf("failed to list todo actions: %w", err)
	}
	return actions, nil
}

// CreateTodoAction adds an action the actor entered. The key is the label,
// lowercased with runs of whitespace collapsed. A preset with that key wins,
// then the actor's own action with that key. Either one is returned as is, so
// a duplicate never creates a second row.
func (s *UserTodoService) CreateTodoAction(ctx context.Context, actorUserID int, input domain.CreateTodoActionInput) (*domain.TodoAction, error) {
	if actorUserID <= 0 {
		return nil, fmt.Errorf("%w: authentication required to create a todo action", domain.ErrForbidden)
	}
	label := strings.TrimSpace(input.Label)
	if label == "" {
		return nil, fmt.Errorf("%w: action label is required", domain.ErrInvalidInput)
	}
	if utf8.RuneCountInString(label) > todoActionLabelMaxLen {
		return nil, fmt.Errorf("%w: action label must be %d characters or less", domain.ErrInvalidInput, todoActionLabelMaxLen)
	}
	key := todoActionKey(label)

	if existing, err := s.lookupTodoActionByKey(ctx, nil, key); err != nil || existing != nil {
		return existing, err
	}
	owner := actorUserID
	if existing, err := s.lookupTodoActionByKey(ctx, &owner, key); err != nil || existing != nil {
		return existing, err
	}

	created, err := s.actions.Create(ctx, &domain.TodoAction{
		Key:         key,
		Label:       label,
		Description: strings.TrimSpace(input.Description),
		UserID:      &owner,
	})
	if err != nil {
		if errors.Is(err, domain.ErrAlreadyExists) {
			// A concurrent request created the same key first; return that row.
			existing, getErr := s.lookupTodoActionByKey(ctx, &owner, key)
			if getErr != nil {
				return nil, getErr
			}
			if existing != nil {
				return existing, nil
			}
		}
		return nil, fmt.Errorf("failed to create todo action: %w", err)
	}
	return created, nil
}

// GetTodoActionsByIDs fetches actions in one batch for the dataloader. Actions
// are not privacy-filtered: a custom action is only ever reached through a todo
// the viewer can already see. Non-positive ids are dropped.
func (s *UserTodoService) GetTodoActionsByIDs(ctx context.Context, ids []int) ([]*domain.TodoAction, error) {
	valid := positiveIDs(ids)
	actions, err := s.actions.GetByIDs(ctx, valid)
	if err != nil {
		return nil, fmt.Errorf("failed to get todo actions: %w", err)
	}
	return actions, nil
}

// ListUserTodoLists returns the owner's lists. Private lists come back only to
// the owner.
func (s *UserTodoService) ListUserTodoLists(ctx context.Context, ownerUserID int, viewerID *int) ([]*domain.UserTodoList, error) {
	if ownerUserID <= 0 {
		return nil, fmt.Errorf("%w: user id must be a positive integer", domain.ErrInvalidInput)
	}
	includePrivate := viewerID != nil && *viewerID == ownerUserID
	lists, err := s.lists.ListByUser(ctx, ownerUserID, includePrivate)
	if err != nil {
		return nil, fmt.Errorf("failed to list user todo lists: %w", err)
	}
	return lists, nil
}

// GetUserTodoListsByIDs fetches lists in one batch for the dataloader and
// drops any private list the viewer doesn't own.
func (s *UserTodoService) GetUserTodoListsByIDs(ctx context.Context, ids []int, viewerID *int) ([]*domain.UserTodoList, error) {
	lists, err := s.lists.GetByIDs(ctx, positiveIDs(ids))
	if err != nil {
		return nil, fmt.Errorf("failed to get user todo lists: %w", err)
	}
	visible := make([]*domain.UserTodoList, 0, len(lists))
	for _, l := range lists {
		if canViewUserTodoRow(l.Privacy, l.UserID, viewerID) {
			visible = append(visible, l)
		}
	}
	return visible, nil
}

// CreateUserTodoList creates a list owned by actorUserID. Privacy defaults to PUBLIC.
func (s *UserTodoService) CreateUserTodoList(ctx context.Context, actorUserID int, input domain.CreateUserTodoListInput) (*domain.UserTodoList, error) {
	if actorUserID <= 0 {
		return nil, fmt.Errorf("%w: authentication required to create a list", domain.ErrForbidden)
	}
	name, err := normalizeUserTodoListName(input.Name)
	if err != nil {
		return nil, err
	}
	privacy := domain.PrivacyPublic
	if input.Privacy != nil {
		privacy = *input.Privacy
	}

	created, err := s.lists.Create(ctx, &domain.UserTodoList{
		UserID:      actorUserID,
		Name:        name,
		Description: input.Description,
		Privacy:     privacy,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create user todo list: %w", err)
	}
	return created, nil
}

// UpdateUserTodoList merges input onto the stored list. Ownership rules match
// UpdateUserTodo.
func (s *UserTodoService) UpdateUserTodoList(ctx context.Context, actorUserID int, input domain.UpdateUserTodoListInput) (*domain.UserTodoList, error) {
	if actorUserID <= 0 {
		return nil, fmt.Errorf("%w: authentication required to update a list", domain.ErrForbidden)
	}
	if input.ID <= 0 {
		return nil, fmt.Errorf("%w: list id must be a positive integer", domain.ErrInvalidInput)
	}

	existing, err := s.lists.GetByID(ctx, input.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user todo list: %w", err)
	}
	if existing.UserID != actorUserID {
		return nil, notOwnedUserTodoError(existing.Privacy)
	}

	list := *existing
	if input.Name != nil {
		name, err := normalizeUserTodoListName(*input.Name)
		if err != nil {
			return nil, err
		}
		list.Name = name
	}
	if input.ClearDescription {
		list.Description = nil
	} else if input.Description != nil {
		d := *input.Description
		list.Description = &d
	}
	if input.Privacy != nil {
		list.Privacy = *input.Privacy
	}

	updated, err := s.lists.Update(ctx, &list, actorUserID)
	if err != nil {
		if errors.Is(err, domain.ErrForbidden) {
			return nil, notOwnedUserTodoError(existing.Privacy)
		}
		return nil, fmt.Errorf("failed to update user todo list: %w", err)
	}
	return updated, nil
}

// DeleteUserTodoList unlists the list's todos, then deletes the list. The list
// FK blocks deletion while todos reference it, so todos are unlisted rather
// than deleted. Both steps are owner-scoped.
func (s *UserTodoService) DeleteUserTodoList(ctx context.Context, actorUserID, id int) error {
	if actorUserID <= 0 {
		return fmt.Errorf("%w: authentication required to delete a list", domain.ErrForbidden)
	}
	if id <= 0 {
		return fmt.Errorf("%w: list id must be a positive integer", domain.ErrInvalidInput)
	}

	if err := s.todos.UnlistAll(ctx, id, actorUserID); err != nil {
		return fmt.Errorf("failed to unlist user todos: %w", err)
	}
	err := s.lists.Delete(ctx, id, actorUserID)
	if err == nil {
		return nil
	}
	if !errors.Is(err, domain.ErrForbidden) {
		return fmt.Errorf("failed to delete user todo list: %w", err)
	}
	existing, getErr := s.lists.GetByID(ctx, id)
	if getErr != nil {
		return fmt.Errorf("failed to get user todo list: %w", getErr)
	}
	return notOwnedUserTodoError(existing.Privacy)
}

// ReorderUserTodoList rewrites the positions of listID to 1..N in the order of
// todoIDs. The ids must be positive, non-empty and unique. The actor must own the list.
func (s *UserTodoService) ReorderUserTodoList(ctx context.Context, actorUserID, listID int, todoIDs []int) ([]*domain.UserTodo, error) {
	if actorUserID <= 0 {
		return nil, fmt.Errorf("%w: authentication required to reorder a list", domain.ErrForbidden)
	}
	if listID <= 0 {
		return nil, fmt.Errorf("%w: list id must be a positive integer", domain.ErrInvalidInput)
	}
	if len(todoIDs) == 0 {
		return nil, fmt.Errorf("%w: todoIds must not be empty", domain.ErrInvalidInput)
	}
	seen := make(map[int]bool, len(todoIDs))
	for _, id := range todoIDs {
		if id <= 0 {
			return nil, fmt.Errorf("%w: todo id %d must be a positive integer", domain.ErrInvalidInput, id)
		}
		if seen[id] {
			return nil, fmt.Errorf("%w: todo id %d appears more than once", domain.ErrInvalidInput, id)
		}
		seen[id] = true
	}

	list, err := s.lists.GetByID(ctx, listID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user todo list: %w", err)
	}
	if list.UserID != actorUserID {
		return nil, notOwnedUserTodoError(list.Privacy)
	}

	reordered, err := s.todos.Reorder(ctx, listID, todoIDs, actorUserID)
	if err != nil {
		return nil, fmt.Errorf("failed to reorder user todos: %w", err)
	}
	return reordered, nil
}

// --- helpers -----------------------------------------------------------------

// canViewUserTodoRow reports whether a todo or list is visible: PUBLIC rows are
// visible to everyone, PRIVATE rows only to their owner.
func canViewUserTodoRow(privacy domain.Privacy, ownerID int, viewerID *int) bool {
	return privacy == domain.PrivacyPublic || (viewerID != nil && *viewerID == ownerID)
}

// notOwnedUserTodoError answers a write on a row the actor doesn't own. A PUBLIC
// row is visible to the actor, so the refusal is ErrForbidden. A PRIVATE row
// answers ErrNotFound, so its id isn't confirmed to exist.
// emptyUserTodoPage is the page returned for a list the viewer may not see.
func emptyUserTodoPage(includeTotalCount bool) *domain.PaginatedUserTodos {
	page := &domain.PaginatedUserTodos{Items: []*domain.UserTodo{}}
	if includeTotalCount {
		zero := 0
		page.TotalCount = &zero
	}
	return page
}

func notOwnedUserTodoError(privacy domain.Privacy) error {
	if privacy == domain.PrivacyPublic {
		return fmt.Errorf("%w: you can only modify your own items", domain.ErrForbidden)
	}
	return domain.ErrNotFound
}

// mergeUserTodoUpdate applies the set fields of input onto todo. Nil fields are
// left alone; Clear* fields reset their paired value. Text and dates are
// normalized here, so validation sees the final state.
func mergeUserTodoUpdate(todo *domain.UserTodo, input domain.UpdateUserTodoInput) {
	if input.ClearContentID {
		todo.ContentID = nil
	} else if input.ContentID != nil {
		todo.ContentID = input.ContentID
	}
	if input.ClearName {
		todo.Name = nil
	} else if input.Name != nil {
		todo.Name = normalizeTodoName(input.Name)
	}
	if input.ActionID != nil {
		todo.ActionID = *input.ActionID
	}
	if input.ClearPriority {
		todo.Priority = nil
	} else if input.Priority != nil {
		todo.Priority = input.Priority
	}
	if input.Status != nil {
		todo.Status = *input.Status
	}
	if input.PercentComplete != nil {
		todo.PercentComplete = *input.PercentComplete
	}
	if input.ClearStartDate {
		todo.StartDate = nil
	} else if input.StartDate != nil {
		todo.StartDate = dateOnly(input.StartDate)
	}
	if input.ClearEndDate {
		todo.EndDate = nil
	} else if input.EndDate != nil {
		todo.EndDate = dateOnly(input.EndDate)
	}
	if input.ClearDueDate {
		todo.DueDate = nil
	} else if input.DueDate != nil {
		todo.DueDate = dateOnly(input.DueDate)
	}
	if input.ClearComments {
		todo.Comments = nil
	} else if input.Comments != nil {
		todo.Comments = sanitizeTodoComments(input.Comments)
	}
	if input.Privacy != nil {
		todo.Privacy = *input.Privacy
	}
}

// validateUserTodo checks the rules that need no lookup: rating and percent
// ranges, a known status, content-or-name, and the name length.
func validateUserTodo(todo *domain.UserTodo) error {
	if !domain.ValidateRating(todo.Priority) {
		return fmt.Errorf("%w: priority %d", domain.ErrInvalidRating, *todo.Priority)
	}
	if todo.PercentComplete < 0 || todo.PercentComplete > 100 {
		return fmt.Errorf("%w: percent complete %d", domain.ErrInvalidPercent, todo.PercentComplete)
	}
	if !isKnownUserTodoStatus(todo.Status) {
		return fmt.Errorf("%w: unknown status %q", domain.ErrInvalidInput, todo.Status)
	}
	if todo.ContentID == nil && todo.Name == nil {
		return fmt.Errorf("%w: a todo needs content or a name", domain.ErrInvalidInput)
	}
	if todo.Name != nil && utf8.RuneCountInString(*todo.Name) > userTodoNameMaxLen {
		return fmt.Errorf("%w: name must be %d characters or less", domain.ErrInvalidInput, userTodoNameMaxLen)
	}
	return nil
}

// isKnownUserTodoStatus reports whether status is one of the four statuses.
func isKnownUserTodoStatus(status domain.UserTodoStatus) bool {
	for _, known := range []domain.UserTodoStatus{
		domain.UserTodoStatusNotStarted,
		domain.UserTodoStatusInProgress,
		domain.UserTodoStatusDone,
		domain.UserTodoStatusDropped,
	} {
		if status == known {
			return true
		}
	}
	return false
}

// applyStatusStartDate fills start_date with today (UTC) when the todo has just
// become IN_PROGRESS and has no start date. wasInProgress is the status before
// this write; an already in-progress todo keeps whatever start date it has.
func applyStatusStartDate(todo *domain.UserTodo, wasInProgress bool, now time.Time) {
	if todo.Status != domain.UserTodoStatusInProgress || wasInProgress || todo.StartDate != nil {
		return
	}
	today := dateOnly(&now)
	todo.StartDate = today
}

// requireUsableAction checks that the action exists and is a preset or the
// actor's own. A missing action and someone else's custom action both answer
// ErrInvalidInput.
func (s *UserTodoService) requireUsableAction(ctx context.Context, actorUserID, actionID int) error {
	action, err := s.actions.GetByID(ctx, actionID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return fmt.Errorf("%w: action %d not found", domain.ErrInvalidInput, actionID)
		}
		return fmt.Errorf("failed to get todo action: %w", err)
	}
	if action.UserID != nil && *action.UserID != actorUserID {
		return fmt.Errorf("%w: action %d not found", domain.ErrInvalidInput, actionID)
	}
	return nil
}

// placeInList assigns todo to listID and appends it at the end of that list.
// The actor must own the list. Someone else's PUBLIC list is ErrForbidden and
// their PRIVATE one is ErrNotFound, so a private list id isn't confirmed to
// exist; a missing list is ErrNotFound.
func (s *UserTodoService) placeInList(ctx context.Context, actorUserID int, todo *domain.UserTodo, listID int) error {
	list, err := s.lists.GetByID(ctx, listID)
	if err != nil {
		return fmt.Errorf("failed to get user todo list: %w", err)
	}
	if list.UserID != actorUserID {
		return notOwnedUserTodoError(list.Privacy)
	}
	position, err := s.todos.NextListPosition(ctx, listID)
	if err != nil {
		return fmt.Errorf("failed to get next list position: %w", err)
	}
	todo.ListID = &listID
	todo.ListPosition = &position
	return nil
}

// lookupTodoActionByKey returns the action with key, or nil when there is none.
// A nil ownerID looks up presets.
func (s *UserTodoService) lookupTodoActionByKey(ctx context.Context, ownerID *int, key string) (*domain.TodoAction, error) {
	action, err := s.actions.GetByKey(ctx, ownerID, key)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to look up todo action: %w", err)
	}
	return action, nil
}

// todoActionKey is the stable machine key for a label: lowercase, with runs of
// whitespace collapsed to one space.
func todoActionKey(label string) string {
	return strings.ToLower(strings.Join(strings.Fields(label), " "))
}

// normalizeTodoName trims the name. A blank name becomes nil.
func normalizeTodoName(name *string) *string {
	if name == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*name)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

// normalizeUserTodoListName trims a list name and checks its length.
func normalizeUserTodoListName(name string) (string, error) {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return "", fmt.Errorf("%w: list name is required", domain.ErrInvalidInput)
	}
	if utf8.RuneCountInString(trimmed) > userTodoListNameMaxLen {
		return "", fmt.Errorf("%w: list name must be %d characters or less", domain.ErrInvalidInput, userTodoListNameMaxLen)
	}
	return trimmed, nil
}

// sanitizeTodoComments runs the comments through the review policy. Comments
// that are blank after sanitizing are stored as nil.
func sanitizeTodoComments(comments *string) *string {
	if comments == nil {
		return nil
	}
	clean := sanitizeReview(*comments)
	if strings.TrimSpace(clean) == "" {
		return nil
	}
	return &clean
}

// dateOnly keeps the calendar date of t and drops the time of day. Date
// columns store the day the caller meant. A nil t stays nil.
func dateOnly(t *time.Time) *time.Time {
	if t == nil {
		return nil
	}
	y, m, d := t.Date()
	out := time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
	return &out
}

// positiveIDs drops ids that are not positive. Batch lookups never query for
// an impossible id.
func positiveIDs(ids []int) []int {
	valid := make([]int, 0, len(ids))
	for _, id := range ids {
		if id > 0 {
			valid = append(valid, id)
		}
	}
	return valid
}
