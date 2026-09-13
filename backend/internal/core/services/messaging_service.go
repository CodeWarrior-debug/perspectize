package services

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

const maxMessageBodyBytes = 8192

// MessagingServiceImpl is the business-logic implementation of MessagingService.
type MessagingServiceImpl struct {
	threadRepo repositories.ThreadRepository
	msgRepo    repositories.MessageRepository
	publisher  portservices.EventPublisher
	limiter    *SlidingWindowLimiter
}

var _ portservices.MessagingService = (*MessagingServiceImpl)(nil)

// NewMessagingService constructs the messaging business-logic service.
func NewMessagingService(
	threadRepo repositories.ThreadRepository,
	msgRepo repositories.MessageRepository,
	publisher portservices.EventPublisher,
	limiter *SlidingWindowLimiter,
) *MessagingServiceImpl {
	return &MessagingServiceImpl{threadRepo, msgRepo, publisher, limiter}
}

// AssertParticipant verifies that the actor is an active participant in the thread.
func (s *MessagingServiceImpl) AssertParticipant(ctx context.Context, actorUserID, threadID int) error {
	thread, err := s.threadRepo.GetThread(ctx, threadID)
	if err != nil {
		return err
	}
	if thread == nil {
		// A repository that reports "missing" as (nil, nil) must not reach
		// IsActiveParticipant — that is a value receiver and would panic.
		return fmt.Errorf("%w: thread %d", domain.ErrNotFound, threadID)
	}
	if !thread.IsActiveParticipant(actorUserID) {
		return fmt.Errorf("%w: not a participant of thread %d", domain.ErrForbidden, threadID)
	}
	return nil
}

// SendMessage persists a new message to a thread from the actor.
func (s *MessagingServiceImpl) SendMessage(ctx context.Context, actorUserID int, in portservices.SendMessageInput) (*domain.Message, error) {
	if len(in.Body) == 0 || len([]byte(in.Body)) > maxMessageBodyBytes {
		return nil, fmt.Errorf("%w: message body must be 1..%d bytes", domain.ErrInvalidInput, maxMessageBodyBytes)
	}
	if in.ClientNonce == "" {
		return nil, fmt.Errorf("%w: clientNonce required", domain.ErrInvalidInput)
	}
	if err := s.AssertParticipant(ctx, actorUserID, in.ThreadID); err != nil {
		return nil, err
	}
	if !s.limiter.Allow(fmt.Sprintf("send:%d", actorUserID)) {
		return nil, fmt.Errorf("%w: too many messages", domain.ErrRateLimited)
	}
	return s.msgRepo.Insert(ctx, &domain.Message{
		ThreadID:    in.ThreadID,
		SenderID:    actorUserID,
		Body:        in.Body,
		ClientNonce: in.ClientNonce,
	})
}

// EditMessage updates the body of a message the actor sent.
func (s *MessagingServiceImpl) EditMessage(ctx context.Context, actorUserID int, messageID int64, body string) (*domain.Message, error) {
	msg, err := s.msgRepo.GetByID(ctx, messageID)
	if err != nil {
		return nil, err
	}
	if msg.SenderID != actorUserID {
		return nil, fmt.Errorf("%w: only the sender may edit message %d", domain.ErrForbidden, messageID)
	}
	if msg.DeletedAt != nil {
		return nil, fmt.Errorf("%w: message %d is deleted", domain.ErrInvalidInput, messageID)
	}
	if len(body) == 0 || len([]byte(body)) > maxMessageBodyBytes {
		return nil, fmt.Errorf("%w: message body must be 1..%d bytes", domain.ErrInvalidInput, maxMessageBodyBytes)
	}
	updated, err := s.msgRepo.UpdateBody(ctx, messageID, body, time.Now().UTC())
	if err != nil {
		return nil, err
	}
	_ = s.publisher.PublishEphemeral(ctx, domain.EventEnvelope{
		Type:      "MESSAGE_EDITED",
		ThreadID:  msg.ThreadID,
		Seq:       msg.Seq,
		MessageID: messageID,
	})
	return updated, nil
}

