package resolvers_test

// Privacy and ownership through the GraphQL layer for user todos ("Plan"). The
// viewer is injected per server (0 = anonymous), and the real dataloader
// middleware runs in front of the resolvers, so the list-privacy cases exercise
// the same batched path production uses.

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/auth"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/dataloader"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/directives"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/generated"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/resolvers"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
)

// utUsernames are the users the fixtures refer to. 1 owns most rows; 2 is the
// other signed-in user.
var utUsernames = map[int]string{1: "alice", 2: "bob"}

// utTodoRepo is an in-memory UserTodoRepository. Only the methods the tests reach
// are implemented; any other call panics (nil embedded interface). Writes are
// counted so a rejected request can be shown to have changed nothing.
type utTodoRepo struct {
	repositories.UserTodoRepository
	todos  []*domain.UserTodo
	writes int
}

func (r *utTodoRepo) List(_ context.Context, p domain.UserTodoListParams) (*domain.PaginatedUserTodos, error) {
	var items []*domain.UserTodo
	for _, t := range r.todos {
		visible := t.Privacy == domain.PrivacyPublic || (p.ViewerID != nil && *p.ViewerID == t.UserID)
		if p.RestrictToPublicOrOwner && !visible {
			continue
		}
		items = append(items, t)
	}
	return &domain.PaginatedUserTodos{Items: items}, nil
}

