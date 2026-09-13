package repositories

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/repositories/postgres"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func participantSeq(t *testing.T, thread *domain.MessageThread, userID int) int64 {
	t.Helper()
	for _, p := range thread.Participants {
		if p.UserID == userID {
			return p.LastReadSeq
		}
	}
	t.Fatalf("user %d is not a participant of thread %d", userID, thread.ID)
	return 0
}

func TestGormThreadRepository_CreateAndGet(t *testing.T) {
	db := openTestDB(t)
	repo := postgres.NewGormThreadRepository(db)
	userRepo := postgres.NewGormUserRepository(db)
	ctx := context.Background()

	a := mustCreateUser(t, userRepo, "thr-a")
	b := mustCreateUser(t, userRepo, "thr-b")
	t.Cleanup(func() { cleanupUsers(t, db, a, b) })

	thread, err := repo.CreateThread(ctx, a, nil, []int{a, b})
	require.NoError(t, err)
	assert.NotZero(t, thread.ID)
	assert.Len(t, thread.Participants, 2)

	// Creator is OWNER, everyone else MEMBER.
	for _, p := range thread.Participants {
		if p.UserID == a {
			assert.Equal(t, domain.ThreadRoleOwner, p.Role)
		} else {
			assert.Equal(t, domain.ThreadRoleMember, p.Role)
		}
	}

	got, err := repo.GetThread(ctx, thread.ID)
	require.NoError(t, err)
	assert.True(t, got.IsActiveParticipant(a))
	assert.True(t, got.IsActiveParticipant(b))

	// The trg_init_thread_sequence trigger must have created the sequence row.
	var seqCount int64
	require.NoError(t, db.Raw("SELECT count(*) FROM thread_sequences WHERE thread_id = ?", thread.ID).Scan(&seqCount).Error)
	assert.Equal(t, int64(1), seqCount)
}

func TestGormThreadRepository_GetThread_NotFound(t *testing.T) {
	db := openTestDB(t)
	repo := postgres.NewGormThreadRepository(db)
	ctx := context.Background()

	_, err := repo.GetThread(ctx, -1)
	assert.True(t, errors.Is(err, domain.ErrNotFound), "expected domain.ErrNotFound, got %v", err)
}

func TestGormThreadRepository_FindDirectThread(t *testing.T) {
	db := openTestDB(t)
	repo := postgres.NewGormThreadRepository(db)
	userRepo := postgres.NewGormUserRepository(db)
	ctx := context.Background()

	a := mustCreateUser(t, userRepo, "thr-a")
	b := mustCreateUser(t, userRepo, "thr-b")
	c := mustCreateUser(t, userRepo, "thr-c")
	t.Cleanup(func() { cleanupUsers(t, db, a, b, c) })

	created, err := repo.CreateThread(ctx, a, nil, []int{a, b})
	require.NoError(t, err)

	found, err := repo.FindDirectThread(ctx, a, b)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)

	// Order of arguments should not matter.
	foundReversed, err := repo.FindDirectThread(ctx, b, a)
	require.NoError(t, err)
	assert.Equal(t, created.ID, foundReversed.ID)

	_, err = repo.FindDirectThread(ctx, a, c)
	assert.True(t, errors.Is(err, domain.ErrNotFound), "expected domain.ErrNotFound, got %v", err)
}

func TestGormThreadRepository_SetLastRead_ForwardOnly(t *testing.T) {
	db := openTestDB(t)
	repo := postgres.NewGormThreadRepository(db)
	userRepo := postgres.NewGormUserRepository(db)
	ctx := context.Background()

	a := mustCreateUser(t, userRepo, "thr-a")
	b := mustCreateUser(t, userRepo, "thr-b")
	t.Cleanup(func() { cleanupUsers(t, db, a, b) })

	threadID := mustCreateThread(t, repo, a, []int{a, b})

	require.NoError(t, repo.SetLastRead(ctx, threadID, a, 5))
	require.NoError(t, repo.SetLastRead(ctx, threadID, a, 3)) // backward — must be ignored

	got, err := repo.GetThread(ctx, threadID)
	require.NoError(t, err)
	assert.Equal(t, int64(5), participantSeq(t, got, a))

	// Forward again still advances.
	require.NoError(t, repo.SetLastRead(ctx, threadID, a, 9))
	got, err = repo.GetThread(ctx, threadID)
	require.NoError(t, err)
	assert.Equal(t, int64(9), participantSeq(t, got, a))
}

