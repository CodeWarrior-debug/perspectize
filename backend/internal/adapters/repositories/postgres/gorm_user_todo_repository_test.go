package postgres

import (
	"context"
	"database/sql/driver"
	"errors"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/perf/querycount"
	"github.com/DATA-DOG/go-sqlmock"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var userTodoTime = time.Date(2026, 10, 10, 9, 0, 0, 0, time.UTC)

func userTodoDate(day int) *time.Time {
	d := time.Date(2026, 10, day, 0, 0, 0, 0, time.UTC)
	return &d
}

func userTodoRows() *sqlmock.Rows {
	return sqlmock.NewRows([]string{
		"id", "user_id", "content_id", "name", "action_id", "priority", "status",
		"percent_complete", "start_date", "end_date", "due_date", "comments",
		"privacy", "list_id", "list_position", "created_at", "updated_at",
	})
}

// addUserTodoRow adds one fully populated todo row: owner 7, content 11, action 2,
// priority 5000, in_progress, 40%, start date set, no list.
func addUserTodoRow(rows *sqlmock.Rows, id int) *sqlmock.Rows {
	return rows.AddRow(
		id, 7, 11, nil, 2, 5000, "in_progress",
		40, userTodoDate(1), nil, userTodoDate(20), "<p>hi</p>",
		"public", nil, nil, userTodoTime, userTodoTime,
	)
}

func userTodoListRows() *sqlmock.Rows {
	return sqlmock.NewRows([]string{"id", "user_id", "name", "description", "privacy", "created_at", "updated_at"})
}

func TestUserTodoStatusConverters(t *testing.T) {
	assert.Equal(t, "not_started", userTodoStatusToDBValue(domain.UserTodoStatusNotStarted))
	assert.Equal(t, "in_progress", userTodoStatusToDBValue(domain.UserTodoStatusInProgress))
	assert.Equal(t, "done", userTodoStatusToDBValue(domain.UserTodoStatusDone))
	assert.Equal(t, "dropped", userTodoStatusToDBValue(domain.UserTodoStatusDropped))
	assert.Equal(t, domain.UserTodoStatusNotStarted, userTodoStatusFromDBValue("not_started"))
	assert.Equal(t, domain.UserTodoStatusDone, userTodoStatusFromDBValue("DONE"))
}

func TestBuildUserTodoSortRules(t *testing.T) {
	t.Run("priority ASC puts NULL above every rating, tie-break by ID in the same direction", func(t *testing.T) {
		rules := buildUserTodoSortRules(domain.UserTodoSortByPriority, domain.SortOrderAsc)
		require.Len(t, rules, 2)
		assert.Equal(t, "Priority", rules[0].Key)
		assert.Equal(t, 10001, rules[0].NULLReplacement)
		assert.Equal(t, "ID", rules[1].Key)
		assert.Equal(t, "ASC", string(rules[1].Order))
	})

	t.Run("priority DESC puts NULL below every rating", func(t *testing.T) {
		rules := buildUserTodoSortRules(domain.UserTodoSortByPriority, domain.SortOrderDesc)
		assert.Equal(t, -1, rules[0].NULLReplacement)
		assert.Equal(t, "DESC", string(rules[0].Order))
	})

	t.Run("due date and list position use NULL replacements for both directions", func(t *testing.T) {
		due := buildUserTodoSortRules(domain.UserTodoSortByDueDate, domain.SortOrderAsc)
		assert.Equal(t, "DueDate", due[0].Key)
		assert.Equal(t, "9999-12-31", due[0].NULLReplacement)
		assert.Equal(t, "0001-01-01", buildUserTodoSortRules(domain.UserTodoSortByDueDate, domain.SortOrderDesc)[0].NULLReplacement)

		pos := buildUserTodoSortRules(domain.UserTodoSortByListPosition, domain.SortOrderAsc)
		assert.Equal(t, "ListPosition", pos[0].Key)
		assert.Equal(t, 2147483647, pos[0].NULLReplacement)
		assert.Equal(t, -1, buildUserTodoSortRules(domain.UserTodoSortByListPosition, domain.SortOrderDesc)[0].NULLReplacement)
	})

	t.Run("created and updated sorts have no NULL replacement", func(t *testing.T) {
		created := buildUserTodoSortRules(domain.UserTodoSortByCreatedAt, domain.SortOrderAsc)
		assert.Equal(t, "CreatedAt", created[0].Key)
		assert.Nil(t, created[0].NULLReplacement)
		updated := buildUserTodoSortRules(domain.UserTodoSortByUpdatedAt, domain.SortOrderDesc)
		assert.Equal(t, "UpdatedAt", updated[0].Key)
	})

	t.Run("unknown sort falls back to CreatedAt DESC", func(t *testing.T) {
		rules := buildUserTodoSortRules("", domain.SortOrderAsc)
		assert.Equal(t, "CreatedAt", rules[0].Key)
		assert.Equal(t, "DESC", string(rules[0].Order))
	})
}

func TestGormUserTodoRepository_List(t *testing.T) {
	ctx := context.Background()

	t.Run("one page query maps rows and leaves TotalCount nil", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT \* FROM "user_todos" ORDER BY user_todos\.created_at DESC`).
			WillReturnRows(addUserTodoRow(userTodoRows(), 5))

		c := querycount.Attach(t, db)
		got, err := NewGormUserTodoRepository(db).List(ctx, domain.UserTodoListParams{
			SortBy: domain.UserTodoSortByCreatedAt, SortOrder: domain.SortOrderDesc,
		})
		require.NoError(t, err)
		c.AssertExactly(t, 1)
		require.Len(t, got.Items, 1)
		assert.Equal(t, 5, got.Items[0].ID)
		assert.Equal(t, domain.UserTodoStatusInProgress, got.Items[0].Status)
		assert.Equal(t, domain.PrivacyPublic, got.Items[0].Privacy)
		require.NotNil(t, got.Items[0].DueDate)
		assert.Nil(t, got.TotalCount)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("IncludeTotalCount adds exactly one COUNT query", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT count\(\*\) FROM "user_todos"`).
			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(12))
		mock.ExpectQuery(`SELECT \* FROM "user_todos"`).WillReturnRows(userTodoRows())

		c := querycount.Attach(t, db)
		got, err := NewGormUserTodoRepository(db).List(ctx, domain.UserTodoListParams{IncludeTotalCount: true})
		require.NoError(t, err)
		c.AssertExactly(t, 2)
		require.NotNil(t, got.TotalCount)
		assert.Equal(t, 12, *got.TotalCount)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("count failure is wrapped and short-circuits", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT count\(\*\) FROM "user_todos"`).WillReturnError(errors.New("todo count boom"))

		got, err := NewGormUserTodoRepository(db).List(ctx, domain.UserTodoListParams{IncludeTotalCount: true})
		assert.Nil(t, got)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to count user todos")
		assertAllExpectationsMet(t, mock)
	})

	t.Run("page query failure is wrapped (named err and pageResult.Error both checked)", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT \* FROM "user_todos"`).WillReturnError(errors.New("todo page boom"))

		got, err := NewGormUserTodoRepository(db).List(ctx, domain.UserTodoListParams{})
		assert.Nil(t, got)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to list user todos")
		assert.Contains(t, err.Error(), "todo page boom")
		assertAllExpectationsMet(t, mock)
	})

	t.Run("RestrictToPublicOrOwner with a viewer adds public-or-owner predicate", func(t *testing.T) {
		db, mock := newMockDB(t)
		// With a second condition GORM wraps the OR in parentheses, so the owner
		// filter can't bind into the privacy predicate.
		mock.ExpectQuery(`WHERE user_id = \$1 AND \(privacy = \$2 OR user_id = \$3\)`).
			WillReturnRows(addUserTodoRow(userTodoRows(), 5))

		viewer := 7
		got, err := NewGormUserTodoRepository(db).List(ctx, domain.UserTodoListParams{
			Filter:                  &domain.UserTodoFilter{UserID: pInt(9)},
			ViewerID:                &viewer,
			RestrictToPublicOrOwner: true,
			SortBy:                  domain.UserTodoSortByCreatedAt,
			SortOrder:               domain.SortOrderDesc,
		})
		require.NoError(t, err)
		require.Len(t, got.Items, 1)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("RestrictToPublicOrOwner with no viewer restricts to public only", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`WHERE privacy = \$1 ORDER BY`).WillReturnRows(userTodoRows())

		_, err := NewGormUserTodoRepository(db).List(ctx, domain.UserTodoListParams{RestrictToPublicOrOwner: true})
		require.NoError(t, err)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("RestrictToPublicOrOwner false adds no privacy predicate", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT \* FROM "user_todos" ORDER BY`).WillReturnRows(userTodoRows())

		_, err := NewGormUserTodoRepository(db).List(ctx, domain.UserTodoListParams{})
		require.NoError(t, err)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("status filter uses = ANY over a text array", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`WHERE status = ANY\(CAST\(\$1 AS text\[\]\)\)`).
			WithArgs("{not_started,done}", 11).
			WillReturnRows(userTodoRows())

		_, err := NewGormUserTodoRepository(db).List(ctx, domain.UserTodoListParams{
			Filter: &domain.UserTodoFilter{Statuses: []domain.UserTodoStatus{
				domain.UserTodoStatusNotStarted, domain.UserTodoStatusDone,
			}},
		})
		require.NoError(t, err)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("unlisted filter becomes list_id IS NULL and ListID wins over it", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`WHERE list_id IS NULL`).WillReturnRows(userTodoRows())
		_, err := NewGormUserTodoRepository(db).List(ctx, domain.UserTodoListParams{
			Filter: &domain.UserTodoFilter{Unlisted: true},
		})
		require.NoError(t, err)
		assertAllExpectationsMet(t, mock)

		db2, mock2 := newMockDB(t)
		mock2.ExpectQuery(`WHERE list_id = \$1`).WithArgs(3, 11).WillReturnRows(userTodoRows())
		_, err = NewGormUserTodoRepository(db2).List(ctx, domain.UserTodoListParams{
			Filter: &domain.UserTodoFilter{ListID: pInt(3), Unlisted: true},
		})
		require.NoError(t, err)
		assertAllExpectationsMet(t, mock2)
	})

	t.Run("priority sort orders NULLs last via COALESCE in both directions", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`ORDER BY COALESCE\(user_todos\.priority, '10001'\) ASC, user_todos\.id ASC`).
			WillReturnRows(userTodoRows())
		_, err := NewGormUserTodoRepository(db).List(ctx, domain.UserTodoListParams{
			SortBy: domain.UserTodoSortByPriority, SortOrder: domain.SortOrderAsc,
		})
		require.NoError(t, err)
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormUserTodoRepository_GetByID(t *testing.T) {
	ctx := context.Background()

	t.Run("maps the row", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT \* FROM "user_todos" WHERE "user_todos"."id" = \$1`).
			WillReturnRows(addUserTodoRow(userTodoRows(), 5))

		got, err := NewGormUserTodoRepository(db).GetByID(ctx, 5)
		require.NoError(t, err)
		assert.Equal(t, 5, got.ID)
		assert.Equal(t, 40, got.PercentComplete)
		assert.Equal(t, domain.UserTodoStatusInProgress, got.Status)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("no row maps to domain.ErrNotFound", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT \* FROM "user_todos"`).WillReturnRows(userTodoRows())

		_, err := NewGormUserTodoRepository(db).GetByID(ctx, 404)
		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected ErrNotFound, got %v", err)
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormUserTodoRepository_GetByIDs(t *testing.T) {
	ctx := context.Background()

	t.Run("one ANY(bigint[]) query for one id", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT \* FROM "user_todos" WHERE id = ANY\(CAST\(\$1 AS bigint\[\]\)\)`).
			WithArgs("{1}").
			WillReturnRows(addUserTodoRow(userTodoRows(), 1))

		c := querycount.Attach(t, db)
		got, err := NewGormUserTodoRepository(db).GetByIDs(ctx, []int{1})
		require.NoError(t, err)
		c.AssertExactly(t, 1)
		require.Len(t, got, 1)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("50 ids cost the same single query", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`WHERE id = ANY\(CAST\(\$1 AS bigint\[\]\)\)`).WillReturnRows(userTodoRows())

		c := querycount.Attach(t, db)
		_, err := NewGormUserTodoRepository(db).GetByIDs(ctx, seqIDs(50))
		require.NoError(t, err)
		c.AssertExactly(t, 1)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("empty input issues no query", func(t *testing.T) {
		db, mock := newMockDB(t)

		c := querycount.Attach(t, db)
		got, err := NewGormUserTodoRepository(db).GetByIDs(ctx, nil)
		require.NoError(t, err)
		assert.Empty(t, got)
		c.AssertExactly(t, 0)
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormUserTodoRepository_Create(t *testing.T) {
	ctx := context.Background()

	t.Run("single INSERT ... RETURNING and maps the returned row", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`INSERT INTO "user_todos" .* RETURNING `).
			WillReturnRows(addUserTodoRow(userTodoRows(), 9))

		c := querycount.Attach(t, db)
		got, err := NewGormUserTodoRepository(db).Create(ctx, &domain.UserTodo{
			UserID: 7, ContentID: pInt(11), ActionID: 2, Status: domain.UserTodoStatusInProgress,
			Privacy: domain.PrivacyPublic, PercentComplete: 40,
		})
		require.NoError(t, err)
		c.AssertExactly(t, 1)
		assert.Equal(t, 9, got.ID)
		assert.Equal(t, userTodoTime, got.CreatedAt)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("empty status and privacy are written as the column defaults", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`INSERT INTO "user_todos" .* RETURNING `).
			WithArgs(7, 11, nil, 2, nil, "not_started", 0, nil, nil, nil, nil, "public", nil, nil, sqlmock.AnyArg(), sqlmock.AnyArg()).
			WillReturnRows(addUserTodoRow(userTodoRows(), 9))

		_, err := NewGormUserTodoRepository(db).Create(ctx, &domain.UserTodo{
			UserID: 7, ContentID: pInt(11), ActionID: 2,
		})
		require.NoError(t, err)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("open-todo unique index maps to domain.ErrAlreadyExists", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`INSERT INTO "user_todos"`).WillReturnError(&pgconn.PgError{
			Code: "23505", ConstraintName: "user_todos_open_content_action_unique",
		})

		got, err := NewGormUserTodoRepository(db).Create(ctx, &domain.UserTodo{UserID: 7, ContentID: pInt(11), ActionID: 2})
		assert.Nil(t, got)
		assert.True(t, errors.Is(err, domain.ErrAlreadyExists), "expected ErrAlreadyExists, got %v", err)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("missing content, action or list maps to domain.ErrInvalidInput", func(t *testing.T) {
		for _, constraint := range []string{"user_todos_content_fk", "user_todos_action_fk", "user_todos_list_fk"} {
			db, mock := newMockDB(t)
			mock.ExpectQuery(`INSERT INTO "user_todos"`).WillReturnError(&pgconn.PgError{Code: "23503", ConstraintName: constraint})

			_, err := NewGormUserTodoRepository(db).Create(ctx, &domain.UserTodo{UserID: 7, ActionID: 2})
			assert.True(t, errors.Is(err, domain.ErrInvalidInput), "%s: expected ErrInvalidInput, got %v", constraint, err)
			assertAllExpectationsMet(t, mock)
		}
	})

	t.Run("missing user maps to domain.ErrNotFound", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`INSERT INTO "user_todos"`).WillReturnError(&pgconn.PgError{Code: "23503", ConstraintName: "user_todos_user_fk"})

		_, err := NewGormUserTodoRepository(db).Create(ctx, &domain.UserTodo{UserID: 999, ActionID: 2})
		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected ErrNotFound, got %v", err)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("other errors stay wrapped and generic", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`INSERT INTO "user_todos"`).WillReturnError(&pgconn.PgError{Code: "23514", ConstraintName: "user_todos_percent_check"})

		_, err := NewGormUserTodoRepository(db).Create(ctx, &domain.UserTodo{UserID: 7, ActionID: 2})
		require.Error(t, err)
		assert.False(t, errors.Is(err, domain.ErrAlreadyExists))
		assert.Contains(t, err.Error(), "failed to insert user todo")
		var pgErr *pgconn.PgError
		assert.True(t, errors.As(err, &pgErr), "original PgError must stay in the chain")
		assertAllExpectationsMet(t, mock)
	})
}

// userTodoUpdateSetSQL is the SET list GORM emits for Update's map (keys are
// sorted, then updated_at is appended by GORM's autoUpdateTime).
const userTodoUpdateSetSQL = `UPDATE "user_todos" SET "action_id"=\$1,"comments"=\$2,"content_id"=\$3,"due_date"=\$4,"end_date"=\$5,"list_id"=\$6,"list_position"=\$7,"name"=\$8,"percent_complete"=\$9,"priority"=\$10,"privacy"=\$11,"start_date"=\$12,"status"=\$13,"updated_at"=\$14 WHERE user_id = \$15 AND "id" = \$16`

func TestGormUserTodoRepository_Update(t *testing.T) {
	ctx := context.Background()

	t.Run("owner-scoped UPDATE ... RETURNING writes every mutable column, NULLs included", func(t *testing.T) {
		db, mock := newMockDB(t)
		recs := make([]*recordArg, 16)
		matchers := make([]driver.Value, 16)
		for i := range recs {
			recs[i] = &recordArg{}
			matchers[i] = recs[i]
		}
		mock.ExpectQuery(userTodoUpdateSetSQL + ` RETURNING `).
			WithArgs(matchers...).
			WillReturnRows(addUserTodoRow(userTodoRows(), 5))

		got, err := NewGormUserTodoRepository(db).Update(ctx, &domain.UserTodo{
			ID: 5, UserID: 7, ActionID: 2, Status: domain.UserTodoStatusInProgress,
			Privacy: domain.PrivacyPublic, PercentComplete: 40,
			// nil fields below must be written as NULL, not skipped
			Priority: nil, ListID: nil, ListPosition: nil, StartDate: nil,
		}, 42)
		require.NoError(t, err)
		require.NotNil(t, got)
		assert.Equal(t, 5, got.ID)
		assertAllExpectationsMet(t, mock)

		// SET order: action_id(1) comments(2) content_id(3) due_date(4) end_date(5)
		// list_id(6) list_position(7) name(8) percent_complete(9) priority(10)
		// privacy(11) start_date(12) status(13) updated_at(14); WHERE user_id(15), id(16).
		assert.Nil(t, recs[5].got, "list_id must be written as NULL")
		assert.Nil(t, recs[6].got, "list_position must be written as NULL")
		assert.Nil(t, recs[9].got, "priority must be written as NULL")
		assert.Nil(t, recs[11].got, "start_date must be written as NULL")
		assert.EqualValues(t, 42, recs[14].got, "owner predicate binds the actor, not the row's user_id")
		assert.EqualValues(t, 5, recs[15].got, "id predicate")
	})

	t.Run("zero rows and the row exists under another owner means domain.ErrForbidden", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`UPDATE "user_todos" SET`).WillReturnRows(userTodoRows())
		mock.ExpectQuery(`SELECT "user_id" FROM "user_todos" WHERE id = \$1 LIMIT`).
			WithArgs(5, 1).
			WillReturnRows(sqlmock.NewRows([]string{"user_id"}).AddRow(7))

		got, err := NewGormUserTodoRepository(db).Update(ctx, &domain.UserTodo{ID: 5, UserID: 7, ActionID: 2}, 42)
		assert.Nil(t, got)
		assert.True(t, errors.Is(err, domain.ErrForbidden), "expected ErrForbidden, got %v", err)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("zero rows and no row at all means domain.ErrNotFound", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`UPDATE "user_todos" SET`).WillReturnRows(userTodoRows())
		mock.ExpectQuery(`SELECT "user_id" FROM "user_todos" WHERE id = \$1 LIMIT`).
			WithArgs(404, 1).
			WillReturnRows(sqlmock.NewRows([]string{"user_id"}))

		got, err := NewGormUserTodoRepository(db).Update(ctx, &domain.UserTodo{ID: 404, ActionID: 2}, 42)
		assert.Nil(t, got)
		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected ErrNotFound, got %v", err)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("non-positive actor never reaches the database", func(t *testing.T) {
		for _, actor := range []int{0, -1} {
			db, mock := newMockDB(t)
			_, err := NewGormUserTodoRepository(db).Update(ctx, &domain.UserTodo{ID: 5, ActionID: 2}, actor)
			assert.True(t, errors.Is(err, domain.ErrNotFound), "actor %d", actor)
			assertAllExpectationsMet(t, mock)
		}
	})

	t.Run("open-todo unique violation on update maps to ErrAlreadyExists", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`UPDATE "user_todos" SET`).WillReturnError(&pgconn.PgError{
			Code: "23505", ConstraintName: "user_todos_open_content_action_unique",
		})

		_, err := NewGormUserTodoRepository(db).Update(ctx, &domain.UserTodo{ID: 5, ActionID: 2}, 7)
		assert.True(t, errors.Is(err, domain.ErrAlreadyExists), "expected ErrAlreadyExists, got %v", err)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("single UPDATE is one query when the row is owned", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`UPDATE "user_todos" SET`).WillReturnRows(addUserTodoRow(userTodoRows(), 5))

		c := querycount.Attach(t, db)
		_, err := NewGormUserTodoRepository(db).Update(ctx, &domain.UserTodo{ID: 5, ActionID: 2}, 7)
		require.NoError(t, err)
		c.AssertExactly(t, 1)
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormUserTodoRepository_Delete(t *testing.T) {
	ctx := context.Background()

	t.Run("scopes the DELETE to the owner and is one statement", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`DELETE FROM "user_todos" WHERE user_id = \$1 AND "user_todos"."id" = \$2`).
			WithArgs(42, 5).
			WillReturnResult(sqlmock.NewResult(0, 1))

		c := querycount.Attach(t, db)
		require.NoError(t, NewGormUserTodoRepository(db).Delete(ctx, 5, 42))
		c.AssertExactly(t, 1)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("zero rows, row owned by someone else means domain.ErrForbidden", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`DELETE FROM "user_todos"`).WillReturnResult(sqlmock.NewResult(0, 0))
		mock.ExpectQuery(`SELECT "user_id" FROM "user_todos" WHERE id = \$1 LIMIT`).
			WithArgs(5, 1).
			WillReturnRows(sqlmock.NewRows([]string{"user_id"}).AddRow(7))

		err := NewGormUserTodoRepository(db).Delete(ctx, 5, 42)
		assert.True(t, errors.Is(err, domain.ErrForbidden), "expected ErrForbidden, got %v", err)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("zero rows, no row at all means domain.ErrNotFound", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`DELETE FROM "user_todos"`).WillReturnResult(sqlmock.NewResult(0, 0))
		mock.ExpectQuery(`SELECT "user_id" FROM "user_todos" WHERE id = \$1 LIMIT`).
			WithArgs(404, 1).
			WillReturnRows(sqlmock.NewRows([]string{"user_id"}))

		err := NewGormUserTodoRepository(db).Delete(ctx, 404, 42)
		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected ErrNotFound, got %v", err)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("non-positive actor never reaches the database", func(t *testing.T) {
		db, mock := newMockDB(t)
		err := NewGormUserTodoRepository(db).Delete(ctx, 5, 0)
		assert.True(t, errors.Is(err, domain.ErrNotFound))
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormUserTodoRepository_NextListPosition(t *testing.T) {
	ctx := context.Background()

	db, mock := newMockDB(t)
	mock.ExpectQuery(`SELECT COALESCE\(MAX\(list_position\), 0\) \+ 1 FROM "user_todos" WHERE list_id = \$1`).
		WithArgs(3).
		WillReturnRows(sqlmock.NewRows([]string{"coalesce"}).AddRow(4))

	c := querycount.Attach(t, db)
	next, err := NewGormUserTodoRepository(db).NextListPosition(ctx, 3)
	require.NoError(t, err)
	assert.Equal(t, 4, next)
	c.AssertExactly(t, 1)
	assertAllExpectationsMet(t, mock)
}

func TestGormUserTodoRepository_UnlistAll(t *testing.T) {
	ctx := context.Background()

	db, mock := newMockDB(t)
	mock.ExpectExec(`UPDATE "user_todos" SET "list_id"=\$1,"list_position"=\$2,"updated_at"=\$3 WHERE list_id = \$4 AND user_id = \$5`).
		WithArgs(nil, nil, sqlmock.AnyArg(), 3, 7).
		WillReturnResult(sqlmock.NewResult(0, 2))

	c := querycount.Attach(t, db)
	require.NoError(t, NewGormUserTodoRepository(db).UnlistAll(ctx, 3, 7))
	c.AssertExactly(t, 1)
	assertAllExpectationsMet(t, mock)
}

func TestGormUserTodoRepository_Reorder(t *testing.T) {
	ctx := context.Background()

	t.Run("one UPDATE ... FROM (VALUES ...) with bound positions and owner + list-owner checks", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`UPDATE user_todos AS t SET list_position = v\.pos FROM \(VALUES \(CAST\(\$1 AS integer\), CAST\(\$2 AS integer\)\), \(CAST\(\$3 AS integer\), CAST\(\$4 AS integer\)\)\) AS v\(id, pos\) WHERE t\.id = v\.id AND t\.list_id = \$5 AND t\.user_id = \$6 AND EXISTS \(SELECT 1 FROM user_todo_lists l WHERE l\.id = t\.list_id AND l\.user_id = \$7\) RETURNING t\.\*`).
			WithArgs(9, 1, 4, 2, 3, 7, 7).
			WillReturnRows(
				addUserTodoRow(userTodoRows(), 4).AddRow(
					4, 7, 11, nil, 2, 5000, "in_progress", 40, nil, nil, nil, nil, "public", 3, 2, userTodoTime, userTodoTime,
				),
			)

		c := querycount.Attach(t, db)
		got, err := NewGormUserTodoRepository(db).Reorder(ctx, 3, []int{9, 4}, 7)
		require.NoError(t, err)
		c.AssertExactly(t, 1)
		require.Len(t, got, 2)
		assert.Equal(t, 4, got[0].ID, "result is sorted by the new list position")
		assertAllExpectationsMet(t, mock)
	})

	t.Run("duplicate ids keep their first position", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`UPDATE user_todos AS t`).
			WithArgs(9, 1, 4, 2, 3, 7, 7).
			WillReturnRows(userTodoRows())

		_, err := NewGormUserTodoRepository(db).Reorder(ctx, 3, []int{9, 4, 9}, 7)
		require.NoError(t, err)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("empty input issues no query", func(t *testing.T) {
		db, mock := newMockDB(t)
		c := querycount.Attach(t, db)
		got, err := NewGormUserTodoRepository(db).Reorder(ctx, 3, nil, 7)
		require.NoError(t, err)
		assert.Empty(t, got)
		c.AssertExactly(t, 0)
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormUserTodoRepository_ReassignByUser(t *testing.T) {
	ctx := context.Background()

	t.Run("moves every todo of fromUserID in one UPDATE", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`UPDATE "user_todos" SET "user_id"=\$1,"updated_at"=\$2 WHERE user_id = \$3`).
			WithArgs(3, sqlmock.AnyArg(), 2).
			WillReturnResult(sqlmock.NewResult(0, 0))

		assert.NoError(t, NewGormUserTodoRepository(db).ReassignByUser(ctx, 2, 3))
		assertAllExpectationsMet(t, mock)
	})

	t.Run("propagates errors", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`UPDATE "user_todos" SET`).WillReturnError(errors.New("todo reassign boom"))

		err := NewGormUserTodoRepository(db).ReassignByUser(ctx, 2, 3)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "todo reassign boom")
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormUserTodoListRepository_ListByUser(t *testing.T) {
	ctx := context.Background()

	t.Run("public only unless includePrivate", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT \* FROM "user_todo_lists" WHERE user_id = \$1 AND privacy = \$2 ORDER BY name ASC, id ASC`).
			WithArgs(7, "public").
			WillReturnRows(userTodoListRows())

		_, err := NewGormUserTodoListRepository(db).ListByUser(ctx, 7, false)
		require.NoError(t, err)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("includePrivate adds no privacy predicate", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT \* FROM "user_todo_lists" WHERE user_id = \$1 ORDER BY`).
			WithArgs(7).
			WillReturnRows(userTodoListRows().AddRow(1, 7, "Watch later", nil, "private", userTodoTime, userTodoTime))

		c := querycount.Attach(t, db)
		got, err := NewGormUserTodoListRepository(db).ListByUser(ctx, 7, true)
		require.NoError(t, err)
		c.AssertExactly(t, 1)
		require.Len(t, got, 1)
		assert.Equal(t, domain.PrivacyPrivate, got[0].Privacy)
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormUserTodoListRepository_GetByIDs(t *testing.T) {
	ctx := context.Background()

	t.Run("one query for 50 ids and zero for none", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`FROM "user_todo_lists" WHERE id = ANY\(CAST\(\$1 AS bigint\[\]\)\)`).
			WillReturnRows(userTodoListRows())

		c := querycount.Attach(t, db)
		_, err := NewGormUserTodoListRepository(db).GetByIDs(ctx, seqIDs(50))
		require.NoError(t, err)
		c.AssertExactly(t, 1)
		assertAllExpectationsMet(t, mock)

		db2, mock2 := newMockDB(t)
		c2 := querycount.Attach(t, db2)
		got, err := NewGormUserTodoListRepository(db2).GetByIDs(ctx, nil)
		require.NoError(t, err)
		assert.Empty(t, got)
		c2.AssertExactly(t, 0)
		assertAllExpectationsMet(t, mock2)
	})
}

