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
// per-thread seq and the DB assigns created_at, so neither is set on the insert.
// Insertion is idempotent on (thread_id, sender_id, client_nonce): a conflicting
// insert is a no-op and the pre-existing row is returned unchanged, so a client
// retrying a send never creates a duplicate.
func (r *GormMessageRepository) Insert(ctx context.Context, m *domain.Message) (*domain.Message, error) {
	model := messageDomainToModel(m)

	if err := r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{
				{Name: "thread_id"},
				{Name: "sender_id"},
				{Name: "client_nonce"},
			},
			DoNothing: true,
		}).
		Create(model).Error; err != nil {
		return nil, fmt.Errorf("failed to insert message: %w", err)
	}

	var stored MessageModel
	if model.ID == 0 {
		// Conflict: nothing inserted. Return the row that already exists.
		if err := r.db.WithContext(ctx).
			Where("thread_id = ? AND sender_id = ? AND client_nonce = ?", model.ThreadID, model.SenderID, model.ClientNonce).
			First(&stored).Error; err != nil {
			return nil, fmt.Errorf("failed to load existing message after nonce conflict: %w", err)
		}
	} else {
		// Reload to pick up the trigger-assigned seq and DB created_at.
		if err := r.db.WithContext(ctx).First(&stored, model.ID).Error; err != nil {
			return nil, fmt.Errorf("failed to reload inserted message: %w", err)
		}
	}

	msg := messageModelToDomain(&stored)
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

// UpdateBody rewrites a message body and stamps edited_at. The row is reloaded
// via GetByID so the returned message carries the trigger-assigned seq and the
// DB created_at unchanged. A missing id is reported as domain.ErrNotFound.
func (r *GormMessageRepository) UpdateBody(ctx context.Context, messageID int64, body string, editedAt time.Time) (*domain.Message, error) {
	res := r.db.WithContext(ctx).Model(&MessageModel{}).
		Where("id = ?", messageID).
		Updates(map[string]any{"body": body, "edited_at": editedAt})
	if res.Error != nil {
		return nil, fmt.Errorf("failed to update message body: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return nil, domain.ErrNotFound
	}
	return r.GetByID(ctx, messageID)
}

// SoftDelete tombstones a message: deleted_at is set and the body blanked while
// the row and its seq stay in place so history replay is unaffected. The
// reloaded row is returned. A missing id is reported as domain.ErrNotFound.
func (r *GormMessageRepository) SoftDelete(ctx context.Context, messageID int64, deletedAt time.Time) (*domain.Message, error) {
	res := r.db.WithContext(ctx).Model(&MessageModel{}).
		Where("id = ?", messageID).
		Updates(map[string]any{"deleted_at": deletedAt, "body": ""})
	if res.Error != nil {
		return nil, fmt.Errorf("failed to soft-delete message: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return nil, domain.ErrNotFound
	}
	return r.GetByID(ctx, messageID)
}

func messageModelsToDomain(rows []MessageModel) []domain.Message {
	out := make([]domain.Message, len(rows))
	for i := range rows {
		out[i] = messageModelToDomain(&rows[i])
	}
	return out
}
