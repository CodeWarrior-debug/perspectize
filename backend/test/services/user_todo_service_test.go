package services_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- hand-written mocks -------------------------------------------------------

// mockUserTodoRepo implements repositories.UserTodoRepository. A nil fn gives a
// harmless default; GetByID with no fn reports not found.
type mockUserTodoRepo struct {
	listFn             func(ctx context.Context, params domain.UserTodoListParams) (*domain.PaginatedUserTodos, error)
	getByIDFn          func(ctx context.Context, id int) (*domain.UserTodo, error)
	createFn           func(ctx context.Context, todo *domain.UserTodo) (*domain.UserTodo, error)
	updateFn           func(ctx context.Context, todo *domain.UserTodo, actorUserID int) (*domain.UserTodo, error)
	deleteFn           func(ctx context.Context, id int, actorUserID int) error
	nextListPositionFn func(ctx context.Context, listID int) (int, error)
	unlistAllFn        func(ctx context.Context, listID int, actorUserID int) error
	reorderFn          func(ctx context.Context, listID int, todoIDs []int, actorUserID int) ([]*domain.UserTodo, error)
	reassignByUserFn   func(ctx context.Context, fromUserID, toUserID int) error

	// calls records method names in order, for ordering assertions.
	calls *[]string
}

var _ repositories.UserTodoRepository = (*mockUserTodoRepo)(nil)

func (m *mockUserTodoRepo) record(name string) {
	if m.calls != nil {
		*m.calls = append(*m.calls, name)
	}
}

func (m *mockUserTodoRepo) List(ctx context.Context, params domain.UserTodoListParams) (*domain.PaginatedUserTodos, error) {
	m.record("todos.list")
	if m.listFn != nil {
		return m.listFn(ctx, params)
	}
	return &domain.PaginatedUserTodos{Items: []*domain.UserTodo{}}, nil
}

func (m *mockUserTodoRepo) GetByID(ctx context.Context, id int) (*domain.UserTodo, error) {
	m.record("todos.get")
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, id)
	}
	return nil, domain.ErrNotFound
}

func (m *mockUserTodoRepo) GetByIDs(ctx context.Context, ids []int) ([]*domain.UserTodo, error) {
	return []*domain.UserTodo{}, nil
}

func (m *mockUserTodoRepo) Create(ctx context.Context, todo *domain.UserTodo) (*domain.UserTodo, error) {
	m.record("todos.create")
	if m.createFn != nil {
		return m.createFn(ctx, todo)
	}
	created := *todo
	created.ID = 100
	return &created, nil
}

func (m *mockUserTodoRepo) Update(ctx context.Context, todo *domain.UserTodo, actorUserID int) (*domain.UserTodo, error) {
	m.record("todos.update")
	if m.updateFn != nil {
		return m.updateFn(ctx, todo, actorUserID)
	}
	return todo, nil
}

func (m *mockUserTodoRepo) Delete(ctx context.Context, id int, actorUserID int) error {
	m.record("todos.delete")
	if m.deleteFn != nil {
		return m.deleteFn(ctx, id, actorUserID)
	}
	return nil
}

func (m *mockUserTodoRepo) NextListPosition(ctx context.Context, listID int) (int, error) {
	m.record("todos.nextPosition")
	if m.nextListPositionFn != nil {
		return m.nextListPositionFn(ctx, listID)
	}
	return 1, nil
}

func (m *mockUserTodoRepo) UnlistAll(ctx context.Context, listID int, actorUserID int) error {
	m.record("todos.unlistAll")
	if m.unlistAllFn != nil {
		return m.unlistAllFn(ctx, listID, actorUserID)
	}
	return nil
}

func (m *mockUserTodoRepo) Reorder(ctx context.Context, listID int, todoIDs []int, actorUserID int) ([]*domain.UserTodo, error) {
	m.record("todos.reorder")
	if m.reorderFn != nil {
		return m.reorderFn(ctx, listID, todoIDs, actorUserID)
	}
	return []*domain.UserTodo{}, nil
}

func (m *mockUserTodoRepo) ReassignByUser(ctx context.Context, fromUserID, toUserID int) error {
	m.record("todos.reassign")
	if m.reassignByUserFn != nil {
		return m.reassignByUserFn(ctx, fromUserID, toUserID)
	}
	return nil
}

// mockUserTodoListRepo implements repositories.UserTodoListRepository.
type mockUserTodoListRepo struct {
	listByUserFn     func(ctx context.Context, userID int, includePrivate bool) ([]*domain.UserTodoList, error)
	getByIDFn        func(ctx context.Context, id int) (*domain.UserTodoList, error)
	getByIDsFn       func(ctx context.Context, ids []int) ([]*domain.UserTodoList, error)
	createFn         func(ctx context.Context, list *domain.UserTodoList) (*domain.UserTodoList, error)
	updateFn         func(ctx context.Context, list *domain.UserTodoList, actorUserID int) (*domain.UserTodoList, error)
	deleteFn         func(ctx context.Context, id int, actorUserID int) error
	reassignByUserFn func(ctx context.Context, fromUserID, toUserID int) error

	calls *[]string
}

var _ repositories.UserTodoListRepository = (*mockUserTodoListRepo)(nil)

func (m *mockUserTodoListRepo) record(name string) {
	if m.calls != nil {
		*m.calls = append(*m.calls, name)
	}
}

func (m *mockUserTodoListRepo) ListByUser(ctx context.Context, userID int, includePrivate bool) ([]*domain.UserTodoList, error) {
	if m.listByUserFn != nil {
		return m.listByUserFn(ctx, userID, includePrivate)
	}
	return []*domain.UserTodoList{}, nil
}

func (m *mockUserTodoListRepo) GetByID(ctx context.Context, id int) (*domain.UserTodoList, error) {
	m.record("lists.get")
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, id)
	}
	return nil, domain.ErrNotFound
}

func (m *mockUserTodoListRepo) GetByIDs(ctx context.Context, ids []int) ([]*domain.UserTodoList, error) {
	if m.getByIDsFn != nil {
		return m.getByIDsFn(ctx, ids)
	}
	return []*domain.UserTodoList{}, nil
}

func (m *mockUserTodoListRepo) Create(ctx context.Context, list *domain.UserTodoList) (*domain.UserTodoList, error) {
	m.record("lists.create")
	if m.createFn != nil {
		return m.createFn(ctx, list)
	}
	created := *list
	created.ID = 200
	return &created, nil
}

func (m *mockUserTodoListRepo) Update(ctx context.Context, list *domain.UserTodoList, actorUserID int) (*domain.UserTodoList, error) {
	m.record("lists.update")
	if m.updateFn != nil {
		return m.updateFn(ctx, list, actorUserID)
	}
	return list, nil
}

func (m *mockUserTodoListRepo) Delete(ctx context.Context, id int, actorUserID int) error {
	m.record("lists.delete")
	if m.deleteFn != nil {
		return m.deleteFn(ctx, id, actorUserID)
	}
	return nil
}

func (m *mockUserTodoListRepo) ReassignByUser(ctx context.Context, fromUserID, toUserID int) error {
	m.record("lists.reassign")
	if m.reassignByUserFn != nil {
		return m.reassignByUserFn(ctx, fromUserID, toUserID)
	}
	return nil
}

// mockTodoActionRepo implements repositories.TodoActionRepository. By default
// it holds one preset, "consume" (id 2), and nothing else.
type mockTodoActionRepo struct {
	getByIDFn        func(ctx context.Context, id int) (*domain.TodoAction, error)
	getByIDsFn       func(ctx context.Context, ids []int) ([]*domain.TodoAction, error)
	listForUserFn    func(ctx context.Context, userID int) ([]*domain.TodoAction, error)
	getByKeyFn       func(ctx context.Context, userID *int, key string) (*domain.TodoAction, error)
	createFn         func(ctx context.Context, action *domain.TodoAction) (*domain.TodoAction, error)
	reassignByUserFn func(ctx context.Context, fromUserID, toUserID int) error

	calls *[]string
}

