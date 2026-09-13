package repositories

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/repositories/postgres"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// messageTestSetup creates two users and a thread between them, returning the
// message repository, thread id, and the two user ids. Cleanup is registered.
func messageTestSetup(t *testing.T) (*postgres.GormMessageRepository, int, int, int) {
	t.Helper()
	db := openTestDB(t)
	userRepo := postgres.NewGormUserRepository(db)
	threadRepo := postgres.NewGormThreadRepository(db)
	msgRepo := postgres.NewGormMessageRepository(db)
	ctx := context.Background()

	a := mustCreateUser(t, userRepo, "msg-a")
	b := mustCreateUser(t, userRepo, "msg-b")
	t.Cleanup(func() { cleanupUsers(t, db, a, b) })

	thread, err := threadRepo.CreateThread(ctx, a, nil, []int{a, b})
	require.NoError(t, err)
	require.NotZero(t, thread.ID)

	return msgRepo, thread.ID, a, b
}

func TestGormMessageRepository_InsertAssignsSeq(t *testing.T) {
	repo, threadID, a, _ := messageTestSetup(t)
	ctx := context.Background()

	m1, err := repo.Insert(ctx, &domain.Message{ThreadID: threadID, SenderID: a, Body: "first", ClientNonce: "n1"})
	require.NoError(t, err)
	assert.Equal(t, int64(1), m1.Seq)
	assert.False(t, m1.CreatedAt.IsZero())
	assert.NotZero(t, m1.ID)

	m2, err := repo.Insert(ctx, &domain.Message{ThreadID: threadID, SenderID: a, Body: "second", ClientNonce: "n2"})
	require.NoError(t, err)
	assert.Equal(t, int64(2), m2.Seq)
	assert.False(t, m2.CreatedAt.IsZero())
}

func TestGormMessageRepository_Insert_IdempotentOnNonce(t *testing.T) {
	repo, threadID, a, _ := messageTestSetup(t)
	ctx := context.Background()

	first, err := repo.Insert(ctx, &domain.Message{ThreadID: threadID, SenderID: a, Body: "x", ClientNonce: "dup"})
	require.NoError(t, err)
	assert.Equal(t, int64(1), first.Seq)

	again, err := repo.Insert(ctx, &domain.Message{ThreadID: threadID, SenderID: a, Body: "x2", ClientNonce: "dup"})
	require.NoError(t, err)
	assert.Equal(t, first.ID, again.ID)
	assert.Equal(t, int64(1), again.Seq)
	assert.Equal(t, "x", again.Body, "duplicate nonce must return the original row, not the new body")

	max, err := repo.MaxSeq(ctx, threadID)
	require.NoError(t, err)
	assert.Equal(t, int64(1), max, "no second row should have been inserted")
}

func TestGormMessageRepository_ListSince_AscFromSeq(t *testing.T) {
	repo, threadID, a, _ := messageTestSetup(t)
	ctx := context.Background()

	for i := 1; i <= 5; i++ {
		_, err := repo.Insert(ctx, &domain.Message{ThreadID: threadID, SenderID: a, Body: fmt.Sprintf("m%d", i), ClientNonce: fmt.Sprintf("n%d", i)})
		require.NoError(t, err)
	}

	got, err := repo.ListSince(ctx, threadID, 2)
	require.NoError(t, err)
	require.Len(t, got, 3)
	assert.Equal(t, []int64{3, 4, 5}, []int64{got[0].Seq, got[1].Seq, got[2].Seq})
}

func TestGormMessageRepository_ListHistory_DescBackwardPaging(t *testing.T) {
	repo, threadID, a, _ := messageTestSetup(t)
	ctx := context.Background()

	for i := 1; i <= 5; i++ {
		_, err := repo.Insert(ctx, &domain.Message{ThreadID: threadID, SenderID: a, Body: fmt.Sprintf("m%d", i), ClientNonce: fmt.Sprintf("n%d", i)})
		require.NoError(t, err)
	}

	page1, err := repo.ListHistory(ctx, threadID, 2, nil)
	require.NoError(t, err)
	require.Len(t, page1, 2)
	assert.Equal(t, []int64{5, 4}, []int64{page1[0].Seq, page1[1].Seq})

	before := int64(4)
	page2, err := repo.ListHistory(ctx, threadID, 2, &before)
	require.NoError(t, err)
	require.Len(t, page2, 2)
	assert.Equal(t, []int64{3, 2}, []int64{page2[0].Seq, page2[1].Seq})
}

