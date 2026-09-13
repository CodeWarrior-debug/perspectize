package services_test

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/repositories/postgres"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/CodeWarrior-debug/perspectize/backend/pkg/database"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// openTestDBOrSkip connects to DATABASE_URL, skipping (not failing) when no
// database is reachable — mirrors backend/test/repositories/helpers_test.go.
func openTestDBOrSkip(t *testing.T) *gorm.DB {
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

// seedThreadWithMessages creates two users and a thread between them, inserts n
// messages (the assign_message_seq trigger fills seq 1..n), and returns the
// thread id and the sender's user id. Cleanup is registered on t.
func seedThreadWithMessages(t *testing.T, db *gorm.DB, n int) (threadID int, sender int) {
	t.Helper()
	ctx := context.Background()

	userRepo := postgres.NewGormUserRepository(db)
	threadRepo := postgres.NewGormThreadRepository(db)
	msgRepo := postgres.NewGormMessageRepository(db)

	salt := time.Now().UnixNano()
	a, err := userRepo.CreateFromClerk(ctx, fmt.Sprintf("r%x", salt), fmt.Sprintf("ret-a-%x", salt&0xFFFFFFFF), "")
	require.NoError(t, err)
	b, err := userRepo.CreateFromClerk(ctx, fmt.Sprintf("r%x", salt+1), fmt.Sprintf("ret-b-%x", (salt+1)&0xFFFFFFFF), "")
	require.NoError(t, err)

	thread, err := threadRepo.CreateThread(ctx, a.ID, nil, []int{a.ID, b.ID})
	require.NoError(t, err)
	require.NotZero(t, thread.ID)

	for i := 1; i <= n; i++ {
		_, err := msgRepo.Insert(ctx, &domain.Message{
			ThreadID:    thread.ID,
			SenderID:    a.ID,
			Body:        fmt.Sprintf("m%d", i),
			ClientNonce: fmt.Sprintf("n%d", i),
		})
		require.NoError(t, err)
	}

	t.Cleanup(func() {
		db.Exec("DELETE FROM message_threads WHERE id = ?", thread.ID)
		db.Exec("DELETE FROM messages WHERE sender_id IN ?", []int{a.ID, b.ID})
		db.Exec("DELETE FROM thread_participants WHERE user_id IN ?", []int{a.ID, b.ID})
		db.Exec("DELETE FROM users WHERE id IN ?", []int{a.ID, b.ID})
	})

	return thread.ID, a.ID
}

func TestRetentionSweeper_KeepsNewestN(t *testing.T) {
	db := openTestDBOrSkip(t)
	ctx := context.Background()

	threadID, sender := seedThreadWithMessages(t, db, 30)
	_ = sender

	sw := services.NewRetentionSweeper(db, 10, 0)
	deleted, err := sw.SweepOnce(ctx)
	if err != nil {
		t.Fatalf("SweepOnce: %v", err)
	}
	if deleted != 20 {
		t.Fatalf("deleted = %d, want 20", deleted)
	}

	var count int64
	db.Table("messages").Where("thread_id = ?", threadID).Count(&count)
	if count != 10 {
		t.Fatalf("remaining = %d, want 10", count)
	}

	var minSeq, maxSeq int64
	db.Table("messages").Where("thread_id = ?", threadID).Select("min(seq)").Scan(&minSeq)
	db.Table("messages").Where("thread_id = ?", threadID).Select("max(seq)").Scan(&maxSeq)
	if minSeq != 21 || maxSeq != 30 {
		t.Fatalf("seq window = [%d,%d], want [21,30] (no renumbering)", minSeq, maxSeq)
	}
}

func TestRetentionSweeper_DisabledIsNoop(t *testing.T) {
	sw := services.NewRetentionSweeper(nil, 0, 0)
	deleted, err := sw.SweepOnce(context.Background())
	if err != nil || deleted != 0 {
		t.Fatalf("disabled sweep: deleted=%d err=%v, want 0,nil", deleted, err)
	}
}