var _ repositories.TodoActionRepository = (*mockTodoActionRepo)(nil)

var todoPresetConsume = &domain.TodoAction{ID: 2, Key: "consume", Label: "Consume", TypicalSequence: intPtr(2)}

func (m *mockTodoActionRepo) record(name string) {
	if m.calls != nil {
		*m.calls = append(*m.calls, name)
	}
}

func (m *mockTodoActionRepo) GetByID(ctx context.Context, id int) (*domain.TodoAction, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, id)
	}
	if id == todoPresetConsume.ID {
		return todoPresetConsume, nil
	}
	return nil, domain.ErrNotFound
}

func (m *mockTodoActionRepo) GetByIDs(ctx context.Context, ids []int) ([]*domain.TodoAction, error) {
	if m.getByIDsFn != nil {
		return m.getByIDsFn(ctx, ids)
	}
	return []*domain.TodoAction{}, nil
}

func (m *mockTodoActionRepo) ListForUser(ctx context.Context, userID int) ([]*domain.TodoAction, error) {
	if m.listForUserFn != nil {
		return m.listForUserFn(ctx, userID)
	}
	return []*domain.TodoAction{todoPresetConsume}, nil
}

func (m *mockTodoActionRepo) GetByKey(ctx context.Context, userID *int, key string) (*domain.TodoAction, error) {
	m.record("actions.getByKey")
	if m.getByKeyFn != nil {
		return m.getByKeyFn(ctx, userID, key)
	}
	if userID == nil && key == todoPresetConsume.Key {
		return todoPresetConsume, nil
	}
	return nil, domain.ErrNotFound
}

func (m *mockTodoActionRepo) Create(ctx context.Context, action *domain.TodoAction) (*domain.TodoAction, error) {
	m.record("actions.create")
	if m.createFn != nil {
		return m.createFn(ctx, action)
	}
	created := *action
	created.ID = 50
	return &created, nil
}

func (m *mockTodoActionRepo) ReassignByUser(ctx context.Context, fromUserID, toUserID int) error {
	m.record("actions.reassign")
	if m.reassignByUserFn != nil {
		return m.reassignByUserFn(ctx, fromUserID, toUserID)
	}
	return nil
}

// --- helpers ------------------------------------------------------------------

const (
	todoActor = 7 // the signed-in user in these tests
	todoOther = 9 // someone else
)

func todoPrivacyP(p domain.Privacy) *domain.Privacy { return &p }
func todoStatusP(s domain.UserTodoStatus) *domain.UserTodoStatus {
	return &s
}
func todoTimeP(t time.Time) *time.Time { return &t }

// todoUTCDate is the UTC calendar day of now at midnight, the value a
// start-date fill must produce.
func todoUTCDate(now time.Time) time.Time {
	u := now.UTC()
	return time.Date(u.Year(), u.Month(), u.Day(), 0, 0, 0, 0, time.UTC)
}

// ownedTodo returns a stored todo owned by owner with the given privacy.
func ownedTodo(owner int, privacy domain.Privacy) *domain.UserTodo {
	return &domain.UserTodo{
		ID:              10,
		UserID:          owner,
		ContentID:       intPtr(5),
		ActionID:        todoPresetConsume.ID,
		Status:          domain.UserTodoStatusNotStarted,
		PercentComplete: 40,
		Privacy:         privacy,
	}
}

// ownedList returns a stored list owned by owner with the given privacy.
func ownedList(owner int, privacy domain.Privacy) *domain.UserTodoList {
	return &domain.UserTodoList{ID: 30, UserID: owner, Name: "Watch later", Privacy: privacy}
}

// newTodoService wires the service with the given mocks; nil mocks get defaults.
func newTodoService(todos *mockUserTodoRepo, lists *mockUserTodoListRepo, actions *mockTodoActionRepo) *services.UserTodoService {
	if todos == nil {
		todos = &mockUserTodoRepo{}
	}
	if lists == nil {
		lists = &mockUserTodoListRepo{}
	}
	if actions == nil {
		actions = &mockTodoActionRepo{}
	}
	return services.NewUserTodoService(todos, lists, actions)
}

// --- CreateUserTodo -----------------------------------------------------------

func TestCreateUserTodo_ValidationRejectsBeforeWriting(t *testing.T) {
	cases := []struct {
		name    string
		input   domain.CreateUserTodoInput
		wantErr error
	}{
		{"priority above range", domain.CreateUserTodoInput{ContentID: intPtr(5), ActionID: 2, Priority: intPtr(10001)}, domain.ErrInvalidRating},
		{"priority below range", domain.CreateUserTodoInput{ContentID: intPtr(5), ActionID: 2, Priority: intPtr(-1)}, domain.ErrInvalidRating},
		{"percent above 100", domain.CreateUserTodoInput{ContentID: intPtr(5), ActionID: 2, PercentComplete: intPtr(101)}, domain.ErrInvalidPercent},
		{"percent below 0", domain.CreateUserTodoInput{ContentID: intPtr(5), ActionID: 2, PercentComplete: intPtr(-1)}, domain.ErrInvalidPercent},
		{"neither content nor name", domain.CreateUserTodoInput{ActionID: 2}, domain.ErrInvalidInput},
		{"blank name without content", domain.CreateUserTodoInput{ActionID: 2, Name: strPtr("   ")}, domain.ErrInvalidInput},
		{"name over 255 characters", domain.CreateUserTodoInput{ActionID: 2, Name: strPtr(strings.Repeat("n", 256))}, domain.ErrInvalidInput},
		{"unknown status", domain.CreateUserTodoInput{ContentID: intPtr(5), ActionID: 2, Status: todoStatusP("ARCHIVED")}, domain.ErrInvalidInput},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			todos := &mockUserTodoRepo{createFn: func(ctx context.Context, todo *domain.UserTodo) (*domain.UserTodo, error) {
				t.Fatalf("Create must not run for invalid input")
				return nil, nil
			}}
			svc := newTodoService(todos, nil, nil)

			_, err := svc.CreateUserTodo(context.Background(), todoActor, tc.input)
			require.Error(t, err)
			assert.True(t, errors.Is(err, tc.wantErr), "got %v, want %v", err, tc.wantErr)
		})
	}
}

func TestCreateUserTodo_AnonymousIsForbidden(t *testing.T) {
	svc := newTodoService(nil, nil, nil)
	_, err := svc.CreateUserTodo(context.Background(), 0, domain.CreateUserTodoInput{ContentID: intPtr(5), ActionID: 2})
	assert.True(t, errors.Is(err, domain.ErrForbidden))
}

func TestCreateUserTodo_DefaultsAndTrimming(t *testing.T) {
	var got *domain.UserTodo
	todos := &mockUserTodoRepo{createFn: func(ctx context.Context, todo *domain.UserTodo) (*domain.UserTodo, error) {
		got = todo
		return todo, nil
	}}
	svc := newTodoService(todos, nil, nil)

	created, err := svc.CreateUserTodo(context.Background(), todoActor, domain.CreateUserTodoInput{
		Name:     strPtr("  Read the paper  "),
		ActionID: 2,
	})
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, todoActor, got.UserID, "owner comes from the actor, not the input")
	assert.Equal(t, domain.PrivacyPublic, got.Privacy, "privacy defaults to PUBLIC")
	assert.Equal(t, domain.UserTodoStatusNotStarted, got.Status, "status defaults to NOT_STARTED")
	assert.Equal(t, 0, got.PercentComplete)
	require.NotNil(t, got.Name)
	assert.Equal(t, "Read the paper", *got.Name)
	assert.Equal(t, got.ID, created.ID)
}