func TestGormMessageRepository_MaxSeq(t *testing.T) {
	repo, threadID, a, _ := messageTestSetup(t)
	ctx := context.Background()

	max, err := repo.MaxSeq(ctx, threadID)
	require.NoError(t, err)
	assert.Equal(t, int64(0), max)

	for i := 1; i <= 3; i++ {
		_, err := repo.Insert(ctx, &domain.Message{ThreadID: threadID, SenderID: a, Body: fmt.Sprintf("m%d", i), ClientNonce: fmt.Sprintf("n%d", i)})
		require.NoError(t, err)
	}

	max, err = repo.MaxSeq(ctx, threadID)
	require.NoError(t, err)
	assert.Equal(t, int64(3), max)
}

func TestGormMessageRepository_UpdateBody(t *testing.T) {
	repo, threadID, a, _ := messageTestSetup(t)
	ctx := context.Background()

	m, err := repo.Insert(ctx, &domain.Message{ThreadID: threadID, SenderID: a, Body: "original", ClientNonce: "u1"})
	require.NoError(t, err)

	edited, err := repo.UpdateBody(ctx, m.ID, "edited text", time.Now().UTC())
	require.NoError(t, err)
	assert.Equal(t, "edited text", edited.Body)
	require.NotNil(t, edited.EditedAt)
	assert.Equal(t, m.Seq, edited.Seq, "seq must not change on edit")
}

func TestGormMessageRepository_SoftDelete(t *testing.T) {
	repo, threadID, a, _ := messageTestSetup(t)
	ctx := context.Background()

	m, err := repo.Insert(ctx, &domain.Message{ThreadID: threadID, SenderID: a, Body: "to be deleted", ClientNonce: "d1"})
	require.NoError(t, err)

	del, err := repo.SoftDelete(ctx, m.ID, time.Now().UTC())
	require.NoError(t, err)
	require.NotNil(t, del.DeletedAt)
	assert.Equal(t, "", del.Body, "soft delete must blank the body")
	assert.Equal(t, m.Seq, del.Seq, "seq must survive as a tombstone")
}

func TestGormMessageRepository_UpdateBody_NotFound(t *testing.T) {
	repo, _, _, _ := messageTestSetup(t)
	_, err := repo.UpdateBody(context.Background(), 999999999, "x", time.Now().UTC())
	assert.True(t, errors.Is(err, domain.ErrNotFound), "want ErrNotFound, got %v", err)
}

func TestGormMessageRepository_SoftDelete_NotFound(t *testing.T) {
	repo, _, _, _ := messageTestSetup(t)
	_, err := repo.SoftDelete(context.Background(), 999999999, time.Now().UTC())
	assert.True(t, errors.Is(err, domain.ErrNotFound), "want ErrNotFound, got %v", err)
}

func TestGormMessageRepository_RetentionPrunesBeyond1000(t *testing.T) {
	repo, threadID, a, _ := messageTestSetup(t)
	ctx := context.Background()

	for i := 1; i <= 1050; i++ {
		_, err := repo.Insert(ctx, &domain.Message{ThreadID: threadID, SenderID: a, Body: fmt.Sprintf("m%d", i), ClientNonce: fmt.Sprintf("n%d", i)})
		require.NoError(t, err)
	}

	max, err := repo.MaxSeq(ctx, threadID)
	require.NoError(t, err)
	assert.Equal(t, int64(1050), max)

	all, err := repo.ListSince(ctx, threadID, 0)
	require.NoError(t, err)
	assert.Len(t, all, 1000, "retention trigger should keep only the most recent 1000")
	require.NotEmpty(t, all)
	assert.Equal(t, int64(51), all[0].Seq, "oldest surviving message should be seq 51")
	assert.Equal(t, int64(1050), all[len(all)-1].Seq)
}
