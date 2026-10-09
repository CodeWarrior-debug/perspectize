package repositories

import (
	"context"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// MessageThreadRepository is the port for message thread storage operations.
type MessageThreadRepository interface {
	CreateThread(ctx context.Context, createdBy int, title *string, participantUserIDs []int) (*domain.MessageThread, error)
	GetThread(ctx context.Context, threadID int) (*domain.MessageThread, error)
	FindDirectThread(ctx context.Context, userA, userB int) (*domain.MessageThread, error)
	ListThreadsForUser(ctx context.Context, userID int, limit int, beforeLastMessageAt *time.Time) ([]domain.MessageThread, error)
	// AddParticipants adds the users (reactivating any who had left) and
	// returns their participant rows as stored.
	AddParticipants(ctx context.Context, threadID int, userIDs []int) ([]domain.ThreadParticipant, error)
	SetLeft(ctx context.Context, threadID, userID int, at time.Time) error
	// SetLastRead advances a participant's read pointer to seq, clamped to the
	// thread's highest message seq, and returns the clamped value. Forward-only:
	// a lower or equal value leaves the pointer alone (the clamped value is
	// still returned).
	SetLastRead(ctx context.Context, threadID, userID int, seq int64) (int64, error)
	// SetMuted toggles a participant's muted flag. No matching participant row is
	// reported as domain.ErrNotFound.
	SetMuted(ctx context.Context, threadID, userID int, muted bool) error
}
