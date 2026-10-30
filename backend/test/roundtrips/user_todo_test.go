package roundtrips

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/repositories/postgres"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

const userTodosRoundTripQuery = `query($first: Int) {
  userTodos(first: $first) {
    items {
      id
      user { id username }
      content { id name }
      action { id key label }
      list { id name }
    }
  }
}`

const createUserTodoRoundTripMutation = `mutation($input: CreateUserTodoInput!) {
  createUserTodo(input: $input) { id priority status percentComplete action { id key } }
}`

type userTodoPageItem struct {
	ID      string                 `json:"id"`
	User    struct{ ID string }    `json:"user"`
	Content *struct{ ID string }   `json:"content"`
	Action  struct{ Key string }   `json:"action"`
	List    *struct{ Name string } `json:"list"`
}

type userTodoPage struct {
	Items []userTodoPageItem `json:"items"`
}

// presetActionID returns the id of a seeded preset action by its key.
func presetActionID(t *testing.T, h *harness, key string) int {
	t.Helper()
	var id int
	require.NoError(t, h.db.Raw("SELECT id FROM todo_actions WHERE user_id IS NULL AND key = ?", key).Row().Scan(&id))
	require.NotZero(t, id, "preset action %q is seeded by the migration", key)
	return id
}

// seedUserTodos gives owner n todos, each about its own content (so one page
// resolves n distinct content rows), and puts the first five in one list.
func seedUserTodos(t *testing.T, h *harness, owner, n int) {
	t.Helper()
	ctx := context.Background()
	todos := postgres.NewGormUserTodoRepository(h.db)
	lists := postgres.NewGormUserTodoListRepository(h.db)
	actionID := presetActionID(t, h, "consume")

	list, err := lists.Create(ctx, &domain.UserTodoList{UserID: owner, Name: "reading", Privacy: domain.PrivacyPublic})
	require.NoError(t, err)

	due := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	for i := 0; i < n; i++ {
		contentID := h.content(owner, "todo-seed")
		name := "seed"
		todo := &domain.UserTodo{
			UserID:    owner,
			ContentID: &contentID,
			Name:      &name,
			ActionID:  actionID,
			Status:    domain.UserTodoStatusNotStarted,
			Privacy:   domain.PrivacyPublic,
			DueDate:   &due,
		}
		if i < 5 {
			listID := list.ID
			position := i + 1
			todo.ListID = &listID
			todo.ListPosition = &position
		}
		_, err := todos.Create(ctx, todo)
		require.NoError(t, err)
	}
}

// TestUserTodosRoundTrips pins the cost of one page of userTodos selecting the
// owner, content, action and list of every row. Those four relations resolve
// through dataloaders, so the count must not grow with the number of rows.
func TestUserTodosRoundTrips(t *testing.T) {
	h := newHarness(t)
	owner, token := h.user("todos-page")
	seedUserTodos(t, h, owner, 12)
	h.warm(token)
	// The first page also fills the action cache (one lookup per process). Pin
	// the steady state, so run it once untimed.
	h.gql(token, userTodosRoundTripQuery, map[string]any{"first": 10})

	// Steady state: page, owners, lists and content, one batched query each;
	// actions come from the cache. Cold, the first page adds one action lookup.
	data := h.roundTrips(4, token, userTodosRoundTripQuery, map[string]any{"first": 10})

	page := decode[userTodoPage](t, data, "userTodos")
	require.Len(t, page.Items, 10)
	for _, it := range page.Items {
		require.Equal(t, "consume", it.Action.Key)
		require.NotNil(t, it.Content)
	}
}

// TestCreateUserTodoRoundTrips pins the cost of creating one todo about content
// with a preset action, returning the action through its loader.
func TestCreateUserTodoRoundTrips(t *testing.T) {
	h := newHarness(t)
	owner, token := h.user("todo-create")
	actionID := presetActionID(t, h, "consume")
	h.warm(token)
	// The first create fills the action cache (one lookup per process). Pin the
	// steady state: a second todo about other content, run untimed first.
	h.gql(token, createUserTodoRoundTripMutation, map[string]any{
		"input": map[string]any{"contentId": h.content(owner, "todo-create-warm"), "actionId": actionID},
	})
	contentID := h.content(owner, "todo-create")

	// Steady state: the INSERT alone; the action is cached and the response's
	// action resolves from the loader without a query.
	data := h.roundTrips(1, token, createUserTodoRoundTripMutation, map[string]any{
		"input": map[string]any{"contentId": contentID, "actionId": actionID, "priority": 5000},
	})

	type createdTodo struct {
		ID              string `json:"id"`
		Priority        *int   `json:"priority"`
		Status          string `json:"status"`
		PercentComplete int    `json:"percentComplete"`
		Action          struct {
			Key string `json:"key"`
		} `json:"action"`
	}
	got := decode[createdTodo](t, data, "createUserTodo")
	require.NotEmpty(t, got.ID)
	require.NotNil(t, got.Priority)
	require.Equal(t, 5000, *got.Priority)
	require.Equal(t, "NOT_STARTED", got.Status)
	require.Equal(t, "consume", got.Action.Key)
}
