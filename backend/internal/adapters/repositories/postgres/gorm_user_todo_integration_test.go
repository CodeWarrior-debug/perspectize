package postgres

// Integration tests for the user todo repositories against a real Postgres.
//
// They run only when DATABASE_URL points at the LOCAL throwaway database
// (host localhost or 127.0.0.1, database name "testdb"). Any other URL, including
// the shared Neon database, makes the tests skip, so they can never write there.
//
//	DATABASE_URL="postgres://postgres:postgres@localhost:5432/testdb?sslmode=disable" \
//	  go test -p 1 ./internal/adapters/repositories/postgres/ -run UserTodoIntegration -v

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	gormpg "gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// openLocalUserTodoTestDB connects to DATABASE_URL only when it names the local
// testdb. Anything else skips the test.
func openLocalUserTodoTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping user todo integration tests")
	}
	u, err := url.Parse(dsn)
	if err != nil {
		t.Skip("DATABASE_URL does not parse; skipping user todo integration tests")
	}
	host, dbName := u.Hostname(), strings.TrimPrefix(u.Path, "/")
	if (host != "localhost" && host != "127.0.0.1") || dbName != "testdb" {
		t.Skipf("refusing to run user todo integration tests against host %q database %q: only the local testdb is allowed", host, dbName)
	}

	db, err := gorm.Open(gormpg.Open(dsn), &gorm.Config{
		SkipDefaultTransaction: true,
		Logger:                 logger.Default.LogMode(logger.Silent),
	})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := sqlDB.Ping(); err != nil {
		t.Skipf("local testdb not reachable: %v", err)
	}
	return db
}

type userTodoFixture struct {
	db        *gorm.DB
	todos     *GormUserTodoRepository
	lists     *GormUserTodoListRepository
	actions   *GormTodoActionRepository
	ownerA    int
	ownerB    int
	sentinel  int
	contentID int
	consumeID int
}

// newUserTodoFixture creates three fresh users (owner A, owner B and a sentinel
// standing in for [deleted]), one content row and the consume preset, and
// removes everything it created when the test ends.
func newUserTodoFixture(t *testing.T) *userTodoFixture {
	t.Helper()
	db := openLocalUserTodoTestDB(t)
	ctx := context.Background()

	salt := time.Now().UnixNano()
	// users.username is varchar(24): keep the generated names short.
	mkUser := func(label string) int {
		var id int
		require.NoError(t, db.Raw("INSERT INTO users (username) VALUES (?) RETURNING id",
			fmt.Sprintf("ti-%s-%06x", label, salt&0xFFFFFF)).Scan(&id).Error)
		return id
	}
	f := &userTodoFixture{
		db:       db,
		todos:    NewGormUserTodoRepository(db),
		lists:    NewGormUserTodoListRepository(db),
		actions:  NewGormTodoActionRepository(db),
		ownerA:   mkUser("a"),
		ownerB:   mkUser("b"),
		sentinel: mkUser("sentinel"),
	}
	require.NoError(t, db.Raw("INSERT INTO content (name, content_type, added_by_user_id) VALUES (?, 'movie', ?) RETURNING id",
		fmt.Sprintf("todo-it-content-%x", salt), f.ownerA).Scan(&f.contentID).Error)

	consume, err := f.actions.GetByKey(ctx, nil, "consume")
	require.NoError(t, err)
	f.consumeID = consume.ID

	t.Cleanup(func() {
		ids := []int{f.ownerA, f.ownerB, f.sentinel}
		db.Exec("DELETE FROM user_todos WHERE user_id IN ?", ids)
		db.Exec("DELETE FROM user_todo_lists WHERE user_id IN ?", ids)
		db.Exec("DELETE FROM todo_actions WHERE user_id IN ?", ids)
		db.Exec("DELETE FROM content WHERE id = ?", f.contentID)
		db.Exec("DELETE FROM users WHERE id IN ?", ids)
	})
	return f
}

func (f *userTodoFixture) newTodo(t *testing.T, owner int, name *string, actionID int, priority *int) *domain.UserTodo {
	t.Helper()
	got, err := f.todos.Create(context.Background(), &domain.UserTodo{
		UserID: owner, Name: name, ActionID: actionID, Priority: priority,
		Status: domain.UserTodoStatusNotStarted, PercentComplete: 0, Privacy: domain.PrivacyPublic,
	})
	require.NoError(t, err)
	return got
}

