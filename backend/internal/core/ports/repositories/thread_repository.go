package repositories

import (
	"context"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// ThreadRepository is the port for message thread storage operations.
type ThreadRepository interface {
	CreateThread(ctx context.Context, createdBy int, title *string, participantUserIDs []int) (*domain.MessageThread, error)
	GetThread(ctx context.Context, threadID int) (*domain.MessageThread, error)
	FindDirectThread(ctx context.Context, userA, userB int) (*domain.MessageThread, error)
	ListThreadsForUser(ctx context.Context, userID int, limit int, beforeLastMessageAt *time.Time) ([]domain.MessageThread, error)
	AddParticipants(ctx context.Context, threadID int, userIDs []int) error
	SetLeft(ctx context.Context, threadID, userID int, at time.Time) error
	SetLastRead(ctx context.Context, threadID, userID int, seq int64) error
	// SetMuted toggles a participant's muted flag. No matching participant row is
	// reported as domain.ErrNotFound.
	SetMuted(ctx context.Context, threadID, userID int, muted bool) error
}
