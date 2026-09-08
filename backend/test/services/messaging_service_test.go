package services_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- mock ThreadRepository (function-field style) ---

type mockThreadRepo struct {
	createThreadFn       func(ctx context.Context, createdBy int, title *string, participantUserIDs []int) (*domain.MessageThread, error)
	getThreadFn          func(ctx context.Context, threadID int) (*domain.MessageThread, error)
	findDirectThreadFn   func(ctx context.Context, userA, userB int) (*domain.MessageThread, error)
	listThreadsForUserFn func(ctx context.Context, userID int, limit int, beforeLastMessageAt *time.Time) ([]domain.MessageThread, error)
	addParticipantsFn    func(ctx context.Context, threadID int, userIDs []int) error
	setLeftFn            func(ctx context.Context, threadID, userID int, at time.Time) error
	setLastReadFn        func(ctx context.Context, threadID, userID int, seq int64) error
	setMutedFn           func(ctx context.Context, threadID, userID int, muted bool) error
}

func (m *mockThreadRepo) CreateThread(ctx context.Context, createdBy int, title *string, participantUserIDs []int) (*domain.MessageThread, error) {
	if m.createThreadFn != nil {
		return m.createThreadFn(ctx, createdBy, title, participantUserIDs)
	}
	return &domain.MessageThread{ID: 1, CreatedBy: createdBy}, nil
}

func (m *mockThreadRepo) GetThread(ctx context.Context, threadID int) (*domain.MessageThread, error) {
	if m.getThreadFn != nil {
		return m.getThreadFn(ctx, threadID)
	}
	return nil, domain.ErrNotFound
}

func (m *mockThreadRepo) FindDirectThread(ctx context.Context, userA, userB int) (*domain.MessageThread, error) {
	if m.findDirectThreadFn != nil {
		return m.findDirectThreadFn(ctx, userA, userB)
	}
	return nil, domain.ErrNotFound
}

func (m *mockThreadRepo) ListThreadsForUser(ctx context.Context, userID int, limit int, beforeLastMessageAt *time.Time) ([]domain.MessageThread, error) {
	if m.listThreadsForUserFn != nil {
		return m.listThreadsForUserFn(ctx, userID, limit, beforeLastMessageAt)
	}
	return nil, nil
}

func (m *mockThreadRepo) AddParticipants(ctx context.Context, threadID int, userIDs []int) error {
	if m.addParticipantsFn != nil {
		return m.addParticipantsFn(ctx, threadID, userIDs)
	}
	return nil
}

func (m *mockThreadRepo) SetLeft(ctx context.Context, threadID, userID int, at time.Time) error {
	if m.setLeftFn != nil {
		return m.setLeftFn(ctx, threadID, userID, at)
	}
	return nil
}

func (m *mockThreadRepo) SetLastRead(ctx context.Context, threadID, userID int, seq int64) error {
	if m.setLastReadFn != nil {
		return m.setLastReadFn(ctx, threadID, userID, seq)
	}
	return nil
}

func (m *mockThreadRepo) SetMuted(ctx context.Context, threadID, userID int, muted bool) error {
	if m.setMutedFn != nil {
		return m.setMutedFn(ctx, threadID, userID, muted)
	}
	return nil
}

// --- mock MessageRepository ---

type mockMessageRepo struct {
	insertFn      func(ctx context.Context, m *domain.Message) (*domain.Message, error)
	getByIDFn     func(ctx context.Context, id int64) (*domain.Message, error)
	listHistoryFn func(ctx context.Context, threadID int, limit int, beforeSeq *int64) ([]domain.Message, error)
	listSinceFn   func(ctx context.Context, threadID int, sinceSeq int64) ([]domain.Message, error)
	maxSeqFn      func(ctx context.Context, threadID int) (int64, error)
	countSinceFn  func(ctx context.Context, threadID int, sinceSeq int64) (int, error)
	updateBodyFn  func(ctx context.Context, messageID int64, body string, editedAt time.Time) (*domain.Message, error)
	softDeleteFn  func(ctx context.Context, messageID int64, deletedAt time.Time) (*domain.Message, error)
}