func TestUserTodoIntegration_CreateAndOpenUniqueness(t *testing.T) {
	f := newUserTodoFixture(t)
	ctx := context.Background()

	created, err := f.todos.Create(ctx, &domain.UserTodo{
		UserID: f.ownerA, ContentID: pInt(f.contentID), ActionID: f.consumeID,
		Priority: pInt(7500), Status: domain.UserTodoStatusInProgress, PercentComplete: 30,
		StartDate: userTodoDate(3), DueDate: userTodoDate(20), Comments: strPtr("<p>notes</p>"),
		Privacy: domain.PrivacyPublic,
	})
	require.NoError(t, err)
	require.NotZero(t, created.ID)

	got, err := f.todos.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, domain.UserTodoStatusInProgress, got.Status)
	require.NotNil(t, got.Priority)
	assert.Equal(t, 7500, *got.Priority)
	require.NotNil(t, got.StartDate)
	assert.Equal(t, "2026-10-03", got.StartDate.Format("2006-01-02"), "date-only column round-trips")
	assert.Nil(t, got.EndDate)
	require.NotNil(t, got.DueDate)
	assert.Equal(t, "2026-10-20", got.DueDate.Format("2006-01-02"))

	_, err = f.todos.Create(ctx, &domain.UserTodo{
		UserID: f.ownerA, ContentID: pInt(f.contentID), ActionID: f.consumeID,
		Status: domain.UserTodoStatusNotStarted, Privacy: domain.PrivacyPublic,
	})
	assert.True(t, errors.Is(err, domain.ErrAlreadyExists), "second open consume on the same content: %v", err)

	// A finished todo no longer blocks a new open one for the same action.
	done := *created
	done.Status = domain.UserTodoStatusDone
	done.PercentComplete = 100
	_, err = f.todos.Update(ctx, &done, f.ownerA)
	require.NoError(t, err)
	_, err = f.todos.Create(ctx, &domain.UserTodo{
		UserID: f.ownerA, ContentID: pInt(f.contentID), ActionID: f.consumeID,
		Status: domain.UserTodoStatusNotStarted, Privacy: domain.PrivacyPublic,
	})
	require.NoError(t, err, "a done todo must not block a new open one")
}

func TestUserTodoIntegration_CreateFKErrors(t *testing.T) {
	f := newUserTodoFixture(t)
	ctx := context.Background()

	_, err := f.todos.Create(ctx, &domain.UserTodo{UserID: f.ownerA, ActionID: 999999999, Name: strPtr("x"), Status: domain.UserTodoStatusNotStarted})
	assert.True(t, errors.Is(err, domain.ErrInvalidInput), "missing action: %v", err)

	_, err = f.todos.Create(ctx, &domain.UserTodo{UserID: f.ownerA, ActionID: f.consumeID, ContentID: pInt(999999999), Status: domain.UserTodoStatusNotStarted})
	assert.True(t, errors.Is(err, domain.ErrInvalidInput), "missing content: %v", err)

	_, err = f.todos.Create(ctx, &domain.UserTodo{UserID: 999999999, ActionID: f.consumeID, Name: strPtr("x"), Status: domain.UserTodoStatusNotStarted})
	assert.True(t, errors.Is(err, domain.ErrNotFound), "missing user: %v", err)
}

