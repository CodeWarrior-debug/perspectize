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

// GormThreadRepository implements the ThreadRepository port using GORM.
type GormThreadRepository struct {
	db *gorm.DB
}

// Compile-time interface check
var _ repositories.ThreadRepository = (*GormThreadRepository)(nil)

// NewGormThreadRepository creates a new GORM-backed thread repository.
func NewGormThreadRepository(db *gorm.DB) *GormThreadRepository {
	return &GormThreadRepository{db: db}
}

// CreateThread inserts a thread row plus its participant rows in a single
// transaction. The creator is given the OWNER role, every other participant
// MEMBER. The trg_init_thread_sequence trigger creates the thread_sequences row
// automatically on thread insert. The thread is reloaded with participants
// before being returned.
func (r *GormThreadRepository) CreateThread(ctx context.Context, createdBy int, title *string, participantUserIDs []int) (*domain.MessageThread, error) {
	var threadID int64

	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		thread := &MessageThreadModel{
			Title:         title,
			CreatedBy:     int64(createdBy),
			LastMessageAt: time.Now(),
		}
		if err := tx.Create(thread).Error; err != nil {
			return fmt.Errorf("failed to create thread: %w", err)
		}
		threadID = thread.ID

		seen := make(map[int]bool, len(participantUserIDs))
		parts := make([]ThreadParticipantModel, 0, len(participantUserIDs))
		for _, uid := range participantUserIDs {
			if seen[uid] {
				continue
			}
			seen[uid] = true

			role := string(domain.ThreadRoleMember)
			if uid == createdBy {
				role = string(domain.ThreadRoleOwner)
			}
			parts = append(parts, ThreadParticipantModel{
				ThreadID: thread.ID,
				UserID:   int64(uid),
				Role:     role,
			})
		}
		if len(parts) > 0 {
			if err := tx.Create(&parts).Error; err != nil {
				return fmt.Errorf("failed to create thread participants: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	return r.GetThread(ctx, int(threadID))
}

// GetThread loads a thread and its participants. A missing thread is reported as
// domain.ErrNotFound.
func (r *GormThreadRepository) GetThread(ctx context.Context, threadID int) (*domain.MessageThread, error) {
	var model MessageThreadModel
	if err := r.db.WithContext(ctx).First(&model, threadID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("failed to get thread: %w", err)
	}

	var parts []ThreadParticipantModel
	if err := r.db.WithContext(ctx).Where("thread_id = ?", threadID).Find(&parts).Error; err != nil {
		return nil, fmt.Errorf("failed to load thread participants: %w", err)
	}

	thread := messageThreadModelToDomain(&model, parts)
	return &thread, nil
}

// FindDirectThread returns the 1:1 thread whose only two active participants are
// userA and userB. No such thread yields domain.ErrNotFound.
func (r *GormThreadRepository) FindDirectThread(ctx context.Context, userA, userB int) (*domain.MessageThread, error) {
	var threadID int64
	err := r.db.WithContext(ctx).
		Table("thread_participants tp").
		Select("tp.thread_id").
		Where("tp.left_at IS NULL").
		Group("tp.thread_id").
		Having("COUNT(*) = 2 AND COUNT(*) FILTER (WHERE tp.user_id IN (?, ?)) = 2", userA, userB).
		Limit(1).
		Scan(&threadID).Error
	if err != nil {
		return nil, fmt.Errorf("failed to find direct thread: %w", err)
	}
	if threadID == 0 {
		return nil, domain.ErrNotFound
	}

	return r.GetThread(ctx, int(threadID))
}

// ListThreadsForUser returns the user's active threads ordered by most recent
// activity. When beforeLastMessageAt is set, only threads strictly older than it
// are returned (keyset pagination).
func (r *GormThreadRepository) ListThreadsForUser(ctx context.Context, userID int, limit int, beforeLastMessageAt *time.Time) ([]domain.MessageThread, error) {
	q := r.db.WithContext(ctx).
		Table("message_threads mt").
		Joins("JOIN thread_participants tp ON tp.thread_id = mt.id").
		Where("tp.user_id = ? AND tp.left_at IS NULL", userID)
	if beforeLastMessageAt != nil {
		q = q.Where("mt.last_message_at < ?", *beforeLastMessageAt)
	}
	q = q.Order("mt.last_message_at DESC")
	if limit > 0 {
		q = q.Limit(limit)
	}

	var models []MessageThreadModel
	if err := q.Select("mt.*").Scan(&models).Error; err != nil {
		return nil, fmt.Errorf("failed to list threads for user: %w", err)
	}
	if len(models) == 0 {
		return []domain.MessageThread{}, nil
	}

	ids := make([]int64, len(models))
	for i := range models {
		ids[i] = models[i].ID
	}

	var parts []ThreadParticipantModel
	if err := r.db.WithContext(ctx).Where("thread_id IN ?", ids).Find(&parts).Error; err != nil {
		return nil, fmt.Errorf("failed to load thread participants: %w", err)
	}
	partsByThread := make(map[int64][]ThreadParticipantModel, len(models))
	for _, p := range parts {
		partsByThread[p.ThreadID] = append(partsByThread[p.ThreadID], p)
	}

	threads := make([]domain.MessageThread, len(models))
	for i := range models {
		threads[i] = messageThreadModelToDomain(&models[i], partsByThread[models[i].ID])
	}
	return threads, nil
}

// AddParticipants inserts participant rows (ignoring rows that already exist)
// and clears left_at for any of the given users who had previously left, so a
// rejoining user becomes active again.
func (r *GormThreadRepository) AddParticipants(ctx context.Context, threadID int, userIDs []int) error {
	if len(userIDs) == 0 {
		return nil
	}

	rows := make([]ThreadParticipantModel, 0, len(userIDs))
	for _, uid := range userIDs {
		rows = append(rows, ThreadParticipantModel{
			ThreadID: int64(threadID),
			UserID:   int64(uid),
			Role:     string(domain.ThreadRoleMember),
		})
	}

	if err := r.db.WithContext(ctx).
		Clauses(clause.OnConflict{DoNothing: true}).
		Create(&rows).Error; err != nil {
		return fmt.Errorf("failed to add thread participants: %w", err)
	}

	if err := r.db.WithContext(ctx).
		Model(&ThreadParticipantModel{}).
		Where("thread_id = ? AND user_id IN ?", threadID, userIDs).
		Update("left_at", gorm.Expr("NULL")).Error; err != nil {
		return fmt.Errorf("failed to clear left_at for rejoining participants: %w", err)
	}
	return nil
}

// SetLeft marks a participant as having left the thread at the given time.
func (r *GormThreadRepository) SetLeft(ctx context.Context, threadID, userID int, at time.Time) error {
	if err := r.db.WithContext(ctx).
		Model(&ThreadParticipantModel{}).
		Where("thread_id = ? AND user_id = ?", threadID, userID).
		Update("left_at", at).Error; err != nil {
		return fmt.Errorf("failed to set participant left_at: %w", err)
	}
	return nil
}

// SetMuted toggles a participant's muted flag. No matching participant row is
// reported as domain.ErrNotFound.
func (r *GormThreadRepository) SetMuted(ctx context.Context, threadID, userID int, muted bool) error {
	res := r.db.WithContext(ctx).
		Model(&ThreadParticipantModel{}).
		Where("thread_id = ? AND user_id = ?", threadID, userID).
		Update("muted", muted)
	if res.Error != nil {
		return fmt.Errorf("failed to set participant muted flag: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// SetLastRead advances a participant's read pointer. It is forward-only: the
// last_read_seq < ? predicate makes a lower or equal seq a no-op.
func (r *GormThreadRepository) SetLastRead(ctx context.Context, threadID, userID int, seq int64) error {
	if err := r.db.WithContext(ctx).
		Model(&ThreadParticipantModel{}).
		Where("thread_id = ? AND user_id = ? AND last_read_seq < ?", threadID, userID, seq).
		Update("last_read_seq", seq).Error; err != nil {
		return fmt.Errorf("failed to set last read seq: %w", err)
	}
	return nil
}
