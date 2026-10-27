package services

import (
	"context"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// ImportService runs bulk imports: admins create imports whose sources are
// listed in the background into a shared staging sheet, and signed-in users
// pick rows from it to import as content.
type ImportService interface {
	// ListImportJobs returns every import with its sources, newest first.
	ListImportJobs(ctx context.Context) ([]*domain.ImportJob, error)

	// GetImportJob returns one import with its sources, or (nil, nil) when it doesn't exist.
	GetImportJob(ctx context.Context, id int) (*domain.ImportJob, error)

	// ListImportItems returns every staged row of an import, with library
	// status resolved, in listing order (1 query). Empty for an unknown import.
	ListImportItems(ctx context.Context, jobID int) ([]*domain.ImportItem, error)

	// GetImportItemDetails returns one row with its detail-panel payload, or
	// (nil, nil) when it doesn't exist.
	GetImportItemDetails(ctx context.Context, itemID int) (*domain.ImportItemWithDetails, error)

	// CreateImportJob checks every source against its API, saves the import and
	// starts listing each source in the background. Admin only
	// (domain.ErrForbidden). domain.ErrInvalidInput for a bad name or source, or
	// a source type this server has no API key for; domain.ErrNotFound when a
	// source doesn't exist.
	CreateImportJob(ctx context.Context, actor *domain.AuthenticatedUser, input domain.CreateImportJobInput) (*domain.ImportJob, error)

	// ImportItems queues the picked rows of an import and imports them in the
	// background as actor. Rows already in the library, queued or imported are
	// counted, not queued. At most domain.MaxImportItemsPerRequest ids.
	ImportItems(ctx context.Context, actor *domain.AuthenticatedUser, jobID int, itemIDs []int) (*domain.ImportBatchResult, error)

	// RecoverInterrupted fails work a restart cut short (sources still
	// listing, rows still queued). Called once at startup.
	RecoverInterrupted(ctx context.Context) error
}