func TestUserTodoIntegration_OwnerScopedWrites(t *testing.T) {
	f := newUserTodoFixture(t)
	ctx := context.Background()
	todo := f.newTodo(t, f.ownerA, strPtr("watch it"), f.consumeID, pInt(100))

	t.Run("non-owner update is forbidden and changes nothing", func(t *testing.T) {
		attempt := *todo
		attempt.Status = domain.UserTodoStatusDropped
		_, err := f.todos.Update(ctx, &attempt, f.ownerB)
		assert.True(t, errors.Is(err, domain.ErrForbidden), "got %v", err)

		stored, err := f.todos.GetByID(ctx, todo.ID)
		require.NoError(t, err)
		assert.Equal(t, domain.UserTodoStatusNotStarted, stored.Status)
	})

	t.Run("missing id is not found", func(t *testing.T) {
		_, err := f.todos.Update(ctx, &domain.UserTodo{ID: 999999999, UserID: f.ownerA, ActionID: f.consumeID}, f.ownerA)
		assert.True(t, errors.Is(err, domain.ErrNotFound), "got %v", err)
	})

	t.Run("owner update writes NULLs for cleared fields", func(t *testing.T) {
		edit := *todo
		edit.Priority = nil
		edit.Status = domain.UserTodoStatusInProgress
		edit.PercentComplete = 55
		edit.StartDate = userTodoDate(4)
		edit.Name = nil
		edit.ContentID = pInt(f.contentID)
		updated, err := f.todos.Update(ctx, &edit, f.ownerA)
		require.NoError(t, err)
		assert.Nil(t, updated.Priority)
		assert.Equal(t, 55, updated.PercentComplete)

		stored, err := f.todos.GetByID(ctx, todo.ID)
		require.NoError(t, err)
		assert.Nil(t, stored.Priority, "priority must be NULL in the database")
		assert.Nil(t, stored.Name, "name must be NULL in the database")
		assert.Equal(t, domain.UserTodoStatusInProgress, stored.Status)
		require.NotNil(t, stored.ContentID)
		assert.Equal(t, f.contentID, *stored.ContentID)
		assert.Equal(t, f.ownerA, stored.UserID, "owner is never rewritten by Update")
	})

	t.Run("non-owner delete is forbidden; owner delete removes the row", func(t *testing.T) {
		err := f.todos.Delete(ctx, todo.ID, f.ownerB)
		assert.True(t, errors.Is(err, domain.ErrForbidden), "got %v", err)

		require.NoError(t, f.todos.Delete(ctx, todo.ID, f.ownerA))
		_, err = f.todos.GetByID(ctx, todo.ID)
		assert.True(t, errors.Is(err, domain.ErrNotFound))
	})
}

func TestUserTodoIntegration_PrivacyAndPaging(t *testing.T) {
	f := newUserTodoFixture(t)
	ctx := context.Background()

	// A: a public todo at 300, a private one at 200, and a public one with no priority.
	pub300 := f.newTodo(t, f.ownerA, strPtr("pub-300"), f.consumeID, pInt(300))
	_ = f.newTodo(t, f.ownerA, strPtr("pub-none"), f.consumeID, nil)
	priv := f.newTodo(t, f.ownerA, strPtr("priv-200"), f.consumeID, pInt(200))
	privacy := domain.PrivacyPrivate
	priv.Privacy = privacy
	_, err := f.todos.Update(ctx, priv, f.ownerA)
	require.NoError(t, err)

	ownerFilter := &domain.UserTodoFilter{UserID: pInt(f.ownerA)}
	listAs := func(viewer *int, first int, after *string, sortBy domain.UserTodoSortBy, order domain.SortOrder) *domain.PaginatedUserTodos {
		page, err := f.todos.List(ctx, domain.UserTodoListParams{
			First: pInt(first), After: after, Filter: ownerFilter,
			SortBy: sortBy, SortOrder: order,
			ViewerID: viewer, RestrictToPublicOrOwner: true, IncludeTotalCount: true,
		})
		require.NoError(t, err)
		return page
	}
	names := func(page *domain.PaginatedUserTodos) []string {
		out := make([]string, 0, len(page.Items))
		for _, it := range page.Items {
			out = append(out, *it.Name)
		}
		return out
	}

	t.Run("anonymous viewer never sees the private todo", func(t *testing.T) {
		page := listAs(nil, 10, nil, domain.UserTodoSortByCreatedAt, domain.SortOrderAsc)
		assert.NotContains(t, names(page), "priv-200")
		require.NotNil(t, page.TotalCount)
		assert.Equal(t, 2, *page.TotalCount, "count respects the privacy predicate")
	})

	t.Run("other signed-in user does not see it either", func(t *testing.T) {
		viewer := f.ownerB
		page := listAs(&viewer, 10, nil, domain.UserTodoSortByCreatedAt, domain.SortOrderAsc)
		assert.NotContains(t, names(page), "priv-200")
	})

	t.Run("owner sees the private todo", func(t *testing.T) {
		viewer := f.ownerA
		page := listAs(&viewer, 10, nil, domain.UserTodoSortByCreatedAt, domain.SortOrderAsc)
		assert.Contains(t, names(page), "priv-200")
		assert.Len(t, page.Items, 3)
	})

	t.Run("priority ASC pages across NULLs with a stable cursor", func(t *testing.T) {
		viewer := f.ownerA
		first := listAs(&viewer, 2, nil, domain.UserTodoSortByPriority, domain.SortOrderAsc)
		assert.Equal(t, []string{"priv-200", "pub-300"}, names(first))
		assert.True(t, first.HasNext)
		require.NotNil(t, first.EndCursor)

		second := listAs(&viewer, 2, first.EndCursor, domain.UserTodoSortByPriority, domain.SortOrderAsc)
		assert.Equal(t, []string{"pub-none"}, names(second), "NULL priority sorts last")
		assert.False(t, second.HasNext)
	})

	t.Run("priority DESC still puts NULL last", func(t *testing.T) {
		viewer := f.ownerA
		page := listAs(&viewer, 10, nil, domain.UserTodoSortByPriority, domain.SortOrderDesc)
		assert.Equal(t, []string{"pub-300", "priv-200", "pub-none"}, names(page))
	})

	t.Run("due date ASC pages with NULL last", func(t *testing.T) {
		// pub-300 gets a due date; the others stay NULL. Page 1 then page 2.
		dueSet := *pub300
		dueSet.DueDate = userTodoDate(12)
		_, err := f.todos.Update(ctx, &dueSet, f.ownerA)
		require.NoError(t, err)

		viewer := f.ownerA
		first := listAs(&viewer, 1, nil, domain.UserTodoSortByDueDate, domain.SortOrderAsc)
		assert.Equal(t, []string{"pub-300"}, names(first))
		require.NotNil(t, first.EndCursor)

		second := listAs(&viewer, 1, first.EndCursor, domain.UserTodoSortByDueDate, domain.SortOrderAsc)
		require.Len(t, second.Items, 1)
		assert.NotEqual(t, "pub-300", *second.Items[0].Name)
		assert.Nil(t, second.Items[0].DueDate)
	})
}

