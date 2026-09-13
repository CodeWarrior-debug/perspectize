package realtime_test

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/realtime"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/repositories/postgres"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/pkg/database"
	"github.com/stretchr/testify/require"
)

// TestListener_DeliversNotifyToHub is DB-gated: it needs a local Postgres named
// by DATABASE_URL with the messaging migrations applied. It inserts a message
// through the real repository (which fires the pg_notify trigger) and asserts
// the Listener decodes the NOTIFY and the Hub fans a MessagePostedEvent with
// the right body out to a thread subscriber.
func TestListener_DeliversNotifyToHub(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("no DATABASE_URL")
	}

	db, err := database.ConnectGORM(dsn, database.DefaultPoolConfig())
	require.NoError(t, err)
	require.NoError(t, database.PingGORM(context.Background(), db))

	userRepo := postgres.NewGormUserRepository(db)
	threadRepo := postgres.NewGormThreadRepository(db)
	msgRepo := postgres.NewGormMessageRepository(db)
	ctx := context.Background()

	salt := time.Now().UnixNano()
	a, err := userRepo.CreateFromClerk(ctx, fmt.Sprintf("l%x", salt), fmt.Sprintf("lst-a-%x", salt&0xFFFFFF), "")
	require.NoError(t, err)
	b, err := userRepo.CreateFromClerk(ctx, fmt.Sprintf("m%x", salt), fmt.Sprintf("lst-b-%x", salt&0xFFFFFF), "")
	require.NoError(t, err)

	thread, err := threadRepo.CreateThread(ctx, a.ID, nil, []int{a.ID, b.ID})
	require.NoError(t, err)

	// One seed message so the thread sequence is warm.
	_, err = msgRepo.Insert(ctx, &domain.Message{ThreadID: thread.ID, SenderID: a.ID, Body: "seed", ClientNonce: "seed-nonce"})
	require.NoError(t, err)

	t.Cleanup(func() {
		require.NoError(t, db.Exec("DELETE FROM message_threads WHERE id = ?", thread.ID).Error)
		require.NoError(t, db.Exec("DELETE FROM messages WHERE sender_id IN ?", []int{a.ID, b.ID}).Error)
		require.NoError(t, db.Exec("DELETE FROM thread_participants WHERE user_id IN ?", []int{a.ID, b.ID}).Error)
		require.NoError(t, db.Exec("DELETE FROM users WHERE id IN ?", []int{a.ID, b.ID}).Error)
	})

	hub := realtime.NewHub(msgRepo, threadRepo, nil)
	listener := realtime.NewListener(dsn, hub)

	runCtx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	go listener.Run(runCtx)

	// Give the dedicated LISTEN connection time to establish before we notify.
	time.Sleep(500 * time.Millisecond)

	ch, unsub := hub.Subscribe(thread.ID, 1)
	t.Cleanup(unsub)

	const want = "hello over LISTEN"
	_, err = msgRepo.Insert(ctx, &domain.Message{ThreadID: thread.ID, SenderID: b.ID, Body: want, ClientNonce: "notify-nonce"})
	require.NoError(t, err)

	select {
	case evt := <-ch:
		mp, ok := evt.(domain.MessagePostedEvent)
		require.True(t, ok, "expected MessagePostedEvent, got %T", evt)
		require.Equal(t, want, mp.Message.Body)
	case <-time.After(3 * time.Second):
		t.Fatal("no MessagePostedEvent delivered via LISTEN within 3s")
	}
}