func TestCreateUserTodo_ActionRules(t *testing.T) {
	ownAction := &domain.TodoAction{ID: 60, Key: "podcast", Label: "Podcast", UserID: intPtr(todoActor)}
	otherAction := &domain.TodoAction{ID: 61, Key: "podcast", Label: "Podcast", UserID: intPtr(todoOther)}
	actions := &mockTodoActionRepo{getByIDFn: func(ctx context.Context, id int) (*domain.TodoAction, error) {
		switch id {
		case todoPresetConsume.ID:
			return todoPresetConsume, nil
		case ownAction.ID:
			return ownAction, nil
		case otherAction.ID:
			return otherAction, nil
		}
		return nil, domain.ErrNotFound
	}}

	cases := []struct {
		name     string
		actionID int
		wantErr  bool
	}{
		{"preset is allowed", 2, false},
		{"own custom action is allowed", 60, false},
		{"another user's custom action is refused", 61, true},
		{"missing action is refused", 999, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc := newTodoService(nil, nil, actions)
			_, err := svc.CreateUserTodo(context.Background(), todoActor, domain.CreateUserTodoInput{ContentID: intPtr(5), ActionID: tc.actionID})
			if tc.wantErr {
				assert.True(t, errors.Is(err, domain.ErrInvalidInput), "got %v", err)
				return
			}
			assert.NoError(t, err)
		})
	}
}

func TestCreateUserTodo_CommentsSanitized(t *testing.T) {
	var got *domain.UserTodo
	todos := &mockUserTodoRepo{createFn: func(ctx context.Context, todo *domain.UserTodo) (*domain.UserTodo, error) {
		got = todo
		return todo, nil
	}}
	svc := newTodoService(todos, nil, nil)

	_, err := svc.CreateUserTodo(context.Background(), todoActor, domain.CreateUserTodoInput{
		ContentID: intPtr(5),
		ActionID:  2,
		Comments:  strPtr(`<p>keep me</p><script>alert("x")</script>`),
	})
	require.NoError(t, err)
	require.NotNil(t, got.Comments)
	assert.Contains(t, *got.Comments, "<p>keep me</p>")
	assert.NotContains(t, *got.Comments, "<script")
}

func TestCreateUserTodo_InProgressFillsStartDateOnlyWhenEmpty(t *testing.T) {
	now := time.Now().UTC()
	today := todoUTCDate(now)
	given := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)

	cases := []struct {
		name      string
		status    domain.UserTodoStatus
		startDate *time.Time
		wantStart *time.Time
	}{
		{"in progress with no start fills today", domain.UserTodoStatusInProgress, nil, &today},
		{"in progress keeps a given start", domain.UserTodoStatusInProgress, &given, &given},
		{"not started leaves start empty", domain.UserTodoStatusNotStarted, nil, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var got *domain.UserTodo
			todos := &mockUserTodoRepo{createFn: func(ctx context.Context, todo *domain.UserTodo) (*domain.UserTodo, error) {
				got = todo
				return todo, nil
			}}
			svc := newTodoService(todos, nil, nil)

			status := tc.status
			_, err := svc.CreateUserTodo(context.Background(), todoActor, domain.CreateUserTodoInput{
				ContentID: intPtr(5), ActionID: 2, Status: &status, StartDate: tc.startDate,
			})
			require.NoError(t, err)
			if tc.wantStart == nil {
				assert.Nil(t, got.StartDate)
				return
			}
			require.NotNil(t, got.StartDate)
			assert.True(t, tc.wantStart.Equal(*got.StartDate), "start date %v, want %v", got.StartDate, tc.wantStart)
		})
	}
}

func TestCreateUserTodo_DatesAreDateOnly(t *testing.T) {
	var got *domain.UserTodo
	todos := &mockUserTodoRepo{createFn: func(ctx context.Context, todo *domain.UserTodo) (*domain.UserTodo, error) {
		got = todo
		return todo, nil
	}}
	svc := newTodoService(todos, nil, nil)

	_, err := svc.CreateUserTodo(context.Background(), todoActor, domain.CreateUserTodoInput{
		ContentID: intPtr(5), ActionID: 2,
		DueDate: todoTimeP(time.Date(2026, 10, 20, 17, 45, 0, 0, time.UTC)),
	})
	require.NoError(t, err)
	require.NotNil(t, got.DueDate)
	assert.True(t, time.Date(2026, 10, 20, 0, 0, 0, 0, time.UTC).Equal(*got.DueDate), "due date %v", got.DueDate)
}

func TestCreateUserTodo_ListAssignment(t *testing.T) {
	cases := []struct {
		name         string
		list         *domain.UserTodoList
		listErr      error
		wantErr      error
		wantPosition int
	}{
		{"own list appends at next position", ownedList(todoActor, domain.PrivacyPublic), nil, nil, 4},
		{"own private list also works", ownedList(todoActor, domain.PrivacyPrivate), nil, nil, 4},
		{"another user's public list is forbidden", ownedList(todoOther, domain.PrivacyPublic), nil, domain.ErrForbidden, 0},
		{"another user's private list is forbidden", ownedList(todoOther, domain.PrivacyPrivate), nil, domain.ErrForbidden, 0},
		{"missing list is not found", nil, domain.ErrNotFound, domain.ErrNotFound, 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var got *domain.UserTodo
			todos := &mockUserTodoRepo{
				nextListPositionFn: func(ctx context.Context, listID int) (int, error) {
					assert.Equal(t, 30, listID)
					return 4, nil
				},
				createFn: func(ctx context.Context, todo *domain.UserTodo) (*domain.UserTodo, error) {
					got = todo
					return todo, nil
				},
			}
			lists := &mockUserTodoListRepo{getByIDFn: func(ctx context.Context, id int) (*domain.UserTodoList, error) {
				if tc.listErr != nil {
					return nil, tc.listErr
				}
				return tc.list, nil
			}}
			svc := newTodoService(todos, lists, nil)

			_, err := svc.CreateUserTodo(context.Background(), todoActor, domain.CreateUserTodoInput{
				ContentID: intPtr(5), ActionID: 2, ListID: intPtr(30),
			})
			if tc.wantErr != nil {
				assert.True(t, errors.Is(err, tc.wantErr), "got %v, want %v", err, tc.wantErr)
				assert.Nil(t, got, "a refused assignment must not write the todo")
				return
			}
			require.NoError(t, err)
			require.NotNil(t, got.ListID)
			assert.Equal(t, 30, *got.ListID)
			require.NotNil(t, got.ListPosition)
			assert.Equal(t, tc.wantPosition, *got.ListPosition)
		})
	}
}

// --- UpdateUserTodo -----------------------------------------------------------

func TestUpdateUserTodo_NotOwnerIsForbiddenWhenPublicNotFoundWhenPrivate(t *testing.T) {
	cases := []struct {
		name    string
		row     *domain.UserTodo
		wantErr error
	}{
		{"public row of another user is forbidden", ownedTodo(todoOther, domain.PrivacyPublic), domain.ErrForbidden},
		{"private row of another user is not found", ownedTodo(todoOther, domain.PrivacyPrivate), domain.ErrNotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			todos := &mockUserTodoRepo{
				getByIDFn: func(ctx context.Context, id int) (*domain.UserTodo, error) { return tc.row, nil },
				updateFn: func(ctx context.Context, todo *domain.UserTodo, actorUserID int) (*domain.UserTodo, error) {
					t.Fatalf("Update must not run for a non-owner")
					return nil, nil
				},
			}
			svc := newTodoService(todos, nil, nil)

			_, err := svc.UpdateUserTodo(context.Background(), todoActor, domain.UpdateUserTodoInput{ID: 10, Priority: intPtr(1)})
			assert.True(t, errors.Is(err, tc.wantErr), "got %v, want %v", err, tc.wantErr)
		})
	}
}