func TestGormUserTodoListRepository_Create(t *testing.T) {
	ctx := context.Background()

	t.Run("duplicate name for the owner maps to ErrAlreadyExists", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`INSERT INTO "user_todo_lists"`).WillReturnError(&pgconn.PgError{
			Code: "23505", ConstraintName: "user_todo_lists_user_name_unique",
		})

		_, err := NewGormUserTodoListRepository(db).Create(ctx, &domain.UserTodoList{UserID: 7, Name: "Watch"})
		assert.True(t, errors.Is(err, domain.ErrAlreadyExists), "expected ErrAlreadyExists, got %v", err)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("single INSERT ... RETURNING defaults empty privacy to public", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`INSERT INTO "user_todo_lists" .* RETURNING `).
			WithArgs(7, "Watch", nil, "public", sqlmock.AnyArg(), sqlmock.AnyArg()).
			WillReturnRows(userTodoListRows().AddRow(1, 7, "Watch", nil, "public", userTodoTime, userTodoTime))

		c := querycount.Attach(t, db)
		got, err := NewGormUserTodoListRepository(db).Create(ctx, &domain.UserTodoList{UserID: 7, Name: "Watch"})
		require.NoError(t, err)
		c.AssertExactly(t, 1)
		assert.Equal(t, 1, got.ID)
		assert.Equal(t, domain.PrivacyPublic, got.Privacy)
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormUserTodoListRepository_Update(t *testing.T) {
	ctx := context.Background()

	t.Run("owner-scoped UPDATE ... RETURNING clears a nil description to NULL", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`UPDATE "user_todo_lists" SET "description"=\$1,"name"=\$2,"privacy"=\$3,"updated_at"=\$4 WHERE user_id = \$5 AND "id" = \$6 RETURNING `).
			WithArgs(nil, "Renamed", "private", sqlmock.AnyArg(), 7, 1).
			WillReturnRows(userTodoListRows().AddRow(1, 7, "Renamed", nil, "private", userTodoTime, userTodoTime))

		c := querycount.Attach(t, db)
		got, err := NewGormUserTodoListRepository(db).Update(ctx, &domain.UserTodoList{
			ID: 1, UserID: 7, Name: "Renamed", Privacy: domain.PrivacyPrivate,
		}, 7)
		require.NoError(t, err)
		c.AssertExactly(t, 1)
		assert.Equal(t, "Renamed", got.Name)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("zero rows, row owned by someone else means ErrForbidden", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`UPDATE "user_todo_lists" SET`).WillReturnRows(userTodoListRows())
		mock.ExpectQuery(`SELECT "user_id" FROM "user_todo_lists" WHERE id = \$1 LIMIT`).
			WithArgs(1, 1).
			WillReturnRows(sqlmock.NewRows([]string{"user_id"}).AddRow(9))

		_, err := NewGormUserTodoListRepository(db).Update(ctx, &domain.UserTodoList{ID: 1, Name: "x"}, 7)
		assert.True(t, errors.Is(err, domain.ErrForbidden), "expected ErrForbidden, got %v", err)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("rename collision maps to ErrAlreadyExists", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`UPDATE "user_todo_lists" SET`).WillReturnError(&pgconn.PgError{
			Code: "23505", ConstraintName: "user_todo_lists_user_name_unique",
		})

		_, err := NewGormUserTodoListRepository(db).Update(ctx, &domain.UserTodoList{ID: 1, Name: "dup"}, 7)
		assert.True(t, errors.Is(err, domain.ErrAlreadyExists), "expected ErrAlreadyExists, got %v", err)
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormUserTodoListRepository_Delete(t *testing.T) {
	ctx := context.Background()

	t.Run("owner-scoped DELETE succeeds on one row", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`DELETE FROM "user_todo_lists" WHERE user_id = \$1 AND "user_todo_lists"."id" = \$2`).
			WithArgs(7, 1).
			WillReturnResult(sqlmock.NewResult(0, 1))

		require.NoError(t, NewGormUserTodoListRepository(db).Delete(ctx, 1, 7))
		assertAllExpectationsMet(t, mock)
	})

	t.Run("todos still in the list block the delete as ErrInvalidInput", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`DELETE FROM "user_todo_lists"`).WillReturnError(&pgconn.PgError{
			Code: "23503", ConstraintName: "user_todos_list_fk",
		})

		err := NewGormUserTodoListRepository(db).Delete(ctx, 1, 7)
		assert.True(t, errors.Is(err, domain.ErrInvalidInput), "expected ErrInvalidInput, got %v", err)
		assert.Contains(t, err.Error(), "list still has todos")
		assertAllExpectationsMet(t, mock)
	})

	t.Run("zero rows, no row at all means ErrNotFound", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`DELETE FROM "user_todo_lists"`).WillReturnResult(sqlmock.NewResult(0, 0))
		mock.ExpectQuery(`SELECT "user_id" FROM "user_todo_lists" WHERE id = \$1 LIMIT`).
			WithArgs(1, 1).
			WillReturnRows(sqlmock.NewRows([]string{"user_id"}))

		err := NewGormUserTodoListRepository(db).Delete(ctx, 1, 7)
		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected ErrNotFound, got %v", err)
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormUserTodoListRepository_ReassignByUser(t *testing.T) {
	ctx := context.Background()

	db, mock := newMockDB(t)
	// The name suffix keeps the move from colliding with UNIQUE (user_id, name).
	mock.ExpectExec(`UPDATE "user_todo_lists" SET "name"=left\(name, 80\) \|\| ' \(#' \|\| id \|\| '\)',"user_id"=\$1,"updated_at"=\$2 WHERE user_id = \$3`).
		WithArgs(3, sqlmock.AnyArg(), 2).
		WillReturnResult(sqlmock.NewResult(0, 1))

	require.NoError(t, NewGormUserTodoListRepository(db).ReassignByUser(ctx, 2, 3))
	assertAllExpectationsMet(t, mock)
}
