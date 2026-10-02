package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// GormMessageRepository implements the MessageRepository port using GORM.
type GormMessageRepository struct {
	db *gorm.DB
}

// Compile-time interface check
var _ repositories.MessageRepository = (*GormMessageRepository)(nil)

// NewGormMessageRepository creates a new GORM-backed message repository.
func NewGormMessageRepository(db *gorm.DB) *GormMessageRepository {
	return &GormMessageRepository{db: db}
}

// Insert persists a new message. The trg_assign_message_seq trigger assigns the
// per-thread seq and the DB assigns created_at; RETURNING * hands both back
// without a re-read. Insertion is idempotent on (thread_id, sender_id,
// client_nonce): a conflicting insert is a no-op and the pre-existing row is
// returned unchanged, so a client retrying a send never creates a duplicate.
func (r *GormMessageRepository) Insert(ctx context.Context, m *domain.Message) (*domain.Message, error) {
	model := messageDomainToModel(m)

	res := r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{
				{Name: "thread_id"},
				{Name: "sender_id"},
				{Name: "client_nonce"},
			},
			DoNothing: true,
		}, clause.Returning{}).
		Create(model)
	if res.Error != nil {
		return nil, fmt.Errorf("failed to insert message: %w", res.Error)
	}

	if res.RowsAffected == 0 {
		// Conflict: nothing inserted. Return the row that already exists.
		var stored MessageModel
		if err := r.db.WithContext(ctx).
			Where("thread_id = ? AND sender_id = ? AND client_nonce = ?", model.ThreadID, model.SenderID, model.ClientNonce).
			First(&stored).Error; err != nil {
			return nil, fmt.Errorf("failed to load existing message after nonce conflict: %w", err)
		}
		msg := messageModelToDomain(&stored)
		return &msg, nil
	}

	msg := messageModelToDomain(model)
	return &msg, nil
}

// GetByID loads a single message. A missing row is reported as domain.ErrNotFound.
func (r *GormMessageRepository) GetByID(ctx context.Context, id int64) (*domain.Message, error) {
	var model MessageModel
	if err := r.db.WithContext(ctx).First(&model, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("failed to get message: %w", err)
	}
	msg := messageModelToDomain(&model)
	return &msg, nil
}

// ListHistory returns messages for a thread newest-first, for backward paging.
// When beforeSeq is set only messages strictly older than it are returned.
func (r *GormMessageRepository) ListHistory(ctx context.Context, threadID int, limit int, beforeSeq *int64) ([]domain.Message, error) {
	q := r.db.WithContext(ctx).Where("thread_id = ?", threadID)
	if beforeSeq != nil {
		q = q.Where("seq < ?", *beforeSeq)
	}
	q = q.Order("seq DESC")
	if limit > 0 {
		q = q.Limit(limit)
	}

	var rows []MessageModel
	if err := q.Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("failed to list message history: %w", err)
	}
	return messageModelsToDomain(rows), nil
}

// ListSince returns messages for a thread with seq strictly greater than
// sinceSeq, ordered ascending — the forward replay path.
func (r *GormMessageRepository) ListSince(ctx context.Context, threadID int, sinceSeq int64) ([]domain.Message, error) {
	var rows []MessageModel
	if err := r.db.WithContext(ctx).
		Where("thread_id = ? AND seq > ?", threadID, sinceSeq).
		Order("seq ASC").
		Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("failed to list messages since seq: %w", err)
	}
	return messageModelsToDomain(rows), nil
}

// MaxSeq returns the highest seq in a thread, or 0 for an empty thread.
func (r *GormMessageRepository) MaxSeq(ctx context.Context, threadID int) (int64, error) {
	var n int64
	if err := r.db.WithContext(ctx).
		Model(&MessageModel{}).
		Where("thread_id = ?", threadID).
		Select("COALESCE(MAX(seq), 0)").
		Scan(&n).Error; err != nil {
		return 0, fmt.Errorf("failed to get max seq: %w", err)
	}
	return n, nil
}