func (m *mockMessageRepo) Insert(ctx context.Context, msg *domain.Message) (*domain.Message, error) {
	if m.insertFn != nil {
		return m.insertFn(ctx, msg)
	}
	msg.ID = 1
	msg.Seq = 1
	return msg, nil
}

func (m *mockMessageRepo) GetByID(ctx context.Context, id int64) (*domain.Message, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, id)
	}
	return nil, domain.ErrNotFound
}

func (m *mockMessageRepo) ListHistory(ctx context.Context, threadID int, limit int, beforeSeq *int64) ([]domain.Message, error) {
	if m.listHistoryFn != nil {
		return m.listHistoryFn(ctx, threadID, limit, beforeSeq)
	}
	return nil, nil
}

func (m *mockMessageRepo) ListSince(ctx context.Context, threadID int, sinceSeq int64) ([]domain.Message, error) {
	if m.listSinceFn != nil {
		return m.listSinceFn(ctx, threadID, sinceSeq)
	}
	return nil, nil
}

func (m *mockMessageRepo) MaxSeq(ctx context.Context, threadID int) (int64, error) {
	if m.maxSeqFn != nil {
		return m.maxSeqFn(ctx, threadID)
	}
	return 0, nil
}

func (m *mockMessageRepo) CountSince(ctx context.Context, threadID int, sinceSeq int64) (int, error) {
	if m.countSinceFn != nil {
		return m.countSinceFn(ctx, threadID, sinceSeq)
	}
	return 0, nil
}

func (m *mockMessageRepo) UpdateBody(ctx context.Context, messageID int64, body string, editedAt time.Time) (*domain.Message, error) {
	if m.updateBodyFn != nil {
		return m.updateBodyFn(ctx, messageID, body, editedAt)
	}
	return nil, domain.ErrNotFound
}

func (m *mockMessageRepo) SoftDelete(ctx context.Context, messageID int64, deletedAt time.Time) (*domain.Message, error) {
	if m.softDeleteFn != nil {
		return m.softDeleteFn(ctx, messageID, deletedAt)
	}
	return nil, domain.ErrNotFound
}

// --- mock EventPublisher ---

type mockPublisher struct {
	publishEphemeralFn func(ctx context.Context, env domain.EventEnvelope) error
	calls              []domain.EventEnvelope
}

func (m *mockPublisher) PublishEphemeral(ctx context.Context, env domain.EventEnvelope) error {
	m.calls = append(m.calls, env)
	if m.publishEphemeralFn != nil {
		return m.publishEphemeralFn(ctx, env)
	}
	return nil
}

// --- helpers ---

func threadWithParticipants(id int, userIDs ...int) *domain.MessageThread {
	t := &domain.MessageThread{ID: id, CreatedBy: userIDs[0]}
	for _, uid := range userIDs {
		t.Participants = append(t.Participants, domain.ThreadParticipant{ThreadID: id, UserID: uid})
	}
	return t
}

func newLimiter(max int) *services.SlidingWindowLimiter {
	return services.NewSlidingWindowLimiter(max, time.Minute)
}

// --- SendMessage ---

func TestSendMessage_RejectsNonParticipant(t *testing.T) {
	insertCalled := false
	threadRepo := &mockThreadRepo{
		getThreadFn: func(ctx context.Context, threadID int) (*domain.MessageThread, error) {
			return threadWithParticipants(7, 1, 2), nil
		},
	}
	msgRepo := &mockMessageRepo{
		insertFn: func(ctx context.Context, m *domain.Message) (*domain.Message, error) {
			insertCalled = true
			return m, nil
		},
	}
	svc := services.NewMessagingService(threadRepo, msgRepo, &mockPublisher{}, newLimiter(100))

	_, err := svc.SendMessage(context.Background(), 99, portservices.SendMessageInput{ThreadID: 7, Body: "hi", ClientNonce: "n1"})

	assert.True(t, errors.Is(err, domain.ErrForbidden), "expected ErrForbidden, got %v", err)
	assert.False(t, insertCalled, "msgRepo.Insert must not be called")
}

