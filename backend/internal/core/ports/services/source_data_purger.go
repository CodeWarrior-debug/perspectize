package services

import (
	"context"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// SourceDataPurger deletes stored source counts older than a number of days.
type SourceDataPurger interface {
	// Purge is admin only (domain.ErrForbidden otherwise). It returns how many
	// rows were cleared.
	Purge(ctx context.Context, actor *domain.AuthenticatedUser, target domain.SourceDataTarget, olderThanDays int) (int64, error)
}
