package services

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"gorm.io/gorm"
)

// RetentionSweeper deletes all but the newest maxPerThread messages in each
// thread. It is the only message pruner in the system (migration 000018 removed
// the in-trigger DELETE) and is a no-op when maxPerThread <= 0, so retention is
// opt-in via MESSAGE_RETENTION_MAX.
type RetentionSweeper struct {
	db           *gorm.DB
	maxPerThread int
	interval     time.Duration
}

// NewRetentionSweeper builds a sweeper. interval <= 0 defaults to 15 minutes
// (only used by Run).
func NewRetentionSweeper(db *gorm.DB, maxPerThread int, interval time.Duration) *RetentionSweeper {
	if interval <= 0 {
		interval = 15 * time.Minute
	}
	return &RetentionSweeper{db: db, maxPerThread: maxPerThread, interval: interval}
}

// SweepOnce prunes every thread down to its newest maxPerThread messages and
// returns the number of rows deleted. It is a no-op returning (0, nil) when
// retention is disabled (maxPerThread <= 0). Surviving rows keep their seq
// values — nothing is renumbered.
func (s *RetentionSweeper) SweepOnce(ctx context.Context) (int64, error) {
	if s.maxPerThread <= 0 {
		return 0, nil
	}
	res := s.db.WithContext(ctx).Exec(`
		DELETE FROM messages m
		USING (SELECT thread_id, MAX(seq) AS mx FROM messages GROUP BY thread_id) t
		WHERE m.thread_id = t.thread_id
		  AND m.seq <= t.mx - ?`, s.maxPerThread)
	if res.Error != nil {
		return 0, fmt.Errorf("retention sweep: %w", res.Error)
	}
	return res.RowsAffected, nil
}

// Run sweeps immediately, then on every interval tick until ctx is done.
func (s *RetentionSweeper) Run(ctx context.Context) {
	if s.maxPerThread <= 0 {
		return
	}
	t := time.NewTicker(s.interval)
	defer t.Stop()
	for {
		if n, err := s.SweepOnce(ctx); err != nil {
			slog.Error("retention sweep failed", "error", err)
		} else if n > 0 {
			slog.Info("retention sweep pruned messages", "deleted", n, "max_per_thread", s.maxPerThread)
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}
