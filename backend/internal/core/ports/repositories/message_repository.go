package repositories

import (
	"context"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// MessageRepository is the port for message storage operations.
type MessageRepository interface {
	Insert(ctx context.Context, m *domain.Message) (*domain.Message, error)
	GetByID(ctx context.Context, id int64) (*domain.Message, error)
	ListHistory(ctx context.Context, threadID int, limit int, beforeSeq *int64) ([]domain.Message, error)
	ListSince(ctx context.Context, threadID int, sinceSeq int64) ([]domain.Message, error)
	MaxSeq(ctx context.Context, threadID int) (int64, error)
	// CountSince returns how many messages in the thread have seq strictly
	// greater than sinceSeq. Counting rows (rather than subtracting seqs) stays
	// correct when pruning has left gaps in the sequence.
	CountSince(ctx context.Context, threadID int, sinceSeq int64) (int, error)
	// UpdateBody rewrites a message body and stamps edited_at, returning the
	// reloaded row. A missing id is reported as domain.ErrNotFound.
	UpdateBody(ctx context.Context, messageID int64, body string, editedAt time.Time) (*domain.Message, error)
	// SoftDelete tombstones a message: it sets deleted_at and blanks the body
	// while keeping the row (and its seq) in place, returning the reloaded row.
	// A missing id is reported as domain.ErrNotFound.
	SoftDelete(ctx context.Context, messageID int64, deletedAt time.Time) (*domain.Message, error)
}
