package postgres

import (
	"context"
	"errors"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/perf/querycount"
	"github.com/DATA-DOG/go-sqlmock"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func addTodoActionRow(rows *sqlmock.Rows, id int, key string, seq *int, userID *int) *sqlmock.Rows {
	return rows.AddRow(id, key, key, "tooltip "+key, seq, userID, userTodoTime, userTodoTime)
}

func TestGormTodoActionRepository_GetByID(t *testing.T) {
	ctx := context.Background()

	t.Run("maps a preset with its sequence and no owner", func(t *testing.T) {
		db, mock := newMockDB(t)
		seq := 2
		mock.ExpectQuery(`SELECT \* FROM "todo_actions" WHERE "todo_actions"."id" = \$1`).
			WillReturnRows(addTodoActionRow(userTodoActionRows(), 2, "consume", &seq, nil))

		got, err := NewGormTodoActionRepository(db).GetByID(ctx, 2)
		require.NoError(t, err)
		assert.Equal(t, "consume", got.Key)
		assert.True(t, got.IsPreset())
		require.NotNil(t, got.TypicalSequence)
		assert.Equal(t, 2, *got.TypicalSequence)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("no row maps to domain.ErrNotFound", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT \* FROM "todo_actions"`).WillReturnRows(userTodoActionRows())

		_, err := NewGormTodoActionRepository(db).GetByID(ctx, 404)
		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected ErrNotFound, got %v", err)
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormTodoActionRepository_GetByIDs(t *testing.T) {
	ctx := context.Background()

	t.Run("one ANY(bigint[]) query for 50 ids", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`FROM "todo_actions" WHERE id = ANY\(CAST\(\$1 AS bigint\[\]\)\)`).
			WillReturnRows(userTodoActionRows())

		c := querycount.Attach(t, db)
		_, err := NewGormTodoActionRepository(db).GetByIDs(ctx, seqIDs(50))
		require.NoError(t, err)
		c.AssertExactly(t, 1)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("empty input issues no query", func(t *testing.T) {
		db, mock := newMockDB(t)
		c := querycount.Attach(t, db)
		got, err := NewGormTodoActionRepository(db).GetByIDs(ctx, []int{})
		require.NoError(t, err)
		assert.Empty(t, got)
		c.AssertExactly(t, 0)
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormTodoActionRepository_ListForUser(t *testing.T) {
	ctx := context.Background()

	t.Run("presets plus the user's own, picker order: sequence NULLS LAST, then label", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT \* FROM "todo_actions" WHERE user_id IS NULL OR user_id = \$1 ORDER BY typical_sequence ASC NULLS LAST, label ASC, id ASC`).
			WithArgs(7).
			WillReturnRows(addTodoActionRow(userTodoActionRows(), 1, "acquire", intPtr(1), nil))

		c := querycount.Attach(t, db)
		got, err := NewGormTodoActionRepository(db).ListForUser(ctx, 7)
		require.NoError(t, err)
		c.AssertExactly(t, 1)
		require.Len(t, got, 1)
		assert.Equal(t, "acquire", got[0].Key)
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormTodoActionRepository_GetByKey(t *testing.T) {
	ctx := context.Background()

	t.Run("nil owner looks up a preset with IS NOT DISTINCT FROM NULL", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`WHERE key = \$1 AND user_id IS NOT DISTINCT FROM \$2`).
			WithArgs("consume", nil, 1).
			WillReturnRows(addTodoActionRow(userTodoActionRows(), 2, "consume", intPtr(2), nil))

		got, err := NewGormTodoActionRepository(db).GetByKey(ctx, nil, "consume")
		require.NoError(t, err)
		assert.Equal(t, 2, got.ID)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("set owner looks up that user's action", func(t *testing.T) {
		db, mock := newMockDB(t)
		owner := 7
		mock.ExpectQuery(`WHERE key = \$1 AND user_id IS NOT DISTINCT FROM \$2`).
			WithArgs("podcast", 7, 1).
			WillReturnRows(addTodoActionRow(userTodoActionRows(), 30, "podcast", nil, &owner))

		got, err := NewGormTodoActionRepository(db).GetByKey(ctx, &owner, "podcast")
		require.NoError(t, err)
		require.NotNil(t, got.UserID)
		assert.Equal(t, 7, *got.UserID)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("no row maps to domain.ErrNotFound", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`FROM "todo_actions"`).WillReturnRows(userTodoActionRows())

		_, err := NewGormTodoActionRepository(db).GetByKey(ctx, nil, "nope")
		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected ErrNotFound, got %v", err)
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormTodoActionRepository_Create(t *testing.T) {
	ctx := context.Background()

	t.Run("single INSERT ... RETURNING for a user-entered action", func(t *testing.T) {
		db, mock := newMockDB(t)
		owner := 7
		mock.ExpectQuery(`INSERT INTO "todo_actions" .* RETURNING `).
			WillReturnRows(addTodoActionRow(userTodoActionRows(), 30, "podcast", nil, &owner))

		c := querycount.Attach(t, db)
		got, err := NewGormTodoActionRepository(db).Create(ctx, &domain.TodoAction{
			Key: "podcast", Label: "Podcast", UserID: &owner,
		})
		require.NoError(t, err)
		c.AssertExactly(t, 1)
		assert.Equal(t, 30, got.ID)
		assert.False(t, got.IsPreset())
		assertAllExpectationsMet(t, mock)
	})

	t.Run("duplicate key for the owner maps to domain.ErrAlreadyExists", func(t *testing.T) {
		db, mock := newMockDB(t)
		owner := 7
		mock.ExpectQuery(`INSERT INTO "todo_actions"`).WillReturnError(&pgconn.PgError{
			Code: "23505", ConstraintName: "todo_actions_user_key_unique",
		})

		_, err := NewGormTodoActionRepository(db).Create(ctx, &domain.TodoAction{Key: "consume", Label: "x", UserID: &owner})
		assert.True(t, errors.Is(err, domain.ErrAlreadyExists), "expected ErrAlreadyExists, got %v", err)
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormTodoActionRepository_ReassignByUser(t *testing.T) {
	ctx := context.Background()

	db, mock := newMockDB(t)
	// The key suffix keeps the move from colliding with NULLS NOT DISTINCT (user_id, key).
	mock.ExpectExec(`UPDATE "todo_actions" SET "key"=key \|\| ' \(#' \|\| id \|\| '\)',"user_id"=\$1,"updated_at"=\$2 WHERE user_id = \$3`).
		WithArgs(3, sqlmock.AnyArg(), 2).
		WillReturnResult(sqlmock.NewResult(0, 1))

	require.NoError(t, NewGormTodoActionRepository(db).ReassignByUser(ctx, 2, 3))
	assertAllExpectationsMet(t, mock)
}

func userTodoActionRows() *sqlmock.Rows {
	return sqlmock.NewRows([]string{"id", "key", "label", "description", "typical_sequence", "user_id", "created_at", "updated_at"})
}