func TestUpdateUserTodo_MissingRowIsNotFound(t *testing.T) {
	svc := newTodoService(nil, nil, nil)
	_, err := svc.UpdateUserTodo(context.Background(), todoActor, domain.UpdateUserTodoInput{ID: 10, Priority: intPtr(1)})
	assert.True(t, errors.Is(err, domain.ErrNotFound))
}

func TestUpdateUserTodo_RepositoryForbiddenMapsByPrivacy(t *testing.T) {
	cases := []struct {
		name    string
		privacy domain.Privacy
		wantErr error
	}{
		{"public row is forbidden", domain.PrivacyPublic, domain.ErrForbidden},
		{"private row is not found", domain.PrivacyPrivate, domain.ErrNotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			todos := &mockUserTodoRepo{
				getByIDFn: func(ctx context.Context, id int) (*domain.UserTodo, error) {
					return ownedTodo(todoActor, tc.privacy), nil
				},
				updateFn: func(ctx context.Context, todo *domain.UserTodo, actorUserID int) (*domain.UserTodo, error) {
					return nil, domain.ErrForbidden // ownership changed between read and write
				},
			}
			svc := newTodoService(todos, nil, nil)

			_, err := svc.UpdateUserTodo(context.Background(), todoActor, domain.UpdateUserTodoInput{ID: 10, Priority: intPtr(1)})
			assert.True(t, errors.Is(err, tc.wantErr), "got %v, want %v", err, tc.wantErr)
		})
	}
}

func TestUpdateUserTodo_MergesOnlySetFields(t *testing.T) {
	existing := ownedTodo(todoActor, domain.PrivacyPublic)
	existing.Name = strPtr("Keep my name")
	existing.Priority = intPtr(2500)
	var got *domain.UserTodo
	todos := &mockUserTodoRepo{
		getByIDFn: func(ctx context.Context, id int) (*domain.UserTodo, error) { return existing, nil },
		updateFn: func(ctx context.Context, todo *domain.UserTodo, actorUserID int) (*domain.UserTodo, error) {
			got = todo
			return todo, nil
		},
	}
	svc := newTodoService(todos, nil, nil)

	_, err := svc.UpdateUserTodo(context.Background(), todoActor, domain.UpdateUserTodoInput{ID: 10, Priority: intPtr(9000)})
	require.NoError(t, err)
	require.NotNil(t, got)
	require.NotNil(t, got.Priority)
	assert.Equal(t, 9000, *got.Priority)
	require.NotNil(t, got.Name)
	assert.Equal(t, "Keep my name", *got.Name, "unset fields keep their stored value")
	assert.Equal(t, 40, got.PercentComplete)
	assert.Equal(t, existing.ContentID, got.ContentID)
	assert.Equal(t, existing.Privacy, got.Privacy)
	assert.Equal(t, existing.Status, got.Status)
	assert.Equal(t, existing.Status, domain.UserTodoStatusNotStarted)
}

func TestUpdateUserTodo_ClearPriority(t *testing.T) {
	existing := ownedTodo(todoActor, domain.PrivacyPublic)
	existing.Priority = intPtr(2500)
	var got *domain.UserTodo
	todos := &mockUserTodoRepo{
		getByIDFn: func(ctx context.Context, id int) (*domain.UserTodo, error) { return existing, nil },
		updateFn: func(ctx context.Context, todo *domain.UserTodo, actorUserID int) (*domain.UserTodo, error) {
			got = todo
			return todo, nil
		},
	}
	svc := newTodoService(todos, nil, nil)

	_, err := svc.UpdateUserTodo(context.Background(), todoActor, domain.UpdateUserTodoInput{ID: 10, ClearPriority: true})
	require.NoError(t, err)
	assert.Nil(t, got.Priority)
}

func TestUpdateUserTodo_ValidationRejectsBeforeWriting(t *testing.T) {
	cases := []struct {
		name    string
		input   domain.UpdateUserTodoInput
		wantErr error
	}{
		{"priority out of range", domain.UpdateUserTodoInput{ID: 10, Priority: intPtr(10001)}, domain.ErrInvalidRating},
		{"percent out of range", domain.UpdateUserTodoInput{ID: 10, PercentComplete: intPtr(150)}, domain.ErrInvalidPercent},
		{"blank name leaves no content-or-name", domain.UpdateUserTodoInput{ID: 10, ContentID: nil, Name: strPtr(" ")}, domain.ErrInvalidInput},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			existing := ownedTodo(todoActor, domain.PrivacyPublic)
			existing.ContentID = nil
			existing.Name = strPtr("was named")
			todos := &mockUserTodoRepo{
				getByIDFn: func(ctx context.Context, id int) (*domain.UserTodo, error) { return existing, nil },
				updateFn: func(ctx context.Context, todo *domain.UserTodo, actorUserID int) (*domain.UserTodo, error) {
					t.Fatalf("Update must not run for invalid input")
					return nil, nil
				},
			}
			svc := newTodoService(todos, nil, nil)

			_, err := svc.UpdateUserTodo(context.Background(), todoActor, tc.input)
			assert.True(t, errors.Is(err, tc.wantErr), "got %v, want %v", err, tc.wantErr)
		})
	}
}

func TestUpdateUserTodo_StatusInProgressFillsStartDate(t *testing.T) {
	today := todoUTCDate(time.Now())
	kept := time.Date(2026, 8, 15, 0, 0, 0, 0, time.UTC)

	cases := []struct {
		name      string
		existing  domain.UserTodoStatus
		startDate *time.Time
		newStatus domain.UserTodoStatus
		wantStart *time.Time
	}{
		{"moving to in progress fills an empty start", domain.UserTodoStatusNotStarted, nil, domain.UserTodoStatusInProgress, &today},
		{"moving to in progress keeps a given start", domain.UserTodoStatusNotStarted, &kept, domain.UserTodoStatusInProgress, &kept},
		{"already in progress with no start stays empty", domain.UserTodoStatusInProgress, nil, domain.UserTodoStatusInProgress, nil},
		{"not moving to in progress leaves start empty", domain.UserTodoStatusNotStarted, nil, domain.UserTodoStatusDone, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			existing := ownedTodo(todoActor, domain.PrivacyPublic)
			existing.Status = tc.existing
			existing.StartDate = tc.startDate
			var got *domain.UserTodo
			todos := &mockUserTodoRepo{
				getByIDFn: func(ctx context.Context, id int) (*domain.UserTodo, error) { return existing, nil },
				updateFn: func(ctx context.Context, todo *domain.UserTodo, actorUserID int) (*domain.UserTodo, error) {
					got = todo
					return todo, nil
				},
			}
			svc := newTodoService(todos, nil, nil)

			status := tc.newStatus
			_, err := svc.UpdateUserTodo(context.Background(), todoActor, domain.UpdateUserTodoInput{ID: 10, Status: &status})
			require.NoError(t, err)
			if tc.wantStart == nil {
				assert.Nil(t, got.StartDate)
				return
			}
			require.NotNil(t, got.StartDate)
			assert.True(t, tc.wantStart.Equal(*got.StartDate), "start %v, want %v", got.StartDate, tc.wantStart)
		})
	}
}