func TestSendMessage_RejectsOversizeBody(t *testing.T) {
	threadRepo := &mockThreadRepo{
		getThreadFn: func(ctx context.Context, threadID int) (*domain.MessageThread, error) {
			return threadWithParticipants(7, 1, 2), nil
		},
	}
	svc := services.NewMessagingService(threadRepo, &mockMessageRepo{}, &mockPublisher{}, newLimiter(100))

	_, err := svc.SendMessage(context.Background(), 1, portservices.SendMessageInput{
		ThreadID: 7, Body: strings.Repeat("a", 8193), ClientNonce: "n1",
	})

	assert.True(t, errors.Is(err, domain.ErrInvalidInput), "expected ErrInvalidInput, got %v", err)
}

func TestSendMessage_RateLimited(t *testing.T) {
	threadRepo := &mockThreadRepo{
		getThreadFn: func(ctx context.Context, threadID int) (*domain.MessageThread, error) {
			return threadWithParticipants(7, 1, 2), nil
		},
	}
	msgRepo := &mockMessageRepo{
		insertFn: func(ctx context.Context, m *domain.Message) (*domain.Message, error) {
			m.Seq = 1
			return m, nil
		},
	}
	svc := services.NewMessagingService(threadRepo, msgRepo, &mockPublisher{}, newLimiter(1))
	in := portservices.SendMessageInput{ThreadID: 7, Body: "hi", ClientNonce: "n1"}

	_, err := svc.SendMessage(context.Background(), 1, in)
	require.NoError(t, err)

	_, err = svc.SendMessage(context.Background(), 1, in)
	assert.True(t, errors.Is(err, domain.ErrRateLimited), "expected ErrRateLimited, got %v", err)
}

func TestSendMessage_HappyPath_PersistsAndReturns(t *testing.T) {
	threadRepo := &mockThreadRepo{
		getThreadFn: func(ctx context.Context, threadID int) (*domain.MessageThread, error) {
			return threadWithParticipants(7, 1, 2), nil
		},
	}
	msgRepo := &mockMessageRepo{
		insertFn: func(ctx context.Context, m *domain.Message) (*domain.Message, error) {
			m.ID = 55
			m.Seq = 1
			return m, nil
		},
	}
	pub := &mockPublisher{}
	svc := services.NewMessagingService(threadRepo, msgRepo, pub, newLimiter(100))

	got, err := svc.SendMessage(context.Background(), 1, portservices.SendMessageInput{ThreadID: 7, Body: "hello", ClientNonce: "n1"})

	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, int64(1), got.Seq)
	assert.Equal(t, "hello", got.Body)
	assert.Equal(t, 1, got.SenderID)
	assert.Empty(t, pub.calls, "service must not publish MESSAGE_POSTED")
}

// --- MarkRead ---

func TestMarkRead_MovesPointerAndPublishes(t *testing.T) {
	var setLastReadSeq int64
	setLastReadCalled := false
	threadRepo := &mockThreadRepo{
		getThreadFn: func(ctx context.Context, threadID int) (*domain.MessageThread, error) {
			return threadWithParticipants(7, 1, 2), nil
		},
		setLastReadFn: func(ctx context.Context, threadID, userID int, seq int64) error {
			setLastReadCalled = true
			setLastReadSeq = seq
			return nil
		},
	}
	pub := &mockPublisher{}
	msgRepo := &mockMessageRepo{maxSeqFn: func(context.Context, int) (int64, error) { return 100, nil }}
	svc := services.NewMessagingService(threadRepo, msgRepo, pub, newLimiter(100))

	_, err := svc.MarkRead(context.Background(), 1, 7, 42)

	require.NoError(t, err)
	assert.True(t, setLastReadCalled)
	assert.Equal(t, int64(42), setLastReadSeq)
	require.Len(t, pub.calls, 1)
	assert.Equal(t, "READ_RECEIPT_CHANGED", pub.calls[0].Type)
	assert.Equal(t, 1, pub.calls[0].UserID)
	assert.Equal(t, int64(42), pub.calls[0].LastReadSeq)
}

