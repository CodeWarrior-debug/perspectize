package repositories

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/repositories/postgres"
	"github.com/CodeWarrior-debug/perspectize/backend/pkg/database"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// openTestDB connects to the database named by DATABASE_URL. It skips the calling
// test (rather than failing) when the env var is empty or the connection cannot
// be established, so the suite stays green on machines without a local Postgres.
func openTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("Skipping - PostgreSQL not available")
	}

	db, err := database.ConnectGORM(dsn, database.DefaultPoolConfig())
	if err != nil {
		t.Skip("Skipping - PostgreSQL not available")
	}
	if err := database.PingGORM(context.Background(), db); err != nil {
		t.Skip("Skipping - PostgreSQL not available")
	}
	return db
}

// mustCreateUser inserts a user via the real user repository and returns its id.
// The Clerk id and username are salted with a nanosecond timestamp so repeated
// runs against a persistent dev database do not collide.
func mustCreateUser(t *testing.T, userRepo *postgres.GormUserRepository, username string) int {
	t.Helper()

	// clerk_user_id is varchar(24), so keep the generated id short: a 1-char
	// prefix plus the hex nanosecond clock stays well under the limit and is
	// unique enough for repeated runs against a persistent dev database.
	salt := time.Now().UnixNano()
	uniqueName := fmt.Sprintf("%s-%x", username, salt&0xFFFFFFFF)
	clerkID := fmt.Sprintf("c%x", salt)

	u, err := userRepo.CreateFromClerk(context.Background(), clerkID, uniqueName, "")
	require.NoError(t, err)
	require.NotZero(t, u.ID)
	return u.ID
}

// cleanupUsers removes the given users and every messaging row that hangs off
// them. Threads are deleted first: message_threads cascades to
// thread_participants, thread_sequences and messages, so only participant rows
// in *other* users' threads need a separate sweep before the users themselves.
func cleanupUsers(t *testing.T, db *gorm.DB, ids ...int) {
	t.Helper()
	if len(ids) == 0 {
		return
	}

	require.NoError(t, db.Exec("DELETE FROM message_threads WHERE created_by IN ?", ids).Error)
	require.NoError(t, db.Exec("DELETE FROM messages WHERE sender_id IN ?", ids).Error)
	require.NoError(t, db.Exec("DELETE FROM thread_participants WHERE user_id IN ?", ids).Error)
	require.NoError(t, db.Exec("DELETE FROM users WHERE id IN ?", ids).Error)
}

// mustCreateThread is a thin wrapper used by the thread-repository tests.
func mustCreateThread(t *testing.T, repo *postgres.GormThreadRepository, createdBy int, participantIDs []int) int {
	t.Helper()
	thread, err := repo.CreateThread(context.Background(), createdBy, nil, participantIDs)
	require.NoError(t, err)
	require.NotZero(t, thread.ID)
	return thread.ID
}
