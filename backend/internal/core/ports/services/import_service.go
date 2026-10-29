package services

import (
	"context"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// ImportService runs bulk imports: anyone signed in requests an import, an
// admin approves it (an admin's own starts at once), its sources are listed in
// the background into a shared staging sheet, and signed-in users pick rows
// from it to import as content.
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

	// CreateImportJob checks every source against its API and saves the import.
	// An admin's is APPROVED and starts listing each source in the background;
	// anyone else's is REQUESTED with WAITING sources, and a person may have at
	// most domain.MaxPendingImportRequests open. domain.ErrInvalidInput for a
	// bad name or source, too many open requests, or a source type this server
	// has no API key for; domain.ErrNotFound when a source doesn't exist.
	CreateImportJob(ctx context.Context, actor *domain.AuthenticatedUser, input domain.CreateImportJobInput) (*domain.ImportJob, error)

	// ReviewImportJob approves (starting listing) or declines a REQUESTED
	// import. Admin only (domain.ErrForbidden). A decline needs a note.
	// domain.ErrInvalidInput when the import isn't REQUESTED any more.
	ReviewImportJob(ctx context.Context, actor *domain.AuthenticatedUser, jobID int, approve bool, note string) (*domain.ImportJob, error)

	// ImportItems queues the picked rows of an import and imports them in the
	// background as actor. Rows already in the library, queued or imported are
	// counted, not queued. At most domain.MaxImportItemsPerRequest ids
	// (domain.MaxAdminImportItemsPerRequest for an admin).
	ImportItems(ctx context.Context, actor *domain.AuthenticatedUser, jobID int, itemIDs []int) (*domain.ImportBatchResult, error)

	// SubscribeImportProgress streams an import's live progress until ctx ends:
	// the current count at once, then changes at most twice a second while
	// rows import. domain.ErrNotFound for an unknown import.
	SubscribeImportProgress(ctx context.Context, actor *domain.AuthenticatedUser, jobID int) (<-chan domain.ImportProgress, error)

	// RecoverInterrupted fails work a restart cut short (sources still
	// listing, rows still queued). Called once at startup.
	RecoverInterrupted(ctx context.Context) error
}