func TestMarkRead_ClampsSeqToThreadMax(t *testing.T) {
	var setLastReadSeq int64
	threadRepo := &mockThreadRepo{
		getThreadFn: func(ctx context.Context, threadID int) (*domain.MessageThread, error) {
			return threadWithParticipants(7, 1, 2), nil
		},
		setLastReadFn: func(ctx context.Context, threadID, userID int, seq int64) error {
			setLastReadSeq = seq
			return nil
		},
	}
	pub := &mockPublisher{}
	msgRepo := &mockMessageRepo{maxSeqFn: func(context.Context, int) (int64, error) { return 9, nil }}
	svc := services.NewMessagingService(threadRepo, msgRepo, pub, newLimiter(100))

	_, err := svc.MarkRead(context.Background(), 1, 7, 999_999)

	require.NoError(t, err)
	assert.Equal(t, int64(9), setLastReadSeq, "seq clamped to the thread's max")
	require.Len(t, pub.calls, 1)
	assert.Equal(t, int64(9), pub.calls[0].LastReadSeq, "published receipt uses the clamped seq")
}

// --- SetTyping ---

func TestSetTyping_PublishesEphemeralOnly(t *testing.T) {
	setLastReadCalled := false
	threadRepo := &mockThreadRepo{
		getThreadFn: func(ctx context.Context, threadID int) (*domain.MessageThread, error) {
			return threadWithParticipants(7, 1, 2), nil
		},
		setLastReadFn: func(ctx context.Context, threadID, userID int, seq int64) error {
			setLastReadCalled = true
			return nil
		},
	}
	pub := &mockPublisher{}
	svc := services.NewMessagingService(threadRepo, &mockMessageRepo{}, pub, newLimiter(100))

	err := svc.SetTyping(context.Background(), 1, 7, true)

	require.NoError(t, err)
	assert.False(t, setLastReadCalled, "no repo writes on SetTyping")
	require.Len(t, pub.calls, 1)
	assert.Equal(t, "TYPING_CHANGED", pub.calls[0].Type)
	assert.True(t, pub.calls[0].Typing)
}

// --- CreateThread ---

func TestCreateThread_DedupesDirectThread(t *testing.T) {
	createCalled := false
	existing := &domain.MessageThread{ID: 500}
	threadRepo := &mockThreadRepo{
		findDirectThreadFn: func(ctx context.Context, userA, userB int) (*domain.MessageThread, error) {
			return existing, nil
		},
		createThreadFn: func(ctx context.Context, createdBy int, title *string, participantUserIDs []int) (*domain.MessageThread, error) {
			createCalled = true
			return &domain.MessageThread{ID: 999}, nil
		},
	}
	svc := services.NewMessagingService(threadRepo, &mockMessageRepo{}, &mockPublisher{}, newLimiter(100))

	got, err := svc.CreateThread(context.Background(), 1, []int{1, 2}, nil)

	require.NoError(t, err)
	assert.Equal(t, 500, got.ID)
	assert.False(t, createCalled, "CreateThread must not be called when a direct thread exists")
}

func TestCreateThread_GroupCreatesNew(t *testing.T) {
	findCalled := false
	var gotCreatedBy int
	var gotIDs []int
	threadRepo := &mockThreadRepo{
		findDirectThreadFn: func(ctx context.Context, userA, userB int) (*domain.MessageThread, error) {
			findCalled = true
			return nil, domain.ErrNotFound
		},
		createThreadFn: func(ctx context.Context, createdBy int, title *string, participantUserIDs []int) (*domain.MessageThread, error) {
			gotCreatedBy = createdBy
			gotIDs = participantUserIDs
			return &domain.MessageThread{ID: 42, CreatedBy: createdBy}, nil
		},
	}
	svc := services.NewMessagingService(threadRepo, &mockMessageRepo{}, &mockPublisher{}, newLimiter(100))

	got, err := svc.CreateThread(context.Background(), 1, []int{1, 2, 3}, nil)

	require.NoError(t, err)
	assert.Equal(t, 42, got.ID)
	assert.False(t, findCalled, "FindDirectThread must not be consulted for group threads")
	assert.Equal(t, 1, gotCreatedBy)
	assert.ElementsMatch(t, []int{1, 2, 3}, gotIDs)
}