func TestUpdateUserTodo_DoneAndPercentAreIndependent(t *testing.T) {
	t.Run("setting done leaves percent alone", func(t *testing.T) {
		existing := ownedTodo(todoActor, domain.PrivacyPublic)
		existing.PercentComplete = 40
		var got *domain.UserTodo
		todos := &mockUserTodoRepo{
			getByIDFn: func(ctx context.Context, id int) (*domain.UserTodo, error) { return existing, nil },
			updateFn: func(ctx context.Context, todo *domain.UserTodo, actorUserID int) (*domain.UserTodo, error) {
				got = todo
				return todo, nil
			},
		}
		svc := newTodoService(todos, nil, nil)

		status := domain.UserTodoStatusDone
		_, err := svc.UpdateUserTodo(context.Background(), todoActor, domain.UpdateUserTodoInput{ID: 10, Status: &status})
		require.NoError(t, err)
		assert.Equal(t, domain.UserTodoStatusDone, got.Status)
		assert.Equal(t, 40, got.PercentComplete, "no automatic 100% pairing")
	})

	t.Run("setting percent 100 leaves status alone", func(t *testing.T) {
		existing := ownedTodo(todoActor, domain.PrivacyPublic)
		existing.Status = domain.UserTodoStatusInProgress
		var got *domain.UserTodo
		todos := &mockUserTodoRepo{
			getByIDFn: func(ctx context.Context, id int) (*domain.UserTodo, error) { return existing, nil },
			updateFn: func(ctx context.Context, todo *domain.UserTodo, actorUserID int) (*domain.UserTodo, error) {
				got = todo
				return todo, nil
			},
		}
		svc := newTodoService(todos, nil, nil)

		_, err := svc.UpdateUserTodo(context.Background(), todoActor, domain.UpdateUserTodoInput{ID: 10, PercentComplete: intPtr(100)})
		require.NoError(t, err)
		assert.Equal(t, 100, got.PercentComplete)
		assert.Equal(t, domain.UserTodoStatusInProgress, got.Status, "no automatic DONE pairing")
	})
}

func TestUpdateUserTodo_CommentsSanitized(t *testing.T) {
	existing := ownedTodo(todoActor, domain.PrivacyPublic)
	var got *domain.UserTodo
	todos := &mockUserTodoRepo{
		getByIDFn: func(ctx context.Context, id int) (*domain.UserTodo, error) { return existing, nil },
		updateFn: func(ctx context.Context, todo *domain.UserTodo, actorUserID int) (*domain.UserTodo, error) {
			got = todo
			return todo, nil
		},
	}
	svc := newTodoService(todos, nil, nil)

	_, err := svc.UpdateUserTodo(context.Background(), todoActor, domain.UpdateUserTodoInput{
		ID: 10, Comments: strPtr(`<em>ok</em><script>alert(1)</script>`),
	})
	require.NoError(t, err)
	require.NotNil(t, got.Comments)
	assert.Contains(t, *got.Comments, "<em>ok</em>")
	assert.NotContains(t, *got.Comments, "<script")
}

func TestUpdateUserTodo_ListMoves(t *testing.T) {
	t.Run("moving to another own list appends to it", func(t *testing.T) {
		existing := ownedTodo(todoActor, domain.PrivacyPublic)
		existing.ListID = intPtr(30)
		existing.ListPosition = intPtr(2)
		var got *domain.UserTodo
		todos := &mockUserTodoRepo{
			getByIDFn: func(ctx context.Context, id int) (*domain.UserTodo, error) { return existing, nil },
			nextListPositionFn: func(ctx context.Context, listID int) (int, error) {
				assert.Equal(t, 31, listID)
				return 6, nil
			},
			updateFn: func(ctx context.Context, todo *domain.UserTodo, actorUserID int) (*domain.UserTodo, error) {
				got = todo
				return todo, nil
			},
		}
		lists := &mockUserTodoListRepo{getByIDFn: func(ctx context.Context, id int) (*domain.UserTodoList, error) {
			l := ownedList(todoActor, domain.PrivacyPublic)
			l.ID = id
			return l, nil
		}}
		svc := newTodoService(todos, lists, nil)

		_, err := svc.UpdateUserTodo(context.Background(), todoActor, domain.UpdateUserTodoInput{ID: 10, ListID: intPtr(31)})
		require.NoError(t, err)
		require.NotNil(t, got.ListID)
		assert.Equal(t, 31, *got.ListID)
		require.NotNil(t, got.ListPosition)
		assert.Equal(t, 6, *got.ListPosition)
	})

	t.Run("re-sending the current list keeps its position and does not look up", func(t *testing.T) {
		existing := ownedTodo(todoActor, domain.PrivacyPublic)
		existing.ListID = intPtr(30)
		existing.ListPosition = intPtr(2)
		var got *domain.UserTodo
		todos := &mockUserTodoRepo{
			getByIDFn: func(ctx context.Context, id int) (*domain.UserTodo, error) { return existing, nil },
			nextListPositionFn: func(ctx context.Context, listID int) (int, error) {
				t.Fatalf("position must not be recomputed for the same list")
				return 0, nil
			},
			updateFn: func(ctx context.Context, todo *domain.UserTodo, actorUserID int) (*domain.UserTodo, error) {
				got = todo
				return todo, nil
			},
		}
		lists := &mockUserTodoListRepo{getByIDFn: func(ctx context.Context, id int) (*domain.UserTodoList, error) {
			t.Fatalf("the list must not be looked up when it is unchanged")
			return nil, nil
		}}
		svc := newTodoService(todos, lists, nil)

		_, err := svc.UpdateUserTodo(context.Background(), todoActor, domain.UpdateUserTodoInput{ID: 10, ListID: intPtr(30)})
		require.NoError(t, err)
		require.NotNil(t, got.ListPosition)
		assert.Equal(t, 2, *got.ListPosition)
	})

	t.Run("moving into another user's list is forbidden", func(t *testing.T) {
		existing := ownedTodo(todoActor, domain.PrivacyPublic)
		todos := &mockUserTodoRepo{
			getByIDFn: func(ctx context.Context, id int) (*domain.UserTodo, error) { return existing, nil },
			updateFn: func(ctx context.Context, todo *domain.UserTodo, actorUserID int) (*domain.UserTodo, error) {
				t.Fatalf("Update must not run when the list is refused")
				return nil, nil
			},
		}
		lists := &mockUserTodoListRepo{getByIDFn: func(ctx context.Context, id int) (*domain.UserTodoList, error) {
			return ownedList(todoOther, domain.PrivacyPublic), nil
		}}
		svc := newTodoService(todos, lists, nil)

		_, err := svc.UpdateUserTodo(context.Background(), todoActor, domain.UpdateUserTodoInput{ID: 10, ListID: intPtr(30)})
		assert.True(t, errors.Is(err, domain.ErrForbidden), "got %v", err)
	})

	t.Run("clearing the list clears list and position together", func(t *testing.T) {
		existing := ownedTodo(todoActor, domain.PrivacyPublic)
		existing.ListID = intPtr(30)
		existing.ListPosition = intPtr(2)
		var got *domain.UserTodo
		todos := &mockUserTodoRepo{
			getByIDFn: func(ctx context.Context, id int) (*domain.UserTodo, error) { return existing, nil },
			updateFn: func(ctx context.Context, todo *domain.UserTodo, actorUserID int) (*domain.UserTodo, error) {
				got = todo
				return todo, nil
			},
		}
		svc := newTodoService(todos, nil, nil)

		_, err := svc.UpdateUserTodo(context.Background(), todoActor, domain.UpdateUserTodoInput{ID: 10, ClearListID: true})
		require.NoError(t, err)
		assert.Nil(t, got.ListID)
		assert.Nil(t, got.ListPosition)
	})
}

// --- DeleteUserTodo -----------------------------------------------------------

