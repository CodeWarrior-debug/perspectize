package services

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"gorm.io/gorm"
)

// SourceDataRetention deletes stored source-API counts once they are older
// than a chosen number of days. Only the counts go: the row, its title,
// description and the people's perspectives stay, and a refresh restores the
// numbers. The scheduled sweep and the admin purgeSourceData mutation both call
// Purge, so there is one code path to trust.
type SourceDataRetention struct {
	db  *gorm.DB
	now func() time.Time
}

// NewSourceDataRetention builds the service.
func NewSourceDataRetention(db *gorm.DB) *SourceDataRetention {
	return &SourceDataRetention{db: db, now: time.Now}
}

// purgeSQL per target. Each clears the counts only, leaves updated_at alone
// (a clear is not a refresh) and ages a row from its fetch stamp, falling back
// to created_at when it has none.
var purgeSQL = map[domain.SourceDataTarget]string{
	domain.SourceDataTargetYouTubeStatistics: `
		UPDATE content
		SET response = response #- '{items,0,statistics}'
		WHERE (content_type = 'YOUTUBE_VIDEO' OR content_type = '')
		  AND response #> '{items,0,statistics}' IS NOT NULL
		  AND COALESCE(NULLIF(response->>'perspectizeFetchedAt', '')::timestamptz, created_at) < ?`,
}

// Purge is the admin-triggered entry point: it refuses anyone who is not an
// admin, then clears target data fetched more than olderThanDays days ago and
// returns the number of rows changed.
func (s *SourceDataRetention) Purge(ctx context.Context, actor *domain.AuthenticatedUser, target domain.SourceDataTarget, olderThanDays int) (int64, error) {
	if !isAdmin(actor) {
		return 0, domain.ErrForbidden
	}
	return s.purge(ctx, target, olderThanDays)
}

// purge validates the arguments and runs the clearing statement; the scheduled
// sweep calls it directly because it has no actor.
func (s *SourceDataRetention) purge(ctx context.Context, target domain.SourceDataTarget, olderThanDays int) (int64, error) {
	if !target.IsValid() {
		return 0, fmt.Errorf("%w: unknown source data target %q", domain.ErrInvalidInput, target)
	}
	if olderThanDays < 1 {
		return 0, fmt.Errorf("%w: olderThanDays must be at least 1", domain.ErrInvalidInput)
	}
	cutoff := s.now().Add(-time.Duration(olderThanDays) * 24 * time.Hour)
	res := s.db.WithContext(ctx).Exec(purgeSQL[target], cutoff)
	if res.Error != nil {
		return 0, fmt.Errorf("purge source data: %w", res.Error)
	}
	return res.RowsAffected, nil
}

// Run purges every target at the configured retention age immediately, then on
// every interval tick until ctx is done. A non-positive interval disables it.
func (s *SourceDataRetention) Run(ctx context.Context, maxAgeDays int, interval time.Duration) {
	if interval <= 0 || maxAgeDays < 1 {
		return
	}
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		for _, target := range []domain.SourceDataTarget{domain.SourceDataTargetYouTubeStatistics} {
			if n, err := s.purge(ctx, target, maxAgeDays); err != nil {
				slog.Error("source data sweep failed", "target", target, "error", err)
			} else if n > 0 {
				slog.Info("source data sweep cleared counts", "target", target, "rows", n, "older_than_days", maxAgeDays)
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}