func TestCreateThread_FindDirectThreadError_Propagates(t *testing.T) {
	createCalled := false
	dbErr := errors.New("db down")
	threadRepo := &mockThreadRepo{
		findDirectThreadFn: func(ctx context.Context, userA, userB int) (*domain.MessageThread, error) {
			return nil, dbErr
		},
		createThreadFn: func(ctx context.Context, createdBy int, title *string, participantUserIDs []int) (*domain.MessageThread, error) {
			createCalled = true
			return &domain.MessageThread{ID: 999}, nil
		},
	}
	svc := services.NewMessagingService(threadRepo, &mockMessageRepo{}, &mockPublisher{}, newLimiter(100))

	_, err := svc.CreateThread(context.Background(), 1, []int{1, 2}, nil)

	require.Error(t, err)
	assert.ErrorIs(t, err, dbErr)
	assert.False(t, createCalled, "CreateThread must not be called when FindDirectThread errors")
}

// --- LeaveThread ---

func TestLeaveThread_PublishesParticipantRemoved(t *testing.T) {
	setLeftCalled := false
	threadRepo := &mockThreadRepo{
		getThreadFn: func(ctx context.Context, threadID int) (*domain.MessageThread, error) {
			return threadWithParticipants(7, 1, 2), nil
		},
		setLeftFn: func(ctx context.Context, threadID, userID int, at time.Time) error {
			setLeftCalled = true
			return nil
		},
	}
	pub := &mockPublisher{}
	svc := services.NewMessagingService(threadRepo, &mockMessageRepo{}, pub, newLimiter(100))

	err := svc.LeaveThread(context.Background(), 1, 7)

	require.NoError(t, err)
	assert.True(t, setLeftCalled)
	require.Len(t, pub.calls, 1)
	assert.Equal(t, "PARTICIPANT_CHANGED", pub.calls[0].Type)
	assert.Equal(t, "REMOVED", pub.calls[0].Change)
	assert.Equal(t, 1, pub.calls[0].UserID)
}

// --- MaxSeq (RULING R3) ---

func TestMaxSeq_EnforcesParticipantAndReturnsRepoValue(t *testing.T) {
	// Non-participant is rejected.
	threadRepo := &mockThreadRepo{
		getThreadFn: func(ctx context.Context, threadID int) (*domain.MessageThread, error) {
			return threadWithParticipants(7, 1, 2), nil
		},
	}
	msgRepo := &mockMessageRepo{
		maxSeqFn: func(ctx context.Context, threadID int) (int64, error) {
			return 123, nil
		},
	}
	svc := services.NewMessagingService(threadRepo, msgRepo, &mockPublisher{}, newLimiter(100))

	_, err := svc.MaxSeq(context.Background(), 99, 7)
	assert.True(t, errors.Is(err, domain.ErrForbidden), "expected ErrForbidden, got %v", err)

	// Participant gets the repo value.
	got, err := svc.MaxSeq(context.Background(), 1, 7)
	require.NoError(t, err)
	assert.Equal(t, int64(123), got)
}

var _ portservices.MessagingService = (*services.MessagingServiceImpl)(nil)

// --- EditMessage ---

func TestEditMessage_OnlySenderMayEdit(t *testing.T) {
	updateCalled := false
	msgRepo := &mockMessageRepo{
		getByIDFn: func(ctx context.Context, id int64) (*domain.Message, error) {
			return &domain.Message{ID: id, ThreadID: 7, SenderID: 7, Seq: 3}, nil
		},
		updateBodyFn: func(ctx context.Context, messageID int64, body string, editedAt time.Time) (*domain.Message, error) {
			updateCalled = true
			return nil, nil
		},
	}
	svc := services.NewMessagingService(&mockThreadRepo{}, msgRepo, &mockPublisher{}, newLimiter(100))

	_, err := svc.EditMessage(context.Background(), 9, 100, "new body")

	assert.True(t, errors.Is(err, domain.ErrForbidden), "expected ErrForbidden, got %v", err)
	assert.False(t, updateCalled, "UpdateBody must not be called")
}

func TestEditMessage_NotFound(t *testing.T) {
	msgRepo := &mockMessageRepo{
		getByIDFn: func(ctx context.Context, id int64) (*domain.Message, error) {
			return nil, domain.ErrNotFound
		},
	}
	svc := services.NewMessagingService(&mockThreadRepo{}, msgRepo, &mockPublisher{}, newLimiter(100))

	_, err := svc.EditMessage(context.Background(), 1, 100, "x")

	assert.True(t, errors.Is(err, domain.ErrNotFound), "expected ErrNotFound, got %v", err)
}