func TestDeleteUserTodo_OwnershipErrors(t *testing.T) {
	cases := []struct {
		name    string
		row     *domain.UserTodo // nil: no such row
		wantErr error
	}{
		{"public row of another user is forbidden", ownedTodo(todoOther, domain.PrivacyPublic), domain.ErrForbidden},
		{"private row of another user is not found", ownedTodo(todoOther, domain.PrivacyPrivate), domain.ErrNotFound},
		{"missing row is not found", nil, domain.ErrNotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			todos := &mockUserTodoRepo{
				deleteFn: func(ctx context.Context, id int, actorUserID int) error {
					if tc.row == nil {
						return domain.ErrNotFound
					}
					return domain.ErrForbidden // owner-scoped DELETE matched nothing; the row exists
				},
				getByIDFn: func(ctx context.Context, id int) (*domain.UserTodo, error) {
					if tc.row == nil {
						return nil, domain.ErrNotFound
					}
					return tc.row, nil
				},
			}
			svc := newTodoService(todos, nil, nil)

			err := svc.DeleteUserTodo(context.Background(), todoActor, 10)
			assert.True(t, errors.Is(err, tc.wantErr), "got %v, want %v", err, tc.wantErr)
		})
	}
}

func TestDeleteUserTodo_OwnerDeletes(t *testing.T) {
	var deletedID, deletedBy int
	todos := &mockUserTodoRepo{deleteFn: func(ctx context.Context, id int, actorUserID int) error {
		deletedID, deletedBy = id, actorUserID
		return nil
	}}
	svc := newTodoService(todos, nil, nil)

	require.NoError(t, svc.DeleteUserTodo(context.Background(), todoActor, 10))
	assert.Equal(t, 10, deletedID)
	assert.Equal(t, todoActor, deletedBy)
}

func TestDeleteUserTodo_AnonymousIsForbidden(t *testing.T) {
	svc := newTodoService(nil, nil, nil)
	err := svc.DeleteUserTodo(context.Background(), 0, 10)
	assert.True(t, errors.Is(err, domain.ErrForbidden))
}

// --- GetUserTodo --------------------------------------------------------------

func TestGetUserTodo_PrivacyFilter(t *testing.T) {
	ownerID := todoActor
	cases := []struct {
		name    string
		row     *domain.UserTodo // nil: no such row
		viewer  *int
		wantNil bool
		wantRow bool
	}{
		{"missing row returns nil", nil, nil, true, false},
		{"anonymous sees public row", ownedTodo(todoOther, domain.PrivacyPublic), nil, false, true},
		{"anonymous does not see private row", ownedTodo(todoOther, domain.PrivacyPrivate), nil, true, false},
		{"other user does not see private row", ownedTodo(todoOther, domain.PrivacyPrivate), intPtr(todoActor), true, false},
		{"other user sees public row", ownedTodo(todoOther, domain.PrivacyPublic), intPtr(todoActor), false, true},
		{"owner sees own private row", ownedTodo(ownerID, domain.PrivacyPrivate), intPtr(ownerID), false, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			todos := &mockUserTodoRepo{getByIDFn: func(ctx context.Context, id int) (*domain.UserTodo, error) {
				if tc.row == nil {
					return nil, domain.ErrNotFound
				}
				return tc.row, nil
			}}
			svc := newTodoService(todos, nil, nil)

			got, err := svc.GetUserTodo(context.Background(), 10, tc.viewer)
			require.NoError(t, err)
			if tc.wantNil {
				assert.Nil(t, got)
			}
			if tc.wantRow {
				require.NotNil(t, got)
				assert.Equal(t, tc.row.ID, got.ID)
			}
		})
	}
}

// --- ListUserTodos ------------------------------------------------------------

func TestListUserTodos_ForcesPrivacyFilterAndPassesViewer(t *testing.T) {
	var seen domain.UserTodoListParams
	todos := &mockUserTodoRepo{listFn: func(ctx context.Context, params domain.UserTodoListParams) (*domain.PaginatedUserTodos, error) {
		seen = params
		return &domain.PaginatedUserTodos{Items: []*domain.UserTodo{}}, nil
	}}
	svc := newTodoService(todos, nil, nil)

	// The caller tries to switch the filter off; the service must not allow it.
	_, err := svc.ListUserTodos(context.Background(), domain.UserTodoListParams{
		ViewerID:                intPtr(todoActor),
		RestrictToPublicOrOwner: false,
	})
	require.NoError(t, err)
	assert.True(t, seen.RestrictToPublicOrOwner)
	require.NotNil(t, seen.ViewerID)
	assert.Equal(t, todoActor, *seen.ViewerID)
}

func TestListUserTodos_PageSizeBounds(t *testing.T) {
	svc := newTodoService(nil, nil, nil)
	for _, first := range []int{0, 101} {
		_, err := svc.ListUserTodos(context.Background(), domain.UserTodoListParams{First: intPtr(first)})
		assert.True(t, errors.Is(err, domain.ErrInvalidInput), "first=%d: %v", first, err)
	}
}

// --- Lists --------------------------------------------------------------------

func TestListUserTodoLists_PrivateOnlyToOwner(t *testing.T) {
	cases := []struct {
		name        string
		viewer      *int
		wantPrivate bool
	}{
		{"anonymous", nil, false},
		{"other user", intPtr(todoOther), false},
		{"owner", intPtr(todoActor), true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var gotIncludePrivate bool
			lists := &mockUserTodoListRepo{listByUserFn: func(ctx context.Context, userID int, includePrivate bool) ([]*domain.UserTodoList, error) {
				assert.Equal(t, todoActor, userID)
				gotIncludePrivate = includePrivate
				return []*domain.UserTodoList{}, nil
			}}
			svc := newTodoService(nil, lists, nil)

			_, err := svc.ListUserTodoLists(context.Background(), todoActor, tc.viewer)
			require.NoError(t, err)
			assert.Equal(t, tc.wantPrivate, gotIncludePrivate)
		})
	}
}

func TestGetUserTodoListsByIDs_FiltersPrivateListsOfOthers(t *testing.T) {
	lists := &mockUserTodoListRepo{getByIDsFn: func(ctx context.Context, ids []int) ([]*domain.UserTodoList, error) {
		return []*domain.UserTodoList{
			{ID: 1, UserID: todoOther, Name: "theirs public", Privacy: domain.PrivacyPublic},
			{ID: 2, UserID: todoOther, Name: "theirs private", Privacy: domain.PrivacyPrivate},
			{ID: 3, UserID: todoActor, Name: "mine private", Privacy: domain.PrivacyPrivate},
		}, nil
	}}
	svc := newTodoService(nil, lists, nil)

	t.Run("anonymous keeps only public lists", func(t *testing.T) {
		got, err := svc.GetUserTodoListsByIDs(context.Background(), []int{1, 2, 3}, nil)
		require.NoError(t, err)
		require.Len(t, got, 1)
		assert.Equal(t, 1, got[0].ID)
	})

	t.Run("viewer keeps public lists and their own private ones", func(t *testing.T) {
		got, err := svc.GetUserTodoListsByIDs(context.Background(), []int{1, 2, 3}, intPtr(todoActor))
		require.NoError(t, err)
		ids := make([]int, 0, len(got))
		for _, l := range got {
			ids = append(ids, l.ID)
		}
		assert.Equal(t, []int{1, 3}, ids)
	})
}