// DeleteMessage soft-deletes a message the actor sent. Idempotent when the
// message is already deleted.
func (s *MessagingServiceImpl) DeleteMessage(ctx context.Context, actorUserID int, messageID int64) (*domain.Message, error) {
	msg, err := s.msgRepo.GetByID(ctx, messageID)
	if err != nil {
		return nil, err
	}
	if msg.SenderID != actorUserID {
		return nil, fmt.Errorf("%w: only the sender may delete message %d", domain.ErrForbidden, messageID)
	}
	if msg.DeletedAt != nil {
		return msg, nil
	}
	tombstoned, err := s.msgRepo.SoftDelete(ctx, messageID, time.Now().UTC())
	if err != nil {
		return nil, err
	}
	_ = s.publisher.PublishEphemeral(ctx, domain.EventEnvelope{
		Type:      "MESSAGE_DELETED",
		ThreadID:  msg.ThreadID,
		Seq:       msg.Seq,
		MessageID: messageID,
	})
	return tombstoned, nil
}

// MuteThread sets the actor's muted flag for a thread they participate in.
func (s *MessagingServiceImpl) MuteThread(ctx context.Context, actorUserID, threadID int, muted bool) (*domain.MessageThread, error) {
	if err := s.AssertParticipant(ctx, actorUserID, threadID); err != nil {
		return nil, err
	}
	if err := s.threadRepo.SetMuted(ctx, threadID, actorUserID, muted); err != nil {
		return nil, err
	}
	return s.threadRepo.GetThread(ctx, threadID)
}

// MarkRead updates the actor's read receipt position in the thread.
func (s *MessagingServiceImpl) MarkRead(ctx context.Context, actorUserID, threadID int, seq int64) (*domain.MessageThread, error) {
	if err := s.AssertParticipant(ctx, actorUserID, threadID); err != nil {
		return nil, err
	}
	// Clamp to the thread's highest seq: an arbitrary client-supplied value
	// would otherwise pin last_read_seq past the end of the thread and poison
	// every derived read receipt and unread count.
	maxSeq, err := s.msgRepo.MaxSeq(ctx, threadID)
	if err != nil {
		return nil, err
	}
	if seq > maxSeq {
		seq = maxSeq
	}
	if err := s.threadRepo.SetLastRead(ctx, threadID, actorUserID, seq); err != nil {
		return nil, err
	}
	_ = s.publisher.PublishEphemeral(ctx, domain.EventEnvelope{
		Type:        "READ_RECEIPT_CHANGED",
		ThreadID:    threadID,
		UserID:      actorUserID,
		LastReadSeq: seq,
	})
	return s.threadRepo.GetThread(ctx, threadID)
}

// SetTyping broadcasts the actor's typing status to the thread.
func (s *MessagingServiceImpl) SetTyping(ctx context.Context, actorUserID, threadID int, typing bool) error {
	if err := s.AssertParticipant(ctx, actorUserID, threadID); err != nil {
		return err
	}
	return s.publisher.PublishEphemeral(ctx, domain.EventEnvelope{
		Type:     "TYPING_CHANGED",
		ThreadID: threadID,
		UserID:   actorUserID,
		Typing:   typing,
	})
}

// CreateThread creates a new message thread with the actor as the owner.
func (s *MessagingServiceImpl) CreateThread(ctx context.Context, actorUserID int, participantUserIDs []int, title *string) (*domain.MessageThread, error) {
	set := map[int]struct{}{actorUserID: {}}
	for _, id := range participantUserIDs {
		set[id] = struct{}{}
	}
	ids := make([]int, 0, len(set))
	for id := range set {
		ids = append(ids, id)
	}
	if len(ids) < 2 {
		return nil, fmt.Errorf("%w: a thread needs at least two participants", domain.ErrInvalidInput)
	}
	if len(ids) == 2 && title == nil {
		other := ids[0]
		if other == actorUserID {
			other = ids[1]
		}
		existing, err := s.threadRepo.FindDirectThread(ctx, actorUserID, other)
		if err == nil {
			return existing, nil
		}
		if !errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("find direct thread: %w", err)
		}
		// fall through to create
	}
	return s.threadRepo.CreateThread(ctx, actorUserID, title, ids)
}