func TestEditMessage_RejectsEmptyAndOversize(t *testing.T) {
	msgRepo := &mockMessageRepo{
		getByIDFn: func(ctx context.Context, id int64) (*domain.Message, error) {
			return &domain.Message{ID: id, ThreadID: 7, SenderID: 1, Seq: 3}, nil
		},
	}
	svc := services.NewMessagingService(&mockThreadRepo{}, msgRepo, &mockPublisher{}, newLimiter(100))

	_, err := svc.EditMessage(context.Background(), 1, 100, "")
	assert.True(t, errors.Is(err, domain.ErrInvalidInput), "empty body: expected ErrInvalidInput, got %v", err)

	_, err = svc.EditMessage(context.Background(), 1, 100, strings.Repeat("a", 8193))
	assert.True(t, errors.Is(err, domain.ErrInvalidInput), "oversize body: expected ErrInvalidInput, got %v", err)
}

func TestEditMessage_RejectsEditingDeleted(t *testing.T) {
	now := time.Now().UTC()
	msgRepo := &mockMessageRepo{
		getByIDFn: func(ctx context.Context, id int64) (*domain.Message, error) {
			return &domain.Message{ID: id, ThreadID: 7, SenderID: 1, Seq: 3, DeletedAt: &now}, nil
		},
	}
	svc := services.NewMessagingService(&mockThreadRepo{}, msgRepo, &mockPublisher{}, newLimiter(100))

	_, err := svc.EditMessage(context.Background(), 1, 100, "new body")

	assert.True(t, errors.Is(err, domain.ErrInvalidInput), "expected ErrInvalidInput, got %v", err)
}

func TestEditMessage_PublishesMessageEditedEnvelope(t *testing.T) {
	var gotBody string
	msgRepo := &mockMessageRepo{
		getByIDFn: func(ctx context.Context, id int64) (*domain.Message, error) {
			return &domain.Message{ID: id, ThreadID: 7, SenderID: 1, Seq: 3}, nil
		},
		updateBodyFn: func(ctx context.Context, messageID int64, body string, editedAt time.Time) (*domain.Message, error) {
			gotBody = body
			return &domain.Message{ID: messageID, ThreadID: 7, SenderID: 1, Seq: 3, Body: body, EditedAt: &editedAt}, nil
		},
	}
	pub := &mockPublisher{}
	svc := services.NewMessagingService(&mockThreadRepo{}, msgRepo, pub, newLimiter(100))

	got, err := svc.EditMessage(context.Background(), 1, 100, "edited")

	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, "edited", gotBody)
	assert.Equal(t, "edited", got.Body)
	require.Len(t, pub.calls, 1)
	assert.Equal(t, "MESSAGE_EDITED", pub.calls[0].Type)
	assert.Equal(t, 7, pub.calls[0].ThreadID)
	assert.Equal(t, int64(3), pub.calls[0].Seq)
	assert.Equal(t, int64(100), pub.calls[0].MessageID)
}

// --- DeleteMessage ---

func TestDeleteMessage_OnlySenderMayDelete(t *testing.T) {
	softDeleteCalled := false
	msgRepo := &mockMessageRepo{
		getByIDFn: func(ctx context.Context, id int64) (*domain.Message, error) {
			return &domain.Message{ID: id, ThreadID: 7, SenderID: 7, Seq: 3}, nil
		},
		softDeleteFn: func(ctx context.Context, messageID int64, deletedAt time.Time) (*domain.Message, error) {
			softDeleteCalled = true
			return nil, nil
		},
	}
	svc := services.NewMessagingService(&mockThreadRepo{}, msgRepo, &mockPublisher{}, newLimiter(100))

	_, err := svc.DeleteMessage(context.Background(), 9, 100)

	assert.True(t, errors.Is(err, domain.ErrForbidden), "expected ErrForbidden, got %v", err)
	assert.False(t, softDeleteCalled, "SoftDelete must not be called")
}