func (r *utTodoRepo) GetByID(_ context.Context, id int) (*domain.UserTodo, error) {
	for _, t := range r.todos {
		if t.ID == id {
			return t, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (r *utTodoRepo) Create(context.Context, *domain.UserTodo) (*domain.UserTodo, error) {
	r.writes++
	return nil, errors.New("unexpected write")
}

// Update and Delete are owner-scoped like the SQL: a row under another owner is
// ErrForbidden and writes nothing; only a permitted write is counted.
func (r *utTodoRepo) Update(ctx context.Context, todo *domain.UserTodo, actorUserID int) (*domain.UserTodo, error) {
	existing, err := r.GetByID(ctx, todo.ID)
	if err != nil {
		return nil, err
	}
	if existing.UserID != actorUserID {
		return nil, domain.ErrForbidden
	}
	r.writes++
	return todo, nil
}

func (r *utTodoRepo) Delete(ctx context.Context, id int, actorUserID int) error {
	existing, err := r.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if existing.UserID != actorUserID {
		return domain.ErrForbidden
	}
	r.writes++
	return nil
}

func (r *utTodoRepo) UnlistAll(context.Context, int, int) error {
	r.writes++
	return errors.New("unexpected write")
}

func (r *utTodoRepo) Reorder(context.Context, int, []int, int) ([]*domain.UserTodo, error) {
	r.writes++
	return nil, errors.New("unexpected write")
}

// utListRepo is an in-memory UserTodoListRepository.
type utListRepo struct {
	repositories.UserTodoListRepository
	lists  []*domain.UserTodoList
	writes int
}

func (r *utListRepo) ListByUser(_ context.Context, userID int, includePrivate bool) ([]*domain.UserTodoList, error) {
	var out []*domain.UserTodoList
	for _, l := range r.lists {
		if l.UserID != userID {
			continue
		}
		if l.Privacy == domain.PrivacyPrivate && !includePrivate {
			continue
		}
		out = append(out, l)
	}
	return out, nil
}

func (r *utListRepo) GetByID(_ context.Context, id int) (*domain.UserTodoList, error) {
	for _, l := range r.lists {
		if l.ID == id {
			return l, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (r *utListRepo) GetByIDs(_ context.Context, ids []int) ([]*domain.UserTodoList, error) {
	var out []*domain.UserTodoList
	for _, id := range ids {
		for _, l := range r.lists {
			if l.ID == id {
				out = append(out, l)
			}
		}
	}
	return out, nil
}

func (r *utListRepo) Create(context.Context, *domain.UserTodoList) (*domain.UserTodoList, error) {
	r.writes++
	return nil, errors.New("unexpected write")
}

func (r *utListRepo) Update(context.Context, *domain.UserTodoList, int) (*domain.UserTodoList, error) {
	r.writes++
	return nil, errors.New("unexpected write")
}

func (r *utListRepo) Delete(context.Context, int, int) error {
	r.writes++
	return errors.New("unexpected write")
}

// utActionRepo is an in-memory TodoActionRepository.
type utActionRepo struct {
	repositories.TodoActionRepository
	actions []*domain.TodoAction
	writes  int
}

func (r *utActionRepo) GetByIDs(_ context.Context, ids []int) ([]*domain.TodoAction, error) {
	var out []*domain.TodoAction
	for _, id := range ids {
		for _, a := range r.actions {
			if a.ID == id {
				out = append(out, a)
			}
		}
	}
	return out, nil
}

func (r *utActionRepo) ListForUser(_ context.Context, userID int) ([]*domain.TodoAction, error) {
	var out []*domain.TodoAction
	for _, a := range r.actions {
		if a.UserID == nil || *a.UserID == userID {
			out = append(out, a)
		}
	}
	return out, nil
}

func (r *utActionRepo) Create(context.Context, *domain.TodoAction) (*domain.TodoAction, error) {
	r.writes++
	return nil, errors.New("unexpected write")
}

// utFixture is the data every test starts from.
type utFixture struct {
	todos   *utTodoRepo
	lists   *utListRepo
	actions *utActionRepo
}

func intPtr(v int) *int { return &v }

// newUTFixture: todos 1 and 3 are PUBLIC, 2 and 4 are PRIVATE; 1 and 2 belong to
// alice, 3 and 4 to bob. Todo 10 (alice, PUBLIC) sits in list 5 (alice, PRIVATE).
func newUTFixture() utFixture {
	consume := &domain.TodoAction{ID: 1, Key: "consume", Label: "Consume", Description: "Watch it", TypicalSequence: intPtr(2)}
	todo := func(id, owner int, privacy domain.Privacy) *domain.UserTodo {
		return &domain.UserTodo{
			ID: id, UserID: owner, ActionID: 1, Status: domain.UserTodoStatusNotStarted,
			Privacy: privacy, Name: utStrPtr(fmt.Sprintf("todo %d", id)),
		}
	}
	listed := todo(10, 1, domain.PrivacyPublic)
	listed.ListID = intPtr(5)
	listed.ListPosition = intPtr(1)
	return utFixture{
		todos: &utTodoRepo{todos: []*domain.UserTodo{
			todo(1, 1, domain.PrivacyPublic),
			todo(2, 1, domain.PrivacyPrivate),
			todo(3, 2, domain.PrivacyPublic),
			todo(4, 2, domain.PrivacyPrivate),
			listed,
		}},
		lists: &utListRepo{lists: []*domain.UserTodoList{
			{ID: 5, UserID: 1, Name: "secret plan", Privacy: domain.PrivacyPrivate},
			{ID: 6, UserID: 1, Name: "open plan", Privacy: domain.PrivacyPublic},
		}},
		actions: &utActionRepo{actions: []*domain.TodoAction{consume}},
	}
}

func utStrPtr(s string) *string { return &s }

// utServer serves the schema with the given viewer (0 = anonymous) in front of
// the real dataloader middleware.
func utServer(t *testing.T, fx utFixture, viewer int) *httptest.Server {
	t.Helper()
	userRepo := &mockUserRepository{getByIDFn: func(_ context.Context, id int) (*domain.User, error) {
		name, ok := utUsernames[id]
		if !ok {
			return nil, domain.ErrNotFound
		}
		return &domain.User{ID: id, Username: name, Active: true, Role: domain.UserRoleDefault}, nil
	}}
	contentRepo := &mockContentRepository{}
	perspectiveRepo := &mockPerspectiveRepository{}
	contentService := services.NewContentService(contentRepo, &mockYouTubeClient{}, nil)
	userService := services.NewUserService(userRepo, contentRepo, perspectiveRepo, nil, nil, nil)
	perspectiveService := services.NewPerspectiveService(perspectiveRepo, userRepo)
	categoryService := services.NewCategoryService(&mockCategoryRepository{}, contentRepo, &mockWikidataClient{})
	todoService := services.NewUserTodoService(fx.todos, fx.lists, fx.actions)

	resolver := resolvers.NewResolver(contentService, userService, perspectiveService, categoryService, todoService, nil, nil, nil)
	directiveRoot := directives.NewDirectiveRoot(contentService, perspectiveService)
	gqlConfig := generated.Config{
		Resolvers: resolver,
		Directives: generated.DirectiveRoot{
			Auth:  directiveRoot.Auth,
			Owner: directiveRoot.Owner,
		},
	}
	srv := handler.NewDefaultServer(generated.NewExecutableSchema(gqlConfig))

	loaders := dataloader.Middleware(dataloader.Services{
		User:     userService,
		Content:  contentService,
		UserTodo: todoService,
	})
	return httptest.NewServer(loaders(utWithViewer(viewer, srv)))
}

// utWithViewer injects the authenticated caller, or none when viewer is 0.
func utWithViewer(viewer int, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		if viewer != 0 {
			ctx = auth.WithAuthenticatedUser(ctx, &domain.AuthenticatedUser{
				ID:       viewer,
				ClerkID:  fmt.Sprintf("clerk_%d", viewer),
				Username: utUsernames[viewer],
				Role:     domain.UserRoleDefault,
			})
		}
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

type utResponse struct {
	Data   json.RawMessage `json:"data"`
	Errors []struct {
		Message string `json:"message"`
	} `json:"errors"`
}

func utQuery(t *testing.T, srv *httptest.Server, query string) utResponse {
	t.Helper()
	body, err := json.Marshal(map[string]any{"query": query})
	require.NoError(t, err)
	resp, err := http.Post(srv.URL, "application/json", bytes.NewReader(body))
	require.NoError(t, err)
	defer resp.Body.Close()
	var out utResponse
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&out))
	return out
}

// utIDs decodes the ids of the items of userTodos.
func utIDs(t *testing.T, resp utResponse) []string {
	t.Helper()
	require.Empty(t, resp.Errors)
	var data struct {
		UserTodos struct {
			Items []struct {
				ID string `json:"id"`
			} `json:"items"`
		} `json:"userTodos"`
	}
	require.NoError(t, json.Unmarshal(resp.Data, &data))
	ids := make([]string, 0, len(data.UserTodos.Items))
	for _, it := range data.UserTodos.Items {
		ids = append(ids, it.ID)
	}
	return ids
}

const utListQuery = `{ userTodos(first: 10) { items { id } } }`

func TestUserTodos_PrivacyFilterPerViewer(t *testing.T) {
	cases := []struct {
		name   string
		viewer int
		want   []string
	}{
		{"anonymous sees public rows only", 0, []string{"1", "3", "10"}},
		{"other user sees public rows and their own private row, not the owner's", 2, []string{"1", "3", "4", "10"}},
		{"owner sees their private row too", 1, []string{"1", "2", "3", "10"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv := utServer(t, newUTFixture(), tc.viewer)
			defer srv.Close()

			assert.ElementsMatch(t, tc.want, utIDs(t, utQuery(t, srv, utListQuery)))
		})
	}
}

func TestUserTodoByID_PrivateRowIsNullForNonOwners(t *testing.T) {
	cases := []struct {
		name   string
		viewer int
		id     string
		found  bool
	}{
		{"anonymous: public row", 0, "1", true},
		{"anonymous: private row is null", 0, "2", false},
		{"other user: someone else's private row is null", 2, "2", false},
		{"owner: own private row", 1, "2", true},
		{"missing row is null", 1, "999", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv := utServer(t, newUTFixture(), tc.viewer)
			defer srv.Close()

			resp := utQuery(t, srv, fmt.Sprintf(`{ userTodoByID(id: %q) { id privacy } }`, tc.id))
			require.Empty(t, resp.Errors)
			var data struct {
				UserTodoByID *struct {
					ID      string `json:"id"`
					Privacy string `json:"privacy"`
				} `json:"userTodoByID"`
			}
			require.NoError(t, json.Unmarshal(resp.Data, &data))
			if tc.found {
				require.NotNil(t, data.UserTodoByID)
				assert.Equal(t, tc.id, data.UserTodoByID.ID)
			} else {
				assert.Nil(t, data.UserTodoByID)
			}
		})
	}
}

func TestUserTodoList_PrivateListIsNullForNonOwners(t *testing.T) {
	// Todo 10 is PUBLIC but sits in alice's PRIVATE list 5. The todo is visible
	// to everyone; the list must not be.
	cases := []struct {
		name     string
		viewer   int
		wantList bool
	}{
		{"anonymous: list is null", 0, false},
		{"other user: list is null", 2, false},
		{"owner: list is returned", 1, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv := utServer(t, newUTFixture(), tc.viewer)
			defer srv.Close()

			resp := utQuery(t, srv, `{ userTodoByID(id: "10") { id list { id name } } }`)
			require.Empty(t, resp.Errors)
			var data struct {
				UserTodoByID struct {
					ID   string `json:"id"`
					List *struct {
						ID   string `json:"id"`
						Name string `json:"name"`
					} `json:"list"`
				} `json:"userTodoByID"`
			}
			require.NoError(t, json.Unmarshal(resp.Data, &data))
			require.Equal(t, "10", data.UserTodoByID.ID)
			if tc.wantList {
				require.NotNil(t, data.UserTodoByID.List)
				assert.Equal(t, "5", data.UserTodoByID.List.ID)
				assert.Equal(t, "secret plan", data.UserTodoByID.List.Name)
			} else {
				assert.Nil(t, data.UserTodoByID.List, "a private list must not be revealed to a non-owner")
			}
		})
	}
}

func TestUserTodoLists_PrivateListsOnlyToOwner(t *testing.T) {
	cases := []struct {
		name   string
		viewer int
		want   []string
	}{
		{"anonymous: public lists only", 0, []string{"6"}},
		{"other user: public lists only", 2, []string{"6"}},
		{"owner: private lists too", 1, []string{"5", "6"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv := utServer(t, newUTFixture(), tc.viewer)
			defer srv.Close()

			resp := utQuery(t, srv, `{ userTodoLists(userId: "1") { id } }`)
			require.Empty(t, resp.Errors)
			var data struct {
				UserTodoLists []struct {
					ID string `json:"id"`
				} `json:"userTodoLists"`
			}
			require.NoError(t, json.Unmarshal(resp.Data, &data))
			got := make([]string, 0, len(data.UserTodoLists))
			for _, l := range data.UserTodoLists {
				got = append(got, l.ID)
			}
			assert.ElementsMatch(t, tc.want, got)
		})
	}
}

// Every user todo mutation and the todoActions query are @auth: an anonymous
// caller is refused before any resolver runs, and nothing is written.
func TestUserTodoOperations_RejectAnonymous(t *testing.T) {
	operations := map[string]string{
		"createUserTodo":      `mutation { createUserTodo(input: { actionId: 1, name: "x" }) { id } }`,
		"updateUserTodo":      `mutation { updateUserTodo(input: { id: 1, priority: 5 }) { id } }`,
		"deleteUserTodo":      `mutation { deleteUserTodo(id: "1") }`,
		"createTodoAction":    `mutation { createTodoAction(input: { label: "Skim" }) { id } }`,
		"createUserTodoList":  `mutation { createUserTodoList(input: { name: "plan" }) { id } }`,
		"updateUserTodoList":  `mutation { updateUserTodoList(input: { id: 5, name: "x" }) { id } }`,
		"deleteUserTodoList":  `mutation { deleteUserTodoList(id: "5") }`,
		"reorderUserTodoList": `mutation { reorderUserTodoList(listId: 5, todoIds: [1]) { id } }`,
		"todoActions":         `{ todoActions { id } }`,
	}
	for name, query := range operations {
		t.Run(name, func(t *testing.T) {
			fx := newUTFixture()
			srv := utServer(t, fx, 0)
			defer srv.Close()

			resp := utQuery(t, srv, query)
			require.NotEmpty(t, resp.Errors, "anonymous %s must be refused", name)
			assert.Contains(t, resp.Errors[0].Message, "access denied")
			assert.Zero(t, fx.todos.writes+fx.lists.writes+fx.actions.writes, "a refused request must not write")
		})
	}
}

func TestUpdateUserTodo_NonOwnerPrivateIsNotFoundPublicIsForbidden(t *testing.T) {
	cases := []struct {
		name    string
		id      string
		wantMsg string
	}{
		// Todo 2 is PRIVATE to alice: bob can't confirm it exists.
		{"private todo of another user is not found", "2", "not found"},
		// Todo 1 is PUBLIC to alice: bob can see it, so he's told he may not change it.
		{"public todo of another user is forbidden", "1", "access denied"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newUTFixture()
			srv := utServer(t, fx, 2)
			defer srv.Close()

			resp := utQuery(t, srv, fmt.Sprintf(`mutation { updateUserTodo(input: { id: %q, priority: 5 }) { id } }`, tc.id))
			require.NotEmpty(t, resp.Errors)
			assert.Contains(t, resp.Errors[0].Message, tc.wantMsg)
			assert.Zero(t, fx.todos.writes, "a non-owner update must not write")
		})
	}
}

func TestDeleteUserTodo_NonOwnerIsRefusedAndWritesNothing(t *testing.T) {
	fx := newUTFixture()
	srv := utServer(t, fx, 2)
	defer srv.Close()

	resp := utQuery(t, srv, `mutation { deleteUserTodo(id: "1") }`)
	require.NotEmpty(t, resp.Errors)
	assert.Contains(t, resp.Errors[0].Message, "access denied")
	assert.Zero(t, fx.todos.writes)
}
