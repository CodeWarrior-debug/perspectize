package services

import (
	"context"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// EventPublisher is the port the MessagingService uses to emit ephemeral
// realtime events (typing, read receipts, participant changes). The realtime
// Hub (Task 9) implements it. MESSAGE_POSTED is NOT published here — it
// originates from the database trigger.
type EventPublisher interface {
	PublishEphemeral(ctx context.Context, env domain.EventEnvelope) error
}

// SendMessageInput is the payload for MessagingService.SendMessage.
type SendMessageInput struct {
	ThreadID    int
	Body        string
	ClientNonce string
}

// MessagingService is the business-logic port for the messaging feature:
// authorization, rate limiting, idempotent send, 1:1 thread dedup,
// read-pointer updates, and ephemeral event publishing.
type MessagingService interface {
	CreateThread(ctx context.Context, actorUserID int, participantUserIDs []int, title *string) (*domain.MessageThread, error)
	SendMessage(ctx context.Context, actorUserID int, in SendMessageInput) (*domain.Message, error)
	// EditMessage updates the body of a message the actor sent. Rejects a
	// missing message (ErrNotFound), a non-sender actor (ErrForbidden), and an
	// empty / oversize body or an already-deleted message (ErrInvalidInput).
	// Publishes MESSAGE_EDITED on success.
	EditMessage(ctx context.Context, actorUserID int, messageID int64, body string) (*domain.Message, error)
	// DeleteMessage soft-deletes a message the actor sent. Same not-found /
	// forbidden rules as EditMessage. Idempotent: a message already deleted is
	// returned unchanged with no publish. Publishes MESSAGE_DELETED on a real
	// delete.
	DeleteMessage(ctx context.Context, actorUserID int, messageID int64) (*domain.Message, error)
	// MuteThread sets the actor's muted flag for a thread they participate in
	// and returns the refreshed thread.
	MuteThread(ctx context.Context, actorUserID, threadID int, muted bool) (*domain.MessageThread, error)
	MarkRead(ctx context.Context, actorUserID, threadID int, seq int64) (*domain.MessageThread, error)
	AddParticipants(ctx context.Context, actorUserID, threadID int, userIDs []int) (*domain.MessageThread, error)
	LeaveThread(ctx context.Context, actorUserID, threadID int) error
	ListThreads(ctx context.Context, actorUserID int, limit int, beforeLastMessageAt *time.Time) ([]domain.MessageThread, error)
	GetHistory(ctx context.Context, actorUserID, threadID int, limit int, beforeSeq *int64) ([]domain.Message, error)
	ListSince(ctx context.Context, actorUserID, threadID int, sinceSeq int64) ([]domain.Message, error)
	SetTyping(ctx context.Context, actorUserID, threadID int, typing bool) error
	AssertParticipant(ctx context.Context, actorUserID, threadID int) error
	// GetThread returns a single thread the actor participates in. Enforces
	// participation first. Needed by the T11 messageThread query resolver.
	GetThread(ctx context.Context, actorUserID, threadID int) (*domain.MessageThread, error)
	// MaxSeq returns the highest message seq in the thread. Enforces
	// participation first. Needed by T11 GraphQL field resolvers.
	MaxSeq(ctx context.Context, actorUserID, threadID int) (int64, error)
	// ThreadMaxSeq is the trusted-post-authorization variant of MaxSeq: it does
	// NOT re-check participation and must only be called for a thread the
	// caller already authorized (e.g. a field resolver on a thread returned by
	// messageThreads / messageThread). Skipping the re-check is what keeps a
	// thread-list page from issuing a participant lookup per field.
	ThreadMaxSeq(ctx context.Context, threadID int) (int64, error)
	// UnreadCount returns how many messages in the thread are newer than
	// sinceSeq. Like ThreadMaxSeq it performs no authorization and is only for
	// already-authorized threads.
	UnreadCount(ctx context.Context, threadID int, sinceSeq int64) (int, error)
}