func TestCreateUserTodoList_DefaultsAndNameRules(t *testing.T) {
	t.Run("defaults privacy to PUBLIC and trims the name", func(t *testing.T) {
		var got *domain.UserTodoList
		lists := &mockUserTodoListRepo{createFn: func(ctx context.Context, list *domain.UserTodoList) (*domain.UserTodoList, error) {
			got = list
			return list, nil
		}}
		svc := newTodoService(nil, lists, nil)

		_, err := svc.CreateUserTodoList(context.Background(), todoActor, domain.CreateUserTodoListInput{Name: "  Weekend  "})
		require.NoError(t, err)
		assert.Equal(t, todoActor, got.UserID)
		assert.Equal(t, "Weekend", got.Name)
		assert.Equal(t, domain.PrivacyPublic, got.Privacy)
	})

	cases := []struct {
		name string
		in   string
	}{
		{"blank name", "   "},
		{"name over 100 characters", strings.Repeat("x", 101)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			lists := &mockUserTodoListRepo{createFn: func(ctx context.Context, list *domain.UserTodoList) (*domain.UserTodoList, error) {
				t.Fatalf("Create must not run for an invalid name")
				return nil, nil
			}}
			svc := newTodoService(nil, lists, nil)

			_, err := svc.CreateUserTodoList(context.Background(), todoActor, domain.CreateUserTodoListInput{Name: tc.in})
			assert.True(t, errors.Is(err, domain.ErrInvalidInput), "got %v", err)
		})
	}
}

func TestUpdateUserTodoList_OwnershipAndMerge(t *testing.T) {
	t.Run("another user's public list is forbidden", func(t *testing.T) {
		lists := &mockUserTodoListRepo{getByIDFn: func(ctx context.Context, id int) (*domain.UserTodoList, error) {
			return ownedList(todoOther, domain.PrivacyPublic), nil
		}}
		svc := newTodoService(nil, lists, nil)
		_, err := svc.UpdateUserTodoList(context.Background(), todoActor, domain.UpdateUserTodoListInput{ID: 30, Name: strPtr("x")})
		assert.True(t, errors.Is(err, domain.ErrForbidden), "got %v", err)
	})

	t.Run("another user's private list is not found", func(t *testing.T) {
		lists := &mockUserTodoListRepo{getByIDFn: func(ctx context.Context, id int) (*domain.UserTodoList, error) {
			return ownedList(todoOther, domain.PrivacyPrivate), nil
		}}
		svc := newTodoService(nil, lists, nil)
		_, err := svc.UpdateUserTodoList(context.Background(), todoActor, domain.UpdateUserTodoListInput{ID: 30, Name: strPtr("x")})
		assert.True(t, errors.Is(err, domain.ErrNotFound), "got %v", err)
	})

	t.Run("owner's update merges the name and clears the description", func(t *testing.T) {
		existing := ownedList(todoActor, domain.PrivacyPublic)
		existing.Description = strPtr("old")
		var got *domain.UserTodoList
		lists := &mockUserTodoListRepo{
			getByIDFn: func(ctx context.Context, id int) (*domain.UserTodoList, error) { return existing, nil },
			updateFn: func(ctx context.Context, list *domain.UserTodoList, actorUserID int) (*domain.UserTodoList, error) {
				got = list
				return list, nil
			},
		}
		svc := newTodoService(nil, lists, nil)

		_, err := svc.UpdateUserTodoList(context.Background(), todoActor, domain.UpdateUserTodoListInput{
			ID: 30, Name: strPtr(" Renamed "), ClearDescription: true, Privacy: todoPrivacyP(domain.PrivacyPrivate),
		})
		require.NoError(t, err)
		assert.Equal(t, "Renamed", got.Name)
		assert.Nil(t, got.Description)
		assert.Equal(t, domain.PrivacyPrivate, got.Privacy)
	})

	t.Run("blank new name is invalid", func(t *testing.T) {
		lists := &mockUserTodoListRepo{getByIDFn: func(ctx context.Context, id int) (*domain.UserTodoList, error) {
			return ownedList(todoActor, domain.PrivacyPublic), nil
		}}
		svc := newTodoService(nil, lists, nil)
		_, err := svc.UpdateUserTodoList(context.Background(), todoActor, domain.UpdateUserTodoListInput{ID: 30, Name: strPtr("  ")})
		assert.True(t, errors.Is(err, domain.ErrInvalidInput), "got %v", err)
	})
}

func TestDeleteUserTodoList_UnlistsBeforeDelete(t *testing.T) {
	var calls []string
	todos := &mockUserTodoRepo{calls: &calls}
	lists := &mockUserTodoListRepo{calls: &calls}
	svc := newTodoService(todos, lists, nil)

	require.NoError(t, svc.DeleteUserTodoList(context.Background(), todoActor, 30))
	assert.Equal(t, []string{"todos.unlistAll", "lists.delete"}, calls)
}

func TestDeleteUserTodoList_UnlistFailureStopsTheDelete(t *testing.T) {
	var calls []string
	todos := &mockUserTodoRepo{
		calls: &calls,
		unlistAllFn: func(ctx context.Context, listID int, actorUserID int) error {
			return errors.New("unlist boom")
		},
	}
	lists := &mockUserTodoListRepo{calls: &calls}
	svc := newTodoService(todos, lists, nil)

	err := svc.DeleteUserTodoList(context.Background(), todoActor, 30)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unlist boom")
	assert.NotContains(t, calls, "lists.delete")
}

func TestDeleteUserTodoList_OwnershipErrors(t *testing.T) {
	cases := []struct {
		name    string
		privacy domain.Privacy
		wantErr error
	}{
		{"public list of another user is forbidden", domain.PrivacyPublic, domain.ErrForbidden},
		{"private list of another user is not found", domain.PrivacyPrivate, domain.ErrNotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			lists := &mockUserTodoListRepo{
				deleteFn: func(ctx context.Context, id int, actorUserID int) error { return domain.ErrForbidden },
				getByIDFn: func(ctx context.Context, id int) (*domain.UserTodoList, error) {
					return ownedList(todoOther, tc.privacy), nil
				},
			}
			svc := newTodoService(nil, lists, nil)

			err := svc.DeleteUserTodoList(context.Background(), todoActor, 30)
			assert.True(t, errors.Is(err, tc.wantErr), "got %v, want %v", err, tc.wantErr)
		})
	}
}

// --- ReorderUserTodoList ------------------------------------------------------

func TestReorderUserTodoList_InputRules(t *testing.T) {
	cases := []struct {
		name    string
		ids     []int
		wantErr error
	}{
		{"empty ids", []int{}, domain.ErrInvalidInput},
		{"duplicate ids", []int{4, 5, 4}, domain.ErrInvalidInput},
		{"non-positive id", []int{4, 0}, domain.ErrInvalidInput},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			lists := &mockUserTodoListRepo{getByIDFn: func(ctx context.Context, id int) (*domain.UserTodoList, error) {
				t.Fatalf("the list must not be read for invalid ids")
				return nil, nil
			}}
			svc := newTodoService(nil, lists, nil)

			_, err := svc.ReorderUserTodoList(context.Background(), todoActor, 30, tc.ids)
			assert.True(t, errors.Is(err, tc.wantErr), "got %v", err)
		})
	}
}

func TestReorderUserTodoList_OwnershipErrors(t *testing.T) {
	cases := []struct {
		name    string
		privacy domain.Privacy
		wantErr error
	}{
		{"public list of another user is forbidden", domain.PrivacyPublic, domain.ErrForbidden},
		{"private list of another user is not found", domain.PrivacyPrivate, domain.ErrNotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			todos := &mockUserTodoRepo{reorderFn: func(ctx context.Context, listID int, todoIDs []int, actorUserID int) ([]*domain.UserTodo, error) {
				t.Fatalf("Reorder must not run for a list the actor does not own")
				return nil, nil
			}}
			lists := &mockUserTodoListRepo{getByIDFn: func(ctx context.Context, id int) (*domain.UserTodoList, error) {
				return ownedList(todoOther, tc.privacy), nil
			}}
			svc := newTodoService(todos, lists, nil)

			_, err := svc.ReorderUserTodoList(context.Background(), todoActor, 30, []int{4, 5})
			assert.True(t, errors.Is(err, tc.wantErr), "got %v, want %v", err, tc.wantErr)
		})
	}
}