func TestGormThreadRepository_SetLeft_ExcludesFromActive(t *testing.T) {
	db := openTestDB(t)
	repo := postgres.NewGormThreadRepository(db)
	userRepo := postgres.NewGormUserRepository(db)
	ctx := context.Background()

	a := mustCreateUser(t, userRepo, "thr-a")
	b := mustCreateUser(t, userRepo, "thr-b")
	t.Cleanup(func() { cleanupUsers(t, db, a, b) })

	threadID := mustCreateThread(t, repo, a, []int{a, b})

	require.NoError(t, repo.SetLeft(ctx, threadID, b, time.Now()))

	got, err := repo.GetThread(ctx, threadID)
	require.NoError(t, err)
	assert.False(t, got.IsActiveParticipant(b))
	assert.True(t, got.IsActiveParticipant(a))
}

func TestGormThreadRepository_AddParticipants_ClearsLeftAt(t *testing.T) {
	db := openTestDB(t)
	repo := postgres.NewGormThreadRepository(db)
	userRepo := postgres.NewGormUserRepository(db)
	ctx := context.Background()

	a := mustCreateUser(t, userRepo, "thr-a")
	b := mustCreateUser(t, userRepo, "thr-b")
	t.Cleanup(func() { cleanupUsers(t, db, a, b) })

	threadID := mustCreateThread(t, repo, a, []int{a, b})

	require.NoError(t, repo.SetLeft(ctx, threadID, b, time.Now()))
	require.NoError(t, repo.AddParticipants(ctx, threadID, []int{b}))

	got, err := repo.GetThread(ctx, threadID)
	require.NoError(t, err)
	assert.True(t, got.IsActiveParticipant(b), "rejoining participant should have left_at cleared")
}

func TestGormThreadRepository_SetMuted(t *testing.T) {
	db := openTestDB(t)
	repo := postgres.NewGormThreadRepository(db)
	userRepo := postgres.NewGormUserRepository(db)
	ctx := context.Background()

	a := mustCreateUser(t, userRepo, "thr-a")
	b := mustCreateUser(t, userRepo, "thr-b")
	t.Cleanup(func() { cleanupUsers(t, db, a, b) })

	threadID := mustCreateThread(t, repo, a, []int{a, b})

	require.NoError(t, repo.SetMuted(ctx, threadID, a, true))

	got, err := repo.GetThread(ctx, threadID)
	require.NoError(t, err)
	for _, p := range got.Participants {
		if p.UserID == a {
			assert.True(t, p.Muted, "muted flag must be persisted")
		}
	}

	require.NoError(t, repo.SetMuted(ctx, threadID, a, false))
	got, err = repo.GetThread(ctx, threadID)
	require.NoError(t, err)
	for _, p := range got.Participants {
		if p.UserID == a {
			assert.False(t, p.Muted, "muted flag must be clearable")
		}
	}
}

func TestGormThreadRepository_SetMuted_NotFound(t *testing.T) {
	db := openTestDB(t)
	repo := postgres.NewGormThreadRepository(db)
	ctx := context.Background()

	err := repo.SetMuted(ctx, -1, -1, true)
	assert.True(t, errors.Is(err, domain.ErrNotFound), "expected domain.ErrNotFound, got %v", err)
}

func TestGormThreadRepository_ListThreadsForUser_DescByLastMessage(t *testing.T) {
	db := openTestDB(t)
	repo := postgres.NewGormThreadRepository(db)
	userRepo := postgres.NewGormUserRepository(db)
	ctx := context.Background()

	a := mustCreateUser(t, userRepo, "thr-a")
	b := mustCreateUser(t, userRepo, "thr-b")
	t.Cleanup(func() { cleanupUsers(t, db, a, b) })

	t1 := mustCreateThread(t, repo, a, []int{a, b})
	t2 := mustCreateThread(t, repo, a, []int{a, b})

	// Make t2 the most recently active thread.
	future := time.Now().Add(1 * time.Hour)
	require.NoError(t, db.Exec("UPDATE message_threads SET last_message_at = ? WHERE id = ?", future, t2).Error)
	past := time.Now().Add(-1 * time.Hour)
	require.NoError(t, db.Exec("UPDATE message_threads SET last_message_at = ? WHERE id = ?", past, t1).Error)

	threads, err := repo.ListThreadsForUser(ctx, a, 10, nil)
	require.NoError(t, err)
	require.GreaterOrEqual(t, len(threads), 2)
	assert.Equal(t, t2, threads[0].ID)
	assert.Equal(t, t1, threads[1].ID)
	assert.NotEmpty(t, threads[0].Participants)

	// before cursor excludes threads at/after the given time.
	cursor := time.Now()
	threadsBefore, err := repo.ListThreadsForUser(ctx, a, 10, &cursor)
	require.NoError(t, err)
	for _, th := range threadsBefore {
		assert.NotEqual(t, t2, th.ID, "t2 is in the future and must be excluded by the before cursor")
	}
}