func TestUserTodoIntegration_ListsAndUnlist(t *testing.T) {
	f := newUserTodoFixture(t)
	ctx := context.Background()

	pub, err := f.lists.Create(ctx, &domain.UserTodoList{UserID: f.ownerA, Name: "Watch later", Privacy: domain.PrivacyPublic})
	require.NoError(t, err)
	_, err = f.lists.Create(ctx, &domain.UserTodoList{UserID: f.ownerA, Name: "Watch later", Privacy: domain.PrivacyPublic})
	assert.True(t, errors.Is(err, domain.ErrAlreadyExists), "duplicate list name: %v", err)
	_, err = f.lists.Create(ctx, &domain.UserTodoList{UserID: f.ownerA, Name: "Secret", Privacy: domain.PrivacyPrivate})
	require.NoError(t, err)

	pubOnly, err := f.lists.ListByUser(ctx, f.ownerA, false)
	require.NoError(t, err)
	require.Len(t, pubOnly, 1)
	assert.Equal(t, "Watch later", pubOnly[0].Name)

	all, err := f.lists.ListByUser(ctx, f.ownerA, true)
	require.NoError(t, err)
	assert.Len(t, all, 2)

	t.Run("non-owner cannot delete or rename a list", func(t *testing.T) {
		err := f.lists.Delete(ctx, pub.ID, f.ownerB)
		assert.True(t, errors.Is(err, domain.ErrForbidden), "delete: %v", err)
		_, err = f.lists.Update(ctx, &domain.UserTodoList{ID: pub.ID, Name: "hijacked", Privacy: domain.PrivacyPublic}, f.ownerB)
		assert.True(t, errors.Is(err, domain.ErrForbidden), "update: %v", err)
	})

	t.Run("list with todos cannot be deleted until unlisted", func(t *testing.T) {
		todo := f.newTodo(t, f.ownerA, strPtr("in list"), f.consumeID, nil)
		pos, err := f.todos.NextListPosition(ctx, pub.ID)
		require.NoError(t, err)
		assert.Equal(t, 1, pos)

		listed := *todo
		listed.ListID = pInt(pub.ID)
		listed.ListPosition = pInt(pos)
		_, err = f.todos.Update(ctx, &listed, f.ownerA)
		require.NoError(t, err)

		err = f.lists.Delete(ctx, pub.ID, f.ownerA)
		assert.True(t, errors.Is(err, domain.ErrInvalidInput), "delete with todos: %v", err)

		require.NoError(t, f.todos.UnlistAll(ctx, pub.ID, f.ownerA))
		stored, err := f.todos.GetByID(ctx, todo.ID)
		require.NoError(t, err)
		assert.Nil(t, stored.ListID)
		assert.Nil(t, stored.ListPosition)

		require.NoError(t, f.lists.Delete(ctx, pub.ID, f.ownerA))
	})
}