func TestDeleteMessage_PublishesMessageDeletedEnvelope(t *testing.T) {
	softDeleteCalled := false
	msgRepo := &mockMessageRepo{
		getByIDFn: func(ctx context.Context, id int64) (*domain.Message, error) {
			return &domain.Message{ID: id, ThreadID: 7, SenderID: 1, Seq: 5}, nil
		},
		softDeleteFn: func(ctx context.Context, messageID int64, deletedAt time.Time) (*domain.Message, error) {
			softDeleteCalled = true
			return &domain.Message{ID: messageID, ThreadID: 7, SenderID: 1, Seq: 5, Body: "", DeletedAt: &deletedAt}, nil
		},
	}
	pub := &mockPublisher{}
	svc := services.NewMessagingService(&mockThreadRepo{}, msgRepo, pub, newLimiter(100))

	got, err := svc.DeleteMessage(context.Background(), 1, 100)

	require.NoError(t, err)
	require.NotNil(t, got)
	assert.True(t, softDeleteCalled)
	assert.NotNil(t, got.DeletedAt)
	require.Len(t, pub.calls, 1)
	assert.Equal(t, "MESSAGE_DELETED", pub.calls[0].Type)
	assert.Equal(t, 7, pub.calls[0].ThreadID)
	assert.Equal(t, int64(5), pub.calls[0].Seq)
	assert.Equal(t, int64(100), pub.calls[0].MessageID)
}

func TestDeleteMessage_IdempotentWhenAlreadyDeleted(t *testing.T) {
	now := time.Now().UTC()
	softDeleteCalled := false
	msgRepo := &mockMessageRepo{
		getByIDFn: func(ctx context.Context, id int64) (*domain.Message, error) {
			return &domain.Message{ID: id, ThreadID: 7, SenderID: 1, Seq: 5, DeletedAt: &now}, nil
		},
		softDeleteFn: func(ctx context.Context, messageID int64, deletedAt time.Time) (*domain.Message, error) {
			softDeleteCalled = true
			return nil, nil
		},
	}
	pub := &mockPublisher{}
	svc := services.NewMessagingService(&mockThreadRepo{}, msgRepo, pub, newLimiter(100))

	got, err := svc.DeleteMessage(context.Background(), 1, 100)

	require.NoError(t, err)
	require.NotNil(t, got)
	assert.NotNil(t, got.DeletedAt)
	assert.False(t, softDeleteCalled, "SoftDelete must not be called for an already-deleted message")
	assert.Empty(t, pub.calls, "no publish on idempotent delete")
}

// --- MuteThread ---

func TestMuteThread_RequiresParticipant(t *testing.T) {
	setMutedCalled := false
	threadRepo := &mockThreadRepo{
		getThreadFn: func(ctx context.Context, threadID int) (*domain.MessageThread, error) {
			return threadWithParticipants(7, 1, 2), nil
		},
		setMutedFn: func(ctx context.Context, threadID, userID int, muted bool) error {
			setMutedCalled = true
			return nil
		},
	}
	svc := services.NewMessagingService(threadRepo, &mockMessageRepo{}, &mockPublisher{}, newLimiter(100))

	_, err := svc.MuteThread(context.Background(), 99, 7, true)

	assert.True(t, errors.Is(err, domain.ErrForbidden), "expected ErrForbidden, got %v", err)
	assert.False(t, setMutedCalled, "SetMuted must not be called")
}

func TestMuteThread_SetsAndReturnsThread(t *testing.T) {
	var gotThreadID, gotUserID int
	var gotMuted bool
	returned := threadWithParticipants(7, 1, 2)
	threadRepo := &mockThreadRepo{
		getThreadFn: func(ctx context.Context, threadID int) (*domain.MessageThread, error) {
			return returned, nil
		},
		setMutedFn: func(ctx context.Context, threadID, userID int, muted bool) error {
			gotThreadID, gotUserID, gotMuted = threadID, userID, muted
			return nil
		},
	}
	svc := services.NewMessagingService(threadRepo, &mockMessageRepo{}, &mockPublisher{}, newLimiter(100))

	got, err := svc.MuteThread(context.Background(), 1, 7, true)

	require.NoError(t, err)
	assert.Same(t, returned, got)
	assert.Equal(t, 7, gotThreadID)
	assert.Equal(t, 1, gotUserID)
	assert.True(t, gotMuted)
}