// CountSince returns the number of messages in a thread newer than sinceSeq.
// It counts rows rather than subtracting sequence numbers so pruned gaps do not
// inflate the result.
func (r *GormMessageRepository) CountSince(ctx context.Context, threadID int, sinceSeq int64) (int, error) {
	var n int64
	if err := r.db.WithContext(ctx).
		Model(&MessageModel{}).
		Where("thread_id = ? AND seq > ?", threadID, sinceSeq).
		Count(&n).Error; err != nil {
		return 0, fmt.Errorf("failed to count messages since seq: %w", err)
	}
	return int(n), nil
}

// ThreadStats computes latestSeq and the viewer's unread count for many
// threads in one round trip. Each correlated subquery is an index range scan on
// (thread_id, seq), same as the per-thread MaxSeq / CountSince it replaces.
func (r *GormMessageRepository) ThreadStats(ctx context.Context, viewerUserID int, threadIDs []int) (map[int]domain.ThreadStats, error) {
	out := make(map[int]domain.ThreadStats, len(threadIDs))
	if len(threadIDs) == 0 {
		return out, nil
	}
	var rows []struct {
		ThreadID  int
		LatestSeq int64
		Unread    int
	}
	if err := r.db.WithContext(ctx).Raw(`
		SELECT tp.thread_id,
		       (SELECT COALESCE(MAX(m.seq), 0) FROM messages m WHERE m.thread_id = tp.thread_id) AS latest_seq,
		       (SELECT COUNT(*) FROM messages m WHERE m.thread_id = tp.thread_id AND m.seq > tp.last_read_seq) AS unread
		FROM thread_participants tp
		WHERE tp.user_id = ? AND tp.thread_id = ANY(CAST(? AS bigint[]))`, viewerUserID, intsToArray(threadIDs)).
		Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("failed to load thread stats: %w", err)
	}
	for _, row := range rows {
		out[row.ThreadID] = domain.ThreadStats{LatestSeq: row.LatestSeq, Unread: row.Unread}
	}
	return out, nil
}

// UpdateBody rewrites a message body and stamps edited_at in one round trip,
// scoped to the sender and to live (not deleted) messages. RETURNING * carries
// the unchanged seq and created_at back. No matching row is ErrNotFound.
func (r *GormMessageRepository) UpdateBody(ctx context.Context, messageID int64, senderID int, body string, editedAt time.Time) (*domain.Message, error) {
	return r.updateOwn(ctx, messageID, senderID, map[string]any{"body": body, "edited_at": editedAt}, "update message body")
}

// SoftDelete tombstones a message: deleted_at is set and the body blanked while
// the row and its seq stay in place so history replay is unaffected. Scoped to
// the sender and to not-yet-deleted messages; no matching row is ErrNotFound.
func (r *GormMessageRepository) SoftDelete(ctx context.Context, messageID int64, senderID int, deletedAt time.Time) (*domain.Message, error) {
	return r.updateOwn(ctx, messageID, senderID, map[string]any{"deleted_at": deletedAt, "body": ""}, "soft-delete message")
}

func (r *GormMessageRepository) updateOwn(ctx context.Context, messageID int64, senderID int, set map[string]any, action string) (*domain.Message, error) {
	var updated MessageModel
	res := r.db.WithContext(ctx).Model(&updated).
		Clauses(clause.Returning{}).
		Where("id = ? AND sender_id = ? AND deleted_at IS NULL", messageID, senderID).
		Updates(set)
	if res.Error != nil {
		return nil, fmt.Errorf("failed to %s: %w", action, res.Error)
	}
	if res.RowsAffected == 0 {
		return nil, domain.ErrNotFound
	}
	msg := messageModelToDomain(&updated)
	return &msg, nil
}

func messageModelsToDomain(rows []MessageModel) []domain.Message {
	out := make([]domain.Message, len(rows))
	for i := range rows {
		out[i] = messageModelToDomain(&rows[i])
	}
	return out
}