func TestUserTodoIntegration_ReorderAndNextPosition(t *testing.T) {
	f := newUserTodoFixture(t)
	ctx := context.Background()

	list, err := f.lists.Create(ctx, &domain.UserTodoList{UserID: f.ownerA, Name: "Order", Privacy: domain.PrivacyPublic})
	require.NoError(t, err)

	var ids []int
	for i := 0; i < 3; i++ {
		todo := f.newTodo(t, f.ownerA, strPtr(fmt.Sprintf("ordered-%d", i)), f.consumeID, nil)
		pos, err := f.todos.NextListPosition(ctx, list.ID)
		require.NoError(t, err)
		listed := *todo
		listed.ListID = pInt(list.ID)
		listed.ListPosition = pInt(pos)
		_, err = f.todos.Update(ctx, &listed, f.ownerA)
		require.NoError(t, err)
		ids = append(ids, todo.ID)
	}

	next, err := f.todos.NextListPosition(ctx, list.ID)
	require.NoError(t, err)
	assert.Equal(t, 4, next)

	t.Run("non-owner reorder changes nothing", func(t *testing.T) {
		got, err := f.todos.Reorder(ctx, list.ID, []int{ids[2], ids[0], ids[1]}, f.ownerB)
		require.NoError(t, err)
		assert.Empty(t, got)
	})

	t.Run("owner reorder rewrites positions 1..N in one statement", func(t *testing.T) {
		got, err := f.todos.Reorder(ctx, list.ID, []int{ids[2], ids[0], ids[1]}, f.ownerA)
		require.NoError(t, err)
		require.Len(t, got, 3)
		assert.Equal(t, ids[2], got[0].ID)
		assert.Equal(t, 1, *got[0].ListPosition)
		assert.Equal(t, ids[0], got[1].ID)
		assert.Equal(t, 2, *got[1].ListPosition)

		stored, err := f.todos.GetByID(ctx, ids[1])
		require.NoError(t, err)
		require.NotNil(t, stored.ListPosition)
		assert.Equal(t, 3, *stored.ListPosition)
	})
}

func TestUserTodoIntegration_ReassignByUser(t *testing.T) {
	f := newUserTodoFixture(t)
	ctx := context.Background()

	// Same names on both sides, so a plain reassign would collide on UNIQUE (user_id, name)
	// and UNIQUE NULLS NOT DISTINCT (user_id, key).
	_, err := f.lists.Create(ctx, &domain.UserTodoList{UserID: f.sentinel, Name: "Shared", Privacy: domain.PrivacyPublic})
	require.NoError(t, err)
	_, err = f.lists.Create(ctx, &domain.UserTodoList{UserID: f.ownerA, Name: "Shared", Privacy: domain.PrivacyPublic})
	require.NoError(t, err)

	_, err = f.actions.Create(ctx, &domain.TodoAction{Key: "podcast", Label: "Podcast", UserID: pInt(f.sentinel)})
	require.NoError(t, err)
	_, err = f.actions.Create(ctx, &domain.TodoAction{Key: "podcast", Label: "Podcast", UserID: pInt(f.ownerA)})
	require.NoError(t, err)

	todo := f.newTodo(t, f.ownerA, strPtr("moved"), f.consumeID, nil)

	require.NoError(t, f.lists.ReassignByUser(ctx, f.ownerA, f.sentinel))
	require.NoError(t, f.actions.ReassignByUser(ctx, f.ownerA, f.sentinel))
	require.NoError(t, f.todos.ReassignByUser(ctx, f.ownerA, f.sentinel))

	moved, err := f.todos.GetByID(ctx, todo.ID)
	require.NoError(t, err)
	assert.Equal(t, f.sentinel, moved.UserID)

	sentinelLists, err := f.lists.ListByUser(ctx, f.sentinel, true)
	require.NoError(t, err)
	names := make([]string, 0, len(sentinelLists))
	for _, l := range sentinelLists {
		names = append(names, l.Name)
	}
	assert.Len(t, sentinelLists, 2)
	assert.Contains(t, names, "Shared")
	assert.Condition(t, func() bool {
		for _, n := range names {
			if strings.HasPrefix(n, "Shared (#") {
				return true
			}
		}
		return false
	}, "the moved list is renamed with an id suffix, got %v", names)

	ownerAActions, err := f.actions.ListForUser(ctx, f.ownerA)
	require.NoError(t, err)
	for _, a := range ownerAActions {
		assert.True(t, a.IsPreset(), "owner A keeps no custom actions after reassignment: %s", a.Key)
	}
}