// AddParticipants adds new users to an existing thread.
func (s *MessagingServiceImpl) AddParticipants(ctx context.Context, actorUserID, threadID int, userIDs []int) (*domain.MessageThread, error) {
	if err := s.AssertParticipant(ctx, actorUserID, threadID); err != nil {
		return nil, err
	}
	if err := s.threadRepo.AddParticipants(ctx, threadID, userIDs); err != nil {
		return nil, err
	}
	for _, uid := range userIDs {
		_ = s.publisher.PublishEphemeral(ctx, domain.EventEnvelope{
			Type:     "PARTICIPANT_CHANGED",
			ThreadID: threadID,
			UserID:   uid,
			Change:   "ADDED",
		})
	}
	return s.threadRepo.GetThread(ctx, threadID)
}

// LeaveThread marks the actor as having left the thread.
func (s *MessagingServiceImpl) LeaveThread(ctx context.Context, actorUserID, threadID int) error {
	if err := s.AssertParticipant(ctx, actorUserID, threadID); err != nil {
		return err
	}
	if err := s.threadRepo.SetLeft(ctx, threadID, actorUserID, time.Now()); err != nil {
		return err
	}
	return s.publisher.PublishEphemeral(ctx, domain.EventEnvelope{
		Type:     "PARTICIPANT_CHANGED",
		ThreadID: threadID,
		UserID:   actorUserID,
		Change:   "REMOVED",
	})
}

// ListThreads returns the actor's threads, paginated by last message timestamp.
func (s *MessagingServiceImpl) ListThreads(ctx context.Context, actorUserID int, limit int, beforeLastMessageAt *time.Time) ([]domain.MessageThread, error) {
	return s.threadRepo.ListThreadsForUser(ctx, actorUserID, limit, beforeLastMessageAt)
}

// GetHistory returns past messages from the thread, paginated by message sequence.
func (s *MessagingServiceImpl) GetHistory(ctx context.Context, actorUserID, threadID int, limit int, beforeSeq *int64) ([]domain.Message, error) {
	if err := s.AssertParticipant(ctx, actorUserID, threadID); err != nil {
		return nil, err
	}
	return s.msgRepo.ListHistory(ctx, threadID, limit, beforeSeq)
}

// ListSince returns messages since a given sequence number.
func (s *MessagingServiceImpl) ListSince(ctx context.Context, actorUserID, threadID int, sinceSeq int64) ([]domain.Message, error) {
	if err := s.AssertParticipant(ctx, actorUserID, threadID); err != nil {
		return nil, err
	}
	return s.msgRepo.ListSince(ctx, threadID, sinceSeq)
}

// GetThread returns the thread, including its participants.
func (s *MessagingServiceImpl) GetThread(ctx context.Context, actorUserID, threadID int) (*domain.MessageThread, error) {
	if err := s.AssertParticipant(ctx, actorUserID, threadID); err != nil {
		return nil, err
	}
	return s.threadRepo.GetThread(ctx, threadID)
}

// MaxSeq returns the highest message sequence number in the thread.
func (s *MessagingServiceImpl) MaxSeq(ctx context.Context, actorUserID, threadID int) (int64, error) {
	if err := s.AssertParticipant(ctx, actorUserID, threadID); err != nil {
		return 0, err
	}
	return s.msgRepo.MaxSeq(ctx, threadID)
}

// ThreadMaxSeq returns the highest message sequence number in the thread
// WITHOUT re-checking participation. It is the trusted variant used by GraphQL
// field resolvers on a thread the query has already authorized; callers that
// have not authorized the thread must use MaxSeq.
func (s *MessagingServiceImpl) ThreadMaxSeq(ctx context.Context, threadID int) (int64, error) {
	return s.msgRepo.MaxSeq(ctx, threadID)
}

// UnreadCount returns the number of messages in the thread newer than sinceSeq,
// WITHOUT re-checking participation — same trusted-caller contract as
// ThreadMaxSeq. Counting rows keeps the number right even when pruning has left
// gaps in the sequence.
func (s *MessagingServiceImpl) UnreadCount(ctx context.Context, threadID int, sinceSeq int64) (int, error) {
	return s.msgRepo.CountSince(ctx, threadID, sinceSeq)
}
