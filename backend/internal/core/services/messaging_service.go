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
	threadRepo repositories.MessageThreadRepository
	msgRepo    repositories.MessageRepository
	publisher  portservices.EventPublisher
	limiter    *SlidingWindowLimiter
}

var _ portservices.MessagingService = (*MessagingServiceImpl)(nil)

// NewMessagingService constructs the messaging business-logic service.
func NewMessagingService(
	threadRepo repositories.MessageThreadRepository,
	msgRepo repositories.MessageRepository,
	publisher portservices.EventPublisher,
	limiter *SlidingWindowLimiter,
) *MessagingServiceImpl {
	return &MessagingServiceImpl{threadRepo, msgRepo, publisher, limiter}
}

// AssertParticipant verifies that the actor is an active participant in the thread.
func (s *MessagingServiceImpl) AssertParticipant(ctx context.Context, actorUserID, threadID int) error {
	_, err := s.participantThread(ctx, actorUserID, threadID)
	return err
}

// participantThread loads the thread (one query, participants included) and
// verifies the actor is an active participant, returning the loaded thread so
// callers don't read it again.
func (s *MessagingServiceImpl) participantThread(ctx context.Context, actorUserID, threadID int) (*domain.MessageThread, error) {
	thread, err := s.threadRepo.GetThread(ctx, threadID)
	if err != nil {
		return nil, err
	}
	if thread == nil {
		// A repository that reports "missing" as (nil, nil) must not reach
		// IsActiveParticipant — that is a value receiver and would panic.
		return nil, fmt.Errorf("%w: thread %d", domain.ErrNotFound, threadID)
	}
	if !thread.IsActiveParticipant(actorUserID) {
		return nil, fmt.Errorf("%w: not a participant of thread %d", domain.ErrForbidden, threadID)
	}
	return thread, nil
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

// EditMessage updates the body of a message the actor sent. The sender and
// not-deleted checks are part of the UPDATE, so the happy path is one round
// trip; only a miss reads the message, to say why.
func (s *MessagingServiceImpl) EditMessage(ctx context.Context, actorUserID int, messageID int64, body string) (*domain.Message, error) {
	if len(body) == 0 || len([]byte(body)) > maxMessageBodyBytes {
		return nil, fmt.Errorf("%w: message body must be 1..%d bytes", domain.ErrInvalidInput, maxMessageBodyBytes)
	}
	updated, err := s.msgRepo.UpdateBody(ctx, messageID, actorUserID, body, time.Now().UTC())
	if errors.Is(err, domain.ErrNotFound) {
		msg, why := s.explainOwnMessageMiss(ctx, actorUserID, messageID, "edit")
		if why != nil {
			return nil, why
		}
		return nil, fmt.Errorf("%w: message %d is deleted", domain.ErrInvalidInput, msg.ID)
	}
	if err != nil {
		return nil, err
	}
	_ = s.publisher.PublishEphemeral(ctx, domain.EventEnvelope{
		Type:      "MESSAGE_EDITED",
		ThreadID:  updated.ThreadID,
		Seq:       updated.Seq,
		MessageID: messageID,
	})
	return updated, nil
}

// DeleteMessage soft-deletes a message the actor sent. Idempotent when the
// message is already deleted (returned as is, nothing published).
func (s *MessagingServiceImpl) DeleteMessage(ctx context.Context, actorUserID int, messageID int64) (*domain.Message, error) {
	tombstoned, err := s.msgRepo.SoftDelete(ctx, messageID, actorUserID, time.Now().UTC())
	if errors.Is(err, domain.ErrNotFound) {
		msg, why := s.explainOwnMessageMiss(ctx, actorUserID, messageID, "delete")
		if why != nil {
			return nil, why
		}
		return msg, nil // already deleted
	}
	if err != nil {
		return nil, err
	}
	_ = s.publisher.PublishEphemeral(ctx, domain.EventEnvelope{
		Type:      "MESSAGE_DELETED",
		ThreadID:  tombstoned.ThreadID,
		Seq:       tombstoned.Seq,
		MessageID: messageID,
	})
	return tombstoned, nil
}

// explainOwnMessageMiss runs after a sender-scoped message UPDATE matched no
// row. It returns an error when the message is missing or not the actor's;
// otherwise the message exists, is the actor's and is already deleted, and it
// is returned for the caller to handle.
func (s *MessagingServiceImpl) explainOwnMessageMiss(ctx context.Context, actorUserID int, messageID int64, verb string) (*domain.Message, error) {
	msg, err := s.msgRepo.GetByID(ctx, messageID)
	if err != nil {
		return nil, err
	}
	if msg.SenderID != actorUserID {
		return nil, fmt.Errorf("%w: only the sender may %s message %d", domain.ErrForbidden, verb, messageID)
	}
	return msg, nil
}

// MuteThread sets the actor's muted flag for a thread they participate in and
// returns the thread with that flag applied (no re-read: the write changes
// nothing else).
func (s *MessagingServiceImpl) MuteThread(ctx context.Context, actorUserID, threadID int, muted bool) (*domain.MessageThread, error) {
	thread, err := s.participantThread(ctx, actorUserID, threadID)
	if err != nil {
		return nil, err
	}
	if err := s.threadRepo.SetMuted(ctx, threadID, actorUserID, muted); err != nil {
		return nil, err
	}
	for i := range thread.Participants {
		if thread.Participants[i].UserID == actorUserID {
			thread.Participants[i].Muted = muted
		}
	}
	return thread, nil
}

// MarkRead updates the actor's read receipt position in the thread. The seq
// is clamped to the thread's highest message by the repository, in the same
// statement as the update, and the thread loaded for the participation check
// is returned with the new pointer applied (no re-read).
func (s *MessagingServiceImpl) MarkRead(ctx context.Context, actorUserID, threadID int, seq int64) (*domain.MessageThread, error) {
	thread, err := s.participantThread(ctx, actorUserID, threadID)
	if err != nil {
		return nil, err
	}
	seq, err = s.threadRepo.SetLastRead(ctx, threadID, actorUserID, seq)
	if err != nil {
		return nil, err
	}
	_ = s.publisher.PublishEphemeral(ctx, domain.EventEnvelope{
		Type:        "READ_RECEIPT_CHANGED",
		ThreadID:    threadID,
		UserID:      actorUserID,
		LastReadSeq: seq,
	})
	for i := range thread.Participants {
		p := &thread.Participants[i]
		if p.UserID == actorUserID && seq > p.LastReadSeq {
			p.LastReadSeq = seq // forward-only, like the UPDATE
		}
	}
	return thread, nil
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

// AddParticipants adds new users to an existing thread and returns it with
// them: the upserted rows are merged into the thread loaded for the
// participation check (no reload), and the ADDED events go out in one batch.
func (s *MessagingServiceImpl) AddParticipants(ctx context.Context, actorUserID, threadID int, userIDs []int) (*domain.MessageThread, error) {
	thread, err := s.participantThread(ctx, actorUserID, threadID)
	if err != nil {
		return nil, err
	}
	added, err := s.threadRepo.AddParticipants(ctx, threadID, userIDs)
	if err != nil {
		return nil, err
	}
	envs := make([]domain.EventEnvelope, len(userIDs))
	for i, uid := range userIDs {
		envs[i] = domain.EventEnvelope{
			Type:     "PARTICIPANT_CHANGED",
			ThreadID: threadID,
			UserID:   uid,
			Change:   "ADDED",
		}
	}
	_ = s.publisher.PublishEphemeral(ctx, envs...)

	byUser := make(map[int]int, len(thread.Participants))
	for i, p := range thread.Participants {
		byUser[p.UserID] = i
	}
	for _, p := range added {
		if i, ok := byUser[p.UserID]; ok {
			thread.Participants[i] = p
		} else {
			thread.Participants = append(thread.Participants, p)
		}
	}
	return thread, nil
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

// GetThread returns the thread, including its participants. The load that
// checks participation is the result.
func (s *MessagingServiceImpl) GetThread(ctx context.Context, actorUserID, threadID int) (*domain.MessageThread, error) {
	return s.participantThread(ctx, actorUserID, threadID)
}

// MaxSeq returns the highest message sequence number in the thread.
func (s *MessagingServiceImpl) MaxSeq(ctx context.Context, actorUserID, threadID int) (int64, error) {
	if err := s.AssertParticipant(ctx, actorUserID, threadID); err != nil {
		return 0, err
	}
	return s.msgRepo.MaxSeq(ctx, threadID)
}

// ThreadStats returns latestSeq and the viewer's unread count per thread
// WITHOUT re-checking participation — only for already-authorized threads (see
// the port). Counting rows keeps unread right even when pruning left gaps.
func (s *MessagingServiceImpl) ThreadStats(ctx context.Context, viewerUserID int, threadIDs []int) (map[int]domain.ThreadStats, error) {
	return s.msgRepo.ThreadStats(ctx, viewerUserID, threadIDs)
}
