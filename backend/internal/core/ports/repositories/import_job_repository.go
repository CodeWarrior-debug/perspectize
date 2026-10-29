package repositories

import (
	"context"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// ImportSourceUpdate is the listing state written back onto a source. Nil
// pointer fields are left unchanged.
type ImportSourceUpdate struct {
	Status       domain.ImportSourceStatus
	StatusDetail *string
	Title        *string
	URL          *string
	ItemCount    *int
	FetchedAt    *time.Time
}

// ImportJobRepository persists imports, their sources and their staged items.
// Every method states its statement count; the query-count tests pin it.
type ImportJobRepository interface {
	// CreateJob inserts the job and all its sources (2 statements) and returns
	// them with ids. domain.ErrNotFound when the creating user is missing.
	CreateJob(ctx context.Context, job *domain.ImportJob) (*domain.ImportJob, error)

	// ListJobs returns every job, newest first, with its sources (2 queries).
	ListJobs(ctx context.Context) ([]*domain.ImportJob, error)

	// GetJob returns one job with its sources (2 queries), or domain.ErrNotFound.
	GetJob(ctx context.Context, id int) (*domain.ImportJob, error)

	// UpdateSource writes listing progress onto a source (1 statement).
	UpdateSource(ctx context.Context, sourceID int, update ImportSourceUpdate) error

	// UpsertItems stages a batch of candidates in one statement. A candidate
	// already staged for the same source keeps its import outcome; its title,
	// stats and details are refreshed. Empty input issues nothing.
	UpsertItems(ctx context.Context, items []*domain.ImportItemWithDetails) error

	// ListItems returns every staged row of a job in listing order, each with
	// InLibrary and ContentID resolved by URL (1 query). Details are not loaded.
	ListItems(ctx context.Context, jobID int) ([]*domain.ImportItem, error)

	// GetItemsByIDs returns the rows of jobID among ids, with InLibrary resolved
	// (1 query; 0 for empty ids). Ids from other jobs are absent.
	GetItemsByIDs(ctx context.Context, jobID int, ids []int) ([]*domain.ImportItem, error)

	// GetItemWithDetails returns one row and its detail payload (1 query), or
	// domain.ErrNotFound.
	GetItemWithDetails(ctx context.Context, itemID int) (*domain.ImportItemWithDetails, error)

	// MarkQueued sets import_status to QUEUED on the rows of jobID among ids
	// that have never been imported or last failed, and returns the ids it
	// changed (1 statement; 0 for empty ids).
	MarkQueued(ctx context.Context, jobID int, ids []int) ([]int, error)

	// RecordOutcome stores the result of importing one row (1 statement).
	RecordOutcome(ctx context.Context, itemID int, status domain.ImportItemStatus, errMsg *string, contentID *int) error

	// FailInterrupted marks sources still LISTING and rows still QUEUED as
	// failed, for work a restart cut short (2 statements). Returns how many of
	// each it changed.
	FailInterrupted(ctx context.Context, detail string) (sources int, items int, err error)

	// CountPendingRequests counts userID's jobs still REQUESTED (1 query).
	CountPendingRequests(ctx context.Context, userID int) (int, error)

	// ReviewJob sets a REQUESTED job to status (APPROVED or DECLINED) with an
	// optional note. Approving also moves its WAITING sources to LISTING
	// (2 statements; 1 for a decline). domain.ErrNotFound when the job isn't
	// REQUESTED any more, including when another admin reviewed it first.
	ReviewJob(ctx context.Context, jobID int, status domain.ImportRequestStatus, note *string, at time.Time) error

	// ReassignByUser moves the creator of every job from fromUserID to
	// toUserID, used when a user is deleted (1 statement).
	ReassignByUser(ctx context.Context, fromUserID, toUserID int) error
}
