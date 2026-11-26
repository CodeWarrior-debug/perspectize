package repositories

import (
	"context"
	"database/sql/driver"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/repositories/cached"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/repositories/postgres"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/perf/querycount"
	"github.com/DATA-DOG/go-sqlmock"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	gormpg "gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Query budgets for the identity resolver over the real GORM user repository,
// wrapped by the same cache the server uses. Each count is the SQL round trips
// the path costs today; the Clerk directory is a fake, so its call count is
// asserted separately.

var identityNow = time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)

// fixedDirectory returns one profile and counts how often it was asked.
type fixedDirectory struct {
	profile domain.ClerkProfile
	calls   int
}

func (d *fixedDirectory) Profile(_ context.Context, _ string) (domain.ClerkProfile, error) {
	d.calls++
	return d.profile, nil
}

func identityUserRows(rows ...[]driver.Value) *sqlmock.Rows {
	r := sqlmock.NewRows([]string{"id", "clerk_user_id", "username", "email", "role", "active", "created_at", "updated_at"})
	for _, row := range rows {
		r.AddRow(row...)
	}
	return r
}

func identityUserRow(id int, clerkID, username, email string, active bool) []driver.Value {
	return []driver.Value{id, clerkID, username, email, "default", active, identityNow, identityNow}
}

// newIdentityFixture returns a sqlmock-backed DB, the cached user repository
// the server wires, and the mock. It mirrors newCapturingContentDB's settings.
func newIdentityFixture(t *testing.T) (*gorm.DB, sqlmock.Sqlmock, *cached.UserRepository) {
	t.Helper()
	sqlDB, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })

	gdb, err := gorm.Open(gormpg.New(gormpg.Config{Conn: sqlDB}), &gorm.Config{
		DisableAutomaticPing:   true,
		SkipDefaultTransaction: true,
		Logger:                 logger.Default.LogMode(logger.Silent),
	})
	require.NoError(t, err)
	users := cached.NewUserRepository(postgres.NewGormUserRepository(gdb), cached.DefaultUserTTL)
	return gdb, mock, users
}

func TestIdentityBudget_ExistingUserCostsOneLookupThenCacheHits(t *testing.T) {
	db, mock, users := newIdentityFixture(t)
	dir := &fixedDirectory{}
	resolver := services.NewIdentityResolver(users, dir)
	counter := querycount.Attach(t, db)
	ctx := context.Background()

	mock.ExpectQuery(`SELECT \* FROM "users"`).WillReturnRows(identityUserRows(identityUserRow(1, "user_alice", "alice", "alice@example.com", true)))
	_, err := resolver.Resolve(ctx, "user_alice")
	require.NoError(t, err)
	counter.AssertExactly(t, 1)

	counter.Reset()
	_, err = resolver.Resolve(ctx, "user_alice")
	require.NoError(t, err)
	counter.AssertExactly(t, 0)

	assert.Equal(t, 0, dir.calls, "the Clerk directory is never consulted for an existing user")
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestIdentityBudget_NewUserCostsLookupPlusInsert(t *testing.T) {
	db, mock, users := newIdentityFixture(t)
	dir := &fixedDirectory{profile: domain.ClerkProfile{ClerkID: "user_alice", Username: "alice", PrimaryEmailID: "e1", Emails: []domain.ClerkEmail{{ID: "e1", Address: "alice@example.com"}}}}
	resolver := services.NewIdentityResolver(users, dir)
	counter := querycount.Attach(t, db)

	mock.ExpectQuery(`SELECT \* FROM "users"`).WillReturnRows(identityUserRows())
	mock.ExpectQuery(`INSERT INTO "users"`).WillReturnRows(identityUserRows(identityUserRow(42, "user_alice", "alice", "alice@example.com", true)))

	_, err := resolver.Resolve(context.Background(), "user_alice")
	require.NoError(t, err)
	counter.AssertExactly(t, 2)
	assert.Equal(t, 1, dir.calls)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestIdentityBudget_WebhookAfterHTTPHitsWarmCache(t *testing.T) {
	db, mock, users := newIdentityFixture(t)
	dir := &fixedDirectory{}
	resolver := services.NewIdentityResolver(users, dir)
	counter := querycount.Attach(t, db)
	ctx := context.Background()

	// HTTP sign-in first: one lookup fills the cache.
	mock.ExpectQuery(`SELECT \* FROM "users"`).WillReturnRows(identityUserRows(identityUserRow(1, "user_alice", "alice", "alice@example.com", true)))
	_, err := resolver.Resolve(ctx, "user_alice")
	require.NoError(t, err)

	// The user.created webhook arrives afterwards and finds the row: no statements.
	counter.Reset()
	got, err := resolver.Provision(ctx, domain.ClerkProfile{ClerkID: "user_alice", Username: "alice"})
	require.NoError(t, err)
	assert.Equal(t, 1, got.ID)
	counter.AssertExactly(t, 0)
	assert.Equal(t, 0, dir.calls)
}

func TestIdentityBudget_EmailLinkCostsFour(t *testing.T) {
	db, mock, users := newIdentityFixture(t)
	dir := &fixedDirectory{profile: domain.ClerkProfile{ClerkID: "user_alice", Username: "alice", PrimaryEmailID: "e1", Emails: []domain.ClerkEmail{{ID: "e1", Address: "alice@example.com", Verified: true}}}}
	resolver := services.NewIdentityResolver(users, dir)
	counter := querycount.Attach(t, db)

	mock.ExpectQuery(`SELECT \* FROM "users"`).WillReturnRows(identityUserRows())
	mock.ExpectQuery(`INSERT INTO "users"`).WillReturnError(&pgconn.PgError{Code: "23505", ConstraintName: "users_unique_email"})
	mock.ExpectQuery(`SELECT \* FROM "users"`).WillReturnRows(identityUserRows(identityUserRow(3, "", "legacy", "alice@example.com", true)))
	mock.ExpectQuery(`UPDATE "users" SET`).WillReturnRows(identityUserRows(identityUserRow(3, "user_alice", "legacy", "alice@example.com", true)))

	got, err := resolver.Resolve(context.Background(), "user_alice")
	require.NoError(t, err)
	assert.Equal(t, "user_alice", got.ClerkUserID)
	counter.AssertExactly(t, 4)
	require.NoError(t, mock.ExpectationsWereMet())
}
