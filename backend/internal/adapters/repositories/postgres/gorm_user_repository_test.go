package postgres

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5/pgconn"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var userRepoTime = time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)

func userRows() *sqlmock.Rows {
	return sqlmock.NewRows([]string{
		"id", "clerk_user_id", "username", "email", "role", "active", "created_at", "updated_at",
	})
}

func TestGormUserRepository_GetByID(t *testing.T) {
	ctx := context.Background()

	t.Run("returns mapped domain user", func(t *testing.T) {
		db, mock := newMockDB(t)
		repo := NewGormUserRepository(db)

		mock.ExpectQuery(`SELECT \* FROM "users"`).
			WillReturnRows(userRows().AddRow(7, "user_abc", "alice", "alice@example.com", "admin", true, userRepoTime, userRepoTime))

		got, err := repo.GetByID(ctx, 7)
		require.NoError(t, err)
		require.NotNil(t, got)
		assert.Equal(t, 7, got.ID)
		assert.Equal(t, "user_abc", got.ClerkUserID)
		assert.Equal(t, "alice", got.Username)
		assert.Equal(t, "alice@example.com", got.Email)
		assert.Equal(t, domain.UserRoleAdmin, got.Role)
		assert.True(t, got.Active)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("translates gorm.ErrRecordNotFound to domain.ErrNotFound", func(t *testing.T) {
		db, mock := newMockDB(t)
		repo := NewGormUserRepository(db)

		mock.ExpectQuery(`SELECT \* FROM "users"`).WillReturnRows(userRows())

		got, err := repo.GetByID(ctx, 404)
		assert.Nil(t, got)
		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected domain.ErrNotFound, got %v", err)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("propagates non-not-found driver errors verbatim", func(t *testing.T) {
		db, mock := newMockDB(t)
		repo := NewGormUserRepository(db)

		boom := errors.New("connection reset by peer")
		mock.ExpectQuery(`SELECT \* FROM "users"`).WillReturnError(boom)

		got, err := repo.GetByID(ctx, 7)
		assert.Nil(t, got)
		require.Error(t, err)
		assert.False(t, errors.Is(err, domain.ErrNotFound))
		assert.Contains(t, err.Error(), "connection reset by peer")
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormUserRepository_GetByLookupColumns(t *testing.T) {
	ctx := context.Background()

	lookups := []struct {
		name string
		call func(repo *GormUserRepository) (*domain.User, error)
	}{
		{"GetByClerkID", func(r *GormUserRepository) (*domain.User, error) { return r.GetByClerkID(ctx, "user_abc") }},
		{"GetByUsername", func(r *GormUserRepository) (*domain.User, error) { return r.GetByUsername(ctx, "alice") }},
		{"GetByEmail", func(r *GormUserRepository) (*domain.User, error) { return r.GetByEmail(ctx, "alice@example.com") }},
	}

	for _, lk := range lookups {
		t.Run(lk.name+" returns mapped user", func(t *testing.T) {
			db, mock := newMockDB(t)
			mock.ExpectQuery(`SELECT \* FROM "users"`).
				WillReturnRows(userRows().AddRow(7, "user_abc", "alice", "alice@example.com", "default", true, userRepoTime, userRepoTime))

			got, err := lk.call(NewGormUserRepository(db))
			require.NoError(t, err)
			require.NotNil(t, got)
			assert.Equal(t, "alice", got.Username)
			assert.Equal(t, domain.UserRoleDefault, got.Role)
			assertAllExpectationsMet(t, mock)
		})

		t.Run(lk.name+" maps empty result to domain.ErrNotFound", func(t *testing.T) {
			db, mock := newMockDB(t)
			mock.ExpectQuery(`SELECT \* FROM "users"`).WillReturnRows(userRows())

			got, err := lk.call(NewGormUserRepository(db))
			assert.Nil(t, got)
			assert.True(t, errors.Is(err, domain.ErrNotFound), "expected domain.ErrNotFound, got %v", err)
			assertAllExpectationsMet(t, mock)
		})

		t.Run(lk.name+" propagates driver errors", func(t *testing.T) {
			db, mock := newMockDB(t)
			mock.ExpectQuery(`SELECT \* FROM "users"`).WillReturnError(errors.New("boom"))

			got, err := lk.call(NewGormUserRepository(db))
			assert.Nil(t, got)
			require.Error(t, err)
			assert.Contains(t, err.Error(), "boom")
			assertAllExpectationsMet(t, mock)
		})
	}
}

func TestGormUserRepository_ListAll(t *testing.T) {
	ctx := context.Background()

	t.Run("maps every row and excludes sentinel users at the SQL level", func(t *testing.T) {
		db, mock := newMockDB(t)
		repo := NewGormUserRepository(db)

		mock.ExpectQuery(`SELECT \* FROM "users" WHERE role != .* ORDER BY username ASC`).
			WillReturnRows(userRows().
				AddRow(1, "user_a", "alice", "alice@example.com", "admin", true, userRepoTime, userRepoTime).
				AddRow(2, nil, "bob", nil, "default", false, userRepoTime, userRepoTime))

		got, err := repo.ListAll(ctx)
		require.NoError(t, err)
		require.Len(t, got, 2)
		assert.Equal(t, "alice", got[0].Username)
		assert.Equal(t, domain.UserRoleAdmin, got[0].Role)
		assert.Equal(t, "bob", got[1].Username)
		assert.Equal(t, "", got[1].Email, "NULL email must map to empty string")
		assert.Equal(t, "", got[1].ClerkUserID, "NULL clerk_user_id must map to empty string")
		assert.False(t, got[1].Active)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("empty result yields empty non-nil slice and no error", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT \* FROM "users"`).WillReturnRows(userRows())

		got, err := NewGormUserRepository(db).ListAll(ctx)
		require.NoError(t, err)
		assert.Len(t, got, 0)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("propagates driver errors", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT \* FROM "users"`).WillReturnError(errors.New("list boom"))

		got, err := NewGormUserRepository(db).ListAll(ctx)
		assert.Nil(t, got)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "list boom")
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormUserRepository_Create(t *testing.T) {
	ctx := context.Background()

	t.Run("returns the created user with GORM-populated id", func(t *testing.T) {
		db, mock := newMockDB(t)
		repo := NewGormUserRepository(db)

		mock.ExpectQuery(`INSERT INTO "users"`).
			WillReturnRows(sqlmock.NewRows([]string{"id", "created_at", "updated_at"}).AddRow(42, userRepoTime, userRepoTime))

		got, err := repo.Create(ctx, &domain.User{Username: "carol", Email: "carol@example.com", Role: domain.UserRoleDefault, Active: true})
		require.NoError(t, err)
		require.NotNil(t, got)
		assert.Equal(t, 42, got.ID)
		assert.Equal(t, "carol", got.Username)
		assert.Equal(t, "carol@example.com", got.Email)
		assert.Equal(t, domain.UserRoleDefault, got.Role)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("propagates insert errors unwrapped", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`INSERT INTO "users"`).WillReturnError(errors.New("duplicate key value violates unique constraint \"unique_email\""))

		got, err := NewGormUserRepository(db).Create(ctx, &domain.User{Username: "carol"})
		assert.Nil(t, got)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "unique_email")
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormUserRepository_CreateFromClerk(t *testing.T) {
	ctx := context.Background()

	t.Run("defaults role to default and active to true", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`INSERT INTO "users"`).
			WillReturnRows(sqlmock.NewRows([]string{"id", "created_at", "updated_at"}).AddRow(15, userRepoTime, userRepoTime))

		got, err := NewGormUserRepository(db).CreateFromClerk(ctx, "user_xyz", "dave", "dave@example.com")
		require.NoError(t, err)
		require.NotNil(t, got)
		assert.Equal(t, 15, got.ID)
		assert.Equal(t, "user_xyz", got.ClerkUserID)
		assert.Equal(t, "dave", got.Username)
		assert.Equal(t, "dave@example.com", got.Email)
		assert.Equal(t, domain.UserRoleDefault, got.Role)
		assert.True(t, got.Active)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("empty email is stored as NULL and read back as empty string", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`INSERT INTO "users"`).
			WillReturnRows(sqlmock.NewRows([]string{"id", "created_at", "updated_at"}).AddRow(16, userRepoTime, userRepoTime))

		got, err := NewGormUserRepository(db).CreateFromClerk(ctx, "user_xyz", "dave", "")
		require.NoError(t, err)
		require.NotNil(t, got)
		assert.Equal(t, "", got.Email)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("propagates insert errors", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`INSERT INTO "users"`).WillReturnError(errors.New("23505"))

		got, err := NewGormUserRepository(db).CreateFromClerk(ctx, "user_xyz", "dave", "dave@example.com")
		assert.Nil(t, got)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "23505")
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormUserRepository_Update(t *testing.T) {
	ctx := context.Background()

	t.Run("returns the updated row from RETURNING", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`UPDATE "users" SET .* RETURNING \*`).
			WillReturnRows(userRows().AddRow(7, "user_abc", "alice2", "alice2@example.com", "admin", true, userRepoTime, userRepoTime))

		got, err := NewGormUserRepository(db).Update(ctx, &domain.User{ID: 7, Username: "alice2", Email: "alice2@example.com", ClerkUserID: "user_abc", Role: domain.UserRoleAdmin})
		require.NoError(t, err)
		require.NotNil(t, got)
		assert.Equal(t, "alice2", got.Username)
		assert.Equal(t, "alice2@example.com", got.Email)
		assert.Equal(t, userRepoTime, got.UpdatedAt)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("zero rows affected means domain.ErrNotFound", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`UPDATE "users" SET`).WillReturnRows(userRows())

		got, err := NewGormUserRepository(db).Update(ctx, &domain.User{ID: 404, Username: "ghost"})
		assert.Nil(t, got)
		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected domain.ErrNotFound, got %v", err)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("unique violations map to domain.ErrAlreadyExists", func(t *testing.T) {
		for constraint, want := range map[string]string{
			"users_unique_username": "username already taken",
			"users_unique_email":    "email already registered",
		} {
			db, mock := newMockDB(t)
			mock.ExpectQuery(`UPDATE "users" SET`).WillReturnError(&pgconn.PgError{Code: "23505", ConstraintName: constraint})

			got, err := NewGormUserRepository(db).Update(ctx, &domain.User{ID: 7, Username: "alice"})
			assert.Nil(t, got)
			assert.True(t, errors.Is(err, domain.ErrAlreadyExists), "%s: got %v", constraint, err)
			assert.Contains(t, err.Error(), want)
			assertAllExpectationsMet(t, mock)
		}
	})

	t.Run("propagates update errors", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`UPDATE "users" SET`).WillReturnError(errors.New("update boom"))

		got, err := NewGormUserRepository(db).Update(ctx, &domain.User{ID: 7, Username: "alice"})
		assert.Nil(t, got)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "update boom")
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormUserRepository_Delete(t *testing.T) {
	ctx := context.Background()

	t.Run("succeeds when one row is removed", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`DELETE FROM "users"`).WillReturnResult(sqlmock.NewResult(0, 1))

		assert.NoError(t, NewGormUserRepository(db).Delete(ctx, 7))
		assertAllExpectationsMet(t, mock)
	})

	t.Run("zero rows affected means domain.ErrNotFound", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`DELETE FROM "users"`).WillReturnResult(sqlmock.NewResult(0, 0))

		err := NewGormUserRepository(db).Delete(ctx, 404)
		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected domain.ErrNotFound, got %v", err)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("propagates delete errors", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`DELETE FROM "users"`).WillReturnError(errors.New("fk violation"))

		err := NewGormUserRepository(db).Delete(ctx, 7)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "fk violation")
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormUserRepository_UpdateByClerkID(t *testing.T) {
	ctx := context.Background()

	t.Run("succeeds when one row is updated", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`UPDATE "users" SET`).WillReturnResult(sqlmock.NewResult(0, 1))

		assert.NoError(t, NewGormUserRepository(db).UpdateByClerkID(ctx, "user_abc", "alice", "alice@example.com"))
		assertAllExpectationsMet(t, mock)
	})

	t.Run("empty email still issues the update", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`UPDATE "users" SET`).WillReturnResult(sqlmock.NewResult(0, 1))

		assert.NoError(t, NewGormUserRepository(db).UpdateByClerkID(ctx, "user_abc", "alice", ""))
		assertAllExpectationsMet(t, mock)
	})

	t.Run("zero rows affected means domain.ErrNotFound", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`UPDATE "users" SET`).WillReturnResult(sqlmock.NewResult(0, 0))

		err := NewGormUserRepository(db).UpdateByClerkID(ctx, "user_missing", "alice", "alice@example.com")
		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected domain.ErrNotFound, got %v", err)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("propagates update errors", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`UPDATE "users" SET`).WillReturnError(errors.New("upd boom"))

		err := NewGormUserRepository(db).UpdateByClerkID(ctx, "user_abc", "alice", "alice@example.com")
		require.Error(t, err)
		assert.Contains(t, err.Error(), "upd boom")
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormUserRepository_DeactivateByClerkID(t *testing.T) {
	ctx := context.Background()

	t.Run("succeeds when one row is deactivated", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`UPDATE "users" SET`).WillReturnResult(sqlmock.NewResult(0, 1))

		assert.NoError(t, NewGormUserRepository(db).DeactivateByClerkID(ctx, "user_abc"))
		assertAllExpectationsMet(t, mock)
	})

	t.Run("zero rows affected means domain.ErrNotFound", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`UPDATE "users" SET`).WillReturnResult(sqlmock.NewResult(0, 0))

		err := NewGormUserRepository(db).DeactivateByClerkID(ctx, "user_missing")
		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected domain.ErrNotFound, got %v", err)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("propagates update errors", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`UPDATE "users" SET`).WillReturnError(errors.New("deact boom"))

		err := NewGormUserRepository(db).DeactivateByClerkID(ctx, "user_abc")
		require.Error(t, err)
		assert.Contains(t, err.Error(), "deact boom")
		assertAllExpectationsMet(t, mock)
	})
}