func TestReorderUserTodoList_OwnerDelegatesToRepository(t *testing.T) {
	var gotListID, gotActor int
	var gotIDs []int
	todos := &mockUserTodoRepo{reorderFn: func(ctx context.Context, listID int, todoIDs []int, actorUserID int) ([]*domain.UserTodo, error) {
		gotListID, gotIDs, gotActor = listID, todoIDs, actorUserID
		return []*domain.UserTodo{{ID: 5, ListPosition: intPtr(1)}, {ID: 4, ListPosition: intPtr(2)}}, nil
	}}
	lists := &mockUserTodoListRepo{getByIDFn: func(ctx context.Context, id int) (*domain.UserTodoList, error) {
		return ownedList(todoActor, domain.PrivacyPublic), nil
	}}
	svc := newTodoService(todos, lists, nil)

	got, err := svc.ReorderUserTodoList(context.Background(), todoActor, 30, []int{5, 4})
	require.NoError(t, err)
	assert.Equal(t, 30, gotListID)
	assert.Equal(t, []int{5, 4}, gotIDs)
	assert.Equal(t, todoActor, gotActor)
	assert.Len(t, got, 2)
}

// --- Actions ------------------------------------------------------------------

func TestCreateTodoAction_LabelRules(t *testing.T) {
	cases := []struct {
		name  string
		label string
		ok    bool
	}{
		{"blank label", "   ", false},
		{"label of 51 characters", strings.Repeat("a", 51), false},
		{"label of exactly 50 characters", strings.Repeat("a", 50), true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc := newTodoService(nil, nil, &mockTodoActionRepo{createFn: func(ctx context.Context, action *domain.TodoAction) (*domain.TodoAction, error) {
				if !tc.ok {
					t.Fatalf("Create must not run for an invalid label")
				}
				return action, nil
			}})
			_, err := svc.CreateTodoAction(context.Background(), todoActor, domain.CreateTodoActionInput{Label: tc.label})
			if tc.ok {
				assert.NoError(t, err)
				return
			}
			assert.True(t, errors.Is(err, domain.ErrInvalidInput), "got %v", err)
		})
	}
}

func TestCreateTodoAction_KeyIsNormalizedAndStoredForOwner(t *testing.T) {
	var got *domain.TodoAction
	actions := &mockTodoActionRepo{createFn: func(ctx context.Context, action *domain.TodoAction) (*domain.TodoAction, error) {
		got = action
		created := *action
		created.ID = 50
		return &created, nil
	}}
	svc := newTodoService(nil, nil, actions)

	created, err := svc.CreateTodoAction(context.Background(), todoActor, domain.CreateTodoActionInput{
		Label: "  Watch   LATER  ", Description: " A later viewing ",
	})
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, "watch later", got.Key)
	assert.Equal(t, "Watch   LATER", got.Label)
	assert.Equal(t, "A later viewing", got.Description)
	require.NotNil(t, got.UserID)
	assert.Equal(t, todoActor, *got.UserID)
	assert.Nil(t, got.TypicalSequence, "user-entered actions have no sequence")
	assert.Equal(t, 50, created.ID)
}

func TestCreateTodoAction_DuplicatesReturnExistingRow(t *testing.T) {
	own := &domain.TodoAction{ID: 60, Key: "podcast", Label: "Podcast", UserID: intPtr(todoActor)}

	cases := []struct {
		name   string
		label  string
		wantID int
	}{
		{"own existing key returns the own row", "Podcast", 60},
		{"preset key returns the preset", "Consume", todoPresetConsume.ID},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			actions := &mockTodoActionRepo{
				getByKeyFn: func(ctx context.Context, userID *int, key string) (*domain.TodoAction, error) {
					if userID == nil && key == "consume" {
						return todoPresetConsume, nil
					}
					if userID != nil && *userID == todoActor && key == "podcast" {
						return own, nil
					}
					return nil, domain.ErrNotFound
				},
				createFn: func(ctx context.Context, action *domain.TodoAction) (*domain.TodoAction, error) {
					t.Fatalf("Create must not run when the key already exists")
					return nil, nil
				},
			}
			svc := newTodoService(nil, nil, actions)

			got, err := svc.CreateTodoAction(context.Background(), todoActor, domain.CreateTodoActionInput{Label: tc.label})
			require.NoError(t, err)
			assert.Equal(t, tc.wantID, got.ID)
		})
	}
}

func TestCreateTodoAction_ConcurrentDuplicateReturnsWinner(t *testing.T) {
	winner := &domain.TodoAction{ID: 77, Key: "podcast", Label: "Podcast", UserID: intPtr(todoActor)}
	lookups := 0
	actions := &mockTodoActionRepo{
		getByKeyFn: func(ctx context.Context, userID *int, key string) (*domain.TodoAction, error) {
			if userID != nil {
				lookups++
				if lookups == 2 { // the re-read after the lost race
					return winner, nil
				}
			}
			return nil, domain.ErrNotFound
		},
		createFn: func(ctx context.Context, action *domain.TodoAction) (*domain.TodoAction, error) {
			return nil, domain.ErrAlreadyExists
		},
	}
	svc := newTodoService(nil, nil, actions)

	got, err := svc.CreateTodoAction(context.Background(), todoActor, domain.CreateTodoActionInput{Label: "podcast"})
	require.NoError(t, err)
	assert.Equal(t, 77, got.ID)
}

func TestListTodoActions_RequiresActorAndReturnsPresetsPlusOwn(t *testing.T) {
	svc := newTodoService(nil, nil, nil)
	_, err := svc.ListTodoActions(context.Background(), 0)
	assert.True(t, errors.Is(err, domain.ErrForbidden))

	var gotUser int
	actions := &mockTodoActionRepo{listForUserFn: func(ctx context.Context, userID int) ([]*domain.TodoAction, error) {
		gotUser = userID
		return []*domain.TodoAction{todoPresetConsume}, nil
	}}
	svc = newTodoService(nil, nil, actions)
	got, err := svc.ListTodoActions(context.Background(), todoActor)
	require.NoError(t, err)
	assert.Equal(t, todoActor, gotUser)
	assert.Len(t, got, 1)
}

func TestGetTodoActionsByIDs_DropsNonPositiveAndKeepsOthersCustomActions(t *testing.T) {
	var gotIDs []int
	actions := &mockTodoActionRepo{getByIDsFn: func(ctx context.Context, ids []int) ([]*domain.TodoAction, error) {
		gotIDs = ids
		return []*domain.TodoAction{
			todoPresetConsume,
			{ID: 61, Key: "podcast", Label: "Podcast", UserID: intPtr(todoOther)},
		}, nil
	}}
	svc := newTodoService(nil, nil, actions)

	got, err := svc.GetTodoActionsByIDs(context.Background(), []int{2, 0, -3, 61})
	require.NoError(t, err)
	assert.Equal(t, []int{2, 61}, gotIDs)
	assert.Len(t, got, 2, "another user's custom action is returned; it is only reached through a visible todo")
}

// --- Repository errors pass through -------------------------------------------

func TestUserTodoService_RepositoryErrorsAreWrapped(t *testing.T) {
	boom := errors.New("db down")
	todos := &mockUserTodoRepo{listFn: func(ctx context.Context, params domain.UserTodoListParams) (*domain.PaginatedUserTodos, error) {
		return nil, boom
	}}
	svc := newTodoService(todos, nil, nil)

	_, err := svc.ListUserTodos(context.Background(), domain.UserTodoListParams{})
	assert.True(t, errors.Is(err, boom))
}
