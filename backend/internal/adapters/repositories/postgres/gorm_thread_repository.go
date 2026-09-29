package postgres

import (
	"context"
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

// threadWithParticipantsColumns selects a thread's columns plus one
// participant's (p_-prefixed, NULL when the thread has none) per row, so a
// thread and its participants load in one round trip.
const threadWithParticipantsColumns = `mt.id, mt.title, mt.created_by, mt.last_message_at, mt.created_at,
	tp.user_id AS p_user_id, tp.role AS p_role, tp.last_read_seq AS p_last_read_seq,
	tp.muted AS p_muted, tp.joined_at AS p_joined_at, tp.left_at AS p_left_at`

// threadParticipantRow is one row of a thread LEFT JOIN thread_participants.
type threadParticipantRow struct {
	MessageThreadModel
	PUserID      *int64
	PRole        *string
	PLastReadSeq *int64
	PMuted       *bool
	PJoinedAt    *time.Time
	PLeftAt      *time.Time
}

// groupThreadRows folds joined rows back into threads, keeping row order.
func groupThreadRows(rows []threadParticipantRow) []domain.MessageThread {
	order := []int64{}
	models := map[int64]MessageThreadModel{}
	parts := map[int64][]ThreadParticipantModel{}
	for _, row := range rows {
		if _, seen := models[row.ID]; !seen {
			order = append(order, row.ID)
			models[row.ID] = row.MessageThreadModel
		}
		if row.PUserID == nil {
			continue
		}
		parts[row.ID] = append(parts[row.ID], ThreadParticipantModel{
			ThreadID:    row.ID,
			UserID:      *row.PUserID,
			Role:        deref(row.PRole),
			LastReadSeq: deref(row.PLastReadSeq),
			Muted:       deref(row.PMuted),
			JoinedAt:    deref(row.PJoinedAt),
			LeftAt:      row.PLeftAt,
		})
	}
	threads := make([]domain.MessageThread, len(order))
	for i, id := range order {
		m := models[id]
		threads[i] = messageThreadModelToDomain(&m, parts[id])
	}
	return threads
}

func deref[T any](p *T) T {
	var zero T
	if p == nil {
		return zero
	}
	return *p
}

// GetThread loads a thread and its participants in one query. A missing
// thread is reported as domain.ErrNotFound.
func (r *GormThreadRepository) GetThread(ctx context.Context, threadID int) (*domain.MessageThread, error) {
	var rows []threadParticipantRow
	if err := r.db.WithContext(ctx).Raw(`SELECT `+threadWithParticipantsColumns+`
		FROM message_threads mt
		LEFT JOIN thread_participants tp ON tp.thread_id = mt.id
		WHERE mt.id = ?
		ORDER BY tp.joined_at, tp.user_id`, threadID).Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("failed to get thread: %w", err)
	}
	if len(rows) == 0 {
		return nil, domain.ErrNotFound
	}
	thread := groupThreadRows(rows)[0]
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
// activity, with their participants, in one query. When beforeLastMessageAt is
// set, only threads strictly older than it are returned (keyset pagination).
func (r *GormThreadRepository) ListThreadsForUser(ctx context.Context, userID int, limit int, beforeLastMessageAt *time.Time) ([]domain.MessageThread, error) {
	where := "me.user_id = @user AND me.left_at IS NULL"
	args := map[string]any{"user": userID}
	if beforeLastMessageAt != nil {
		where += " AND mt.last_message_at < @before"
		args["before"] = *beforeLastMessageAt
	}
	limitSQL := ""
	if limit > 0 {
		limitSQL = " LIMIT @limit"
		args["limit"] = limit
	}

	var rows []threadParticipantRow
	if err := r.db.WithContext(ctx).Raw(`WITH mine AS (
			SELECT mt.* FROM message_threads mt
			JOIN thread_participants me ON me.thread_id = mt.id
			WHERE `+where+`
			ORDER BY mt.last_message_at DESC, mt.id DESC`+limitSQL+`
		)
		SELECT `+threadWithParticipantsColumns+`
		FROM mine mt
		LEFT JOIN thread_participants tp ON tp.thread_id = mt.id
		ORDER BY mt.last_message_at DESC, mt.id DESC, tp.joined_at, tp.user_id`, args).
		Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("failed to list threads for user: %w", err)
	}
	return groupThreadRows(rows), nil
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
