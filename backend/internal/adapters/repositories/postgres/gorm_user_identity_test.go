package postgres

import (
	"context"
	"errors"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/perf/querycount"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// uniqueViolation is the error Postgres returns when the named unique
// constraint rejects a row.
func uniqueViolation(constraint string) error {
	return &pgconn.PgError{Code: pgUniqueViolation, ConstraintName: constraint}
}

func TestGormUserRepository_CreateFromClerkMapsConstraintToSentinel(t *testing.T) {
	cases := []struct {
		name       string
		constraint string
		want       error
	}{
		{"username", "users_unique_username", domain.ErrUsernameTaken},
		{"email", "users_unique_email", domain.ErrEmailTaken},
		{"clerk id", "users_clerk_user_id_key", domain.ErrClerkIDTaken},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			db, mock := newMockDB(t)
			repo := NewGormUserRepository(db)
			mock.ExpectQuery(`INSERT INTO "users"`).WillReturnError(uniqueViolation(tc.constraint))

			got, err := repo.CreateFromClerk(context.Background(), "user_abc", "alice", "alice@example.com")
			assert.Nil(t, got)
			assert.True(t, errors.Is(err, tc.want), "expected %v, got %v", tc.want, err)
			assert.True(t, errors.Is(err, domain.ErrAlreadyExists))
			assertAllExpectationsMet(t, mock)
		})
	}
}

func TestGormUserRepository_CreateFromClerkUnknownErrorUnchanged(t *testing.T) {
	db, mock := newMockDB(t)
	repo := NewGormUserRepository(db)
	orig := errors.New("connection reset")
	mock.ExpectQuery(`INSERT INTO "users"`).WillReturnError(orig)

	_, err := repo.CreateFromClerk(context.Background(), "user_abc", "alice", "")
	assert.ErrorIs(t, err, orig)
	assert.False(t, errors.Is(err, domain.ErrAlreadyExists))
	assertAllExpectationsMet(t, mock)
}

func TestGormUserRepository_CreateFromClerkIsOneStatement(t *testing.T) {
	db, mock := newMockDB(t)
	repo := NewGormUserRepository(db)
	counter := querycount.Attach(t, db)
	mock.ExpectQuery(`INSERT INTO "users"`).
		WillReturnRows(userRows().AddRow(42, "user_abc", "alice", "alice@example.com", "default", true, userRepoTime, userRepoTime))

	got, err := repo.CreateFromClerk(context.Background(), "user_abc", "alice", "alice@example.com")
	require.NoError(t, err)
	assert.Equal(t, 42, got.ID)
	counter.AssertExactly(t, 1)
	assertAllExpectationsMet(t, mock)
}

func TestGormUserRepository_UpdateClerkIDConflictIsSentinel(t *testing.T) {
	db, mock := newMockDB(t)
	repo := NewGormUserRepository(db)
	mock.ExpectQuery(`UPDATE "users" SET`).WillReturnError(uniqueViolation("users_clerk_user_id_key"))

	_, err := repo.Update(context.Background(), &domain.User{ID: 7, Username: "alice", ClerkUserID: "user_abc"})
	assert.True(t, errors.Is(err, domain.ErrClerkIDTaken), "expected ErrClerkIDTaken, got %v", err)
	assertAllExpectationsMet(t, mock)
}
