package services

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// importWorkers is how many rows are imported at once. Each import is one
// source API call plus a few statements, so a small pool keeps quota use and
// DB load steady.
const importWorkers = 4

// listingTimeout bounds one source's listing (a 5,000-video channel takes a
// couple of minutes at 2 calls per 50 videos).
const listingTimeout = 30 * time.Minute

// importTimeout bounds one importItems batch.
const importTimeout = 30 * time.Minute

// interruptedDetail is what a row or source shows after a restart cut it short.
const interruptedDetail = "Interrupted by a server restart. Select it again to retry."

// importContentCreator is the slice of ContentService the import workers use.
type importContentCreator interface {
	CreateFromYouTube(ctx context.Context, url string, userID int) (*domain.Content, error)
	CreateFromMovie(ctx context.Context, rawURL string, userID int) (*domain.Content, error)
}

// ImportService implements portservices.ImportService.
type ImportService struct {
	repo    repositories.ImportJobRepository
	listers map[domain.ImportSourceType]portservices.ImportSourceLister
	content importContentCreator
	// bg is the parent context of background work: the server's lifetime, so
	// a shutdown cancels in-flight listing and imports.
	bg context.Context
	// spawn starts background work; tests replace it to run work inline.
	spawn   func(func())
	workers int
	now     func() time.Time
}

var _ portservices.ImportService = (*ImportService)(nil)

// ImportServiceOption configures an ImportService.
type ImportServiceOption func(*ImportService)

// WithImportBackground sets the parent context of background listing and imports.
func WithImportBackground(ctx context.Context) ImportServiceOption {
	return func(s *ImportService) { s.bg = ctx }
}

// WithImportSpawn replaces how background work starts (tests run it inline).
func WithImportSpawn(spawn func(func())) ImportServiceOption {
	return func(s *ImportService) { s.spawn = spawn }
}

// WithImportClock replaces the clock used for fetchedAt.
func WithImportClock(now func() time.Time) ImportServiceOption {
	return func(s *ImportService) { s.now = now }
}

// NewImportService builds the import service. listers holds one lister per
// source type this server can list; a type with no lister (no API key) is
// refused at createImportJob.
func NewImportService(
	repo repositories.ImportJobRepository,
	listers map[domain.ImportSourceType]portservices.ImportSourceLister,
	content importContentCreator,
	opts ...ImportServiceOption,
) *ImportService {
	s := &ImportService{
		repo:    repo,
		listers: listers,
		content: content,
		bg:      context.Background(),
		spawn:   func(f func()) { go f() },
		workers: importWorkers,
		now:     time.Now,
	}
	for _, opt := range opts {
		opt(s)
	}
	return s
}

// ListImportJobs returns every import with its sources.
func (s *ImportService) ListImportJobs(ctx context.Context) ([]*domain.ImportJob, error) {
	return s.repo.ListJobs(ctx)
}

// GetImportJob returns one import, or (nil, nil) when it doesn't exist.
func (s *ImportService) GetImportJob(ctx context.Context, id int) (*domain.ImportJob, error) {
	if id <= 0 {
		return nil, nil
	}
	job, err := s.repo.GetJob(ctx, id)
	if errors.Is(err, domain.ErrNotFound) {
		return nil, nil
	}
	return job, err
}

// ListImportItems returns every staged row of an import.
func (s *ImportService) ListImportItems(ctx context.Context, jobID int) ([]*domain.ImportItem, error) {
	if jobID <= 0 {
		return []*domain.ImportItem{}, nil
	}
	return s.repo.ListItems(ctx, jobID)
}

// GetImportItemDetails returns one row with its details, or (nil, nil) when it doesn't exist.
func (s *ImportService) GetImportItemDetails(ctx context.Context, itemID int) (*domain.ImportItemWithDetails, error) {
	if itemID <= 0 {
		return nil, nil
	}
	item, err := s.repo.GetItemWithDetails(ctx, itemID)
	if errors.Is(err, domain.ErrNotFound) {
		return nil, nil
	}
	return item, err
}

// resolvedSource pairs a saved source with what its lister resolved.
type resolvedSource struct {
	lister   portservices.ImportSourceLister
	resolved portservices.ResolvedImportSource
}

// CreateImportJob validates and resolves every source before saving anything,
// so a typo in the third channel doesn't leave a half-made import behind.
func (s *ImportService) CreateImportJob(ctx context.Context, actor *domain.AuthenticatedUser, input domain.CreateImportJobInput) (*domain.ImportJob, error) {
	if actor == nil || actor.Role != domain.UserRoleAdmin {
		return nil, fmt.Errorf("%w: only an admin may create imports", domain.ErrForbidden)
	}
	name := strings.TrimSpace(input.Name)
	if name == "" || len([]rune(name)) > 120 {
		return nil, fmt.Errorf("%w: import name must be 1-120 characters", domain.ErrInvalidInput)
	}
	if len(input.Sources) == 0 || len(input.Sources) > domain.MaxImportSourcesPerJob {
		return nil, fmt.Errorf("%w: an import needs 1-%d sources", domain.ErrInvalidInput, domain.MaxImportSourcesPerJob)
	}

	job := &domain.ImportJob{UserID: actor.ID, Name: name}
	resolved := make([]resolvedSource, len(input.Sources))
	for i, in := range input.Sources {
		if !in.SourceType.Valid() {
			return nil, fmt.Errorf("%w: unknown source type %q", domain.ErrInvalidInput, in.SourceType)
		}
		if in.Role != nil && in.SourceType != domain.ImportSourceTMDBPerson {
			return nil, fmt.Errorf("%w: role only applies to TMDB people", domain.ErrInvalidInput)
		}
		lister, ok := s.listers[in.SourceType]
		if !ok {
			return nil, fmt.Errorf("%w: %s sources are not configured on this server", domain.ErrInvalidInput, in.SourceType)
		}
		ref := strings.TrimSpace(in.Ref)
		if ref == "" || len(ref) > 200 {
			return nil, fmt.Errorf("%w: source %d needs a reference of 1-200 characters", domain.ErrInvalidInput, i+1)
		}
		r, err := lister.Resolve(ctx, ref)
		if err != nil {
			return nil, fmt.Errorf("source %d (%s): %w", i+1, ref, err)
		}
		resolved[i] = resolvedSource{lister: lister, resolved: *r}
		title, link := r.Title, r.URL
		job.Sources = append(job.Sources, &domain.ImportSource{
			SourceType:      in.SourceType,
			SourceRef:       ref,
			Title:           &title,
			URL:             &link,
			Role:            in.Role,
			DestinationType: in.SourceType.DestinationType(),
			Status:          domain.ImportSourceStatusListing,
		})
	}

	created, err := s.repo.CreateJob(ctx, job)
	if err != nil {
		return nil, err
	}
	for i, src := range created.Sources {
		src, rs := src, resolved[i]
		s.spawn(func() { s.listSource(src, rs) })
	}
	return created, nil
}

// listSource is the listing pipeline for one source: the lister goroutine
// sends batches down a channel and this goroutine stages each one as it
// arrives, so a slow API page and a slow insert overlap instead of adding up.
func (s *ImportService) listSource(src *domain.ImportSource, rs resolvedSource) {
	ctx, cancel := context.WithTimeout(s.bg, listingTimeout)
	defer cancel()

	batches := make(chan []*domain.ImportItemWithDetails, 2)
	listErr := make(chan error, 1)
	go func() {
		defer close(batches)
		listErr <- rs.lister.List(ctx, rs.resolved, src.Role, func(b []*domain.ImportItemWithDetails) error {
			select {
			case batches <- b:
				return nil
			case <-ctx.Done():
				return ctx.Err()
			}
		})
	}()

	count := 0
	var stageErr error
	for batch := range batches {
		if stageErr != nil {
			continue // drain so the lister can finish
		}
		for _, it := range batch {
			it.Item.JobID, it.Item.SourceID = src.JobID, src.ID
		}
		if err := s.repo.UpsertItems(ctx, batch); err != nil {
			stageErr = err
			cancel()
			continue
		}
		count += len(batch)
		progress := count
		if err := s.repo.UpdateSource(ctx, src.ID, repositories.ImportSourceUpdate{Status: domain.ImportSourceStatusListing, ItemCount: &progress}); err != nil {
			slog.Warn("import listing progress not saved", "sourceID", src.ID, "error", err)
		}
	}

	err := <-listErr
	if stageErr != nil {
		err = stageErr
	}
	done := s.now().UTC()
	final := repositories.ImportSourceUpdate{Status: domain.ImportSourceStatusReady, ItemCount: &count, FetchedAt: &done}
	if err != nil {
		slog.Error("import listing failed", "sourceID", src.ID, "jobID", src.JobID, "staged", count, "error", err)
		detail := listingFailureDetail(err, count)
		final.Status, final.StatusDetail = domain.ImportSourceStatusFailed, &detail
	}
	// The listing context may be spent (timeout, cancel); the final write gets its own.
	writeCtx, writeCancel := context.WithTimeout(context.WithoutCancel(s.bg), 10*time.Second)
	defer writeCancel()
	if werr := s.repo.UpdateSource(writeCtx, src.ID, final); werr != nil {
		slog.Error("import listing result not saved", "sourceID", src.ID, "error", werr)
	}
}

// listingFailureDetail is the user-facing reason a listing stopped.
func listingFailureDetail(err error, staged int) string {
	reason := "the source API returned an error"
	switch {
	case errors.Is(err, context.DeadlineExceeded):
		reason = "listing took too long"
	case errors.Is(err, context.Canceled):
		reason = "the server stopped"
	case errors.Is(err, domain.ErrYouTubeAPI):
		reason = "YouTube refused the request (often the daily quota)"
	case errors.Is(err, domain.ErrNotFound):
		reason = "the source no longer exists"
	}
	if staged > 0 {
		return fmt.Sprintf("Stopped after %d items: %s.", staged, reason)
	}
	return fmt.Sprintf("Listing failed: %s.", reason)
}

// ImportItems queues the eligible picked rows (2 statements on the request)
// and imports them in the background.
func (s *ImportService) ImportItems(ctx context.Context, actor *domain.AuthenticatedUser, jobID int, itemIDs []int) (*domain.ImportBatchResult, error) {
	if actor == nil {
		return nil, fmt.Errorf("%w: sign in to import", domain.ErrForbidden)
	}
	ids := uniquePositive(itemIDs)
	if len(ids) == 0 {
		return nil, fmt.Errorf("%w: pick at least one row", domain.ErrInvalidInput)
	}
	if len(ids) > domain.MaxImportItemsPerRequest {
		return nil, fmt.Errorf("%w: import at most %d rows at a time", domain.ErrInvalidInput, domain.MaxImportItemsPerRequest)
	}

	rows, err := s.repo.GetItemsByIDs(ctx, jobID, ids)
	if err != nil {
		return nil, err
	}
	result := &domain.ImportBatchResult{NotFound: len(ids) - len(rows)}
	byID := make(map[int]*domain.ImportItem, len(rows))
	eligible := make([]int, 0, len(rows))
	for _, r := range rows {
		switch {
		case r.InLibrary:
			result.AlreadyInLibrary++
		case r.ImportStatus != nil && *r.ImportStatus != domain.ImportItemStatusFailed:
			result.AlreadyQueued++
		default:
			byID[r.ID] = r
			eligible = append(eligible, r.ID)
		}
	}

	queuedIDs, err := s.repo.MarkQueued(ctx, jobID, eligible)
	if err != nil {
		return nil, err
	}
	// A row queued by someone else between the read and the update was not changed by us.
	result.Queued = len(queuedIDs)
	result.AlreadyQueued += len(eligible) - len(queuedIDs)

	if len(queuedIDs) > 0 {
		queued := make([]*domain.ImportItem, len(queuedIDs))
		for i, id := range queuedIDs {
			queued[i] = byID[id]
		}
		actorID := actor.ID
		s.spawn(func() { s.runImports(actorID, queued) })
	}
	return result, nil
}

// runImports is the import pipeline: a channel of queued rows feeding a
// fixed pool of workers, each creating content through the normal
// single-item path (so validation, dedupe and metadata are identical to
// adding the URL by hand).
func (s *ImportService) runImports(actorID int, items []*domain.ImportItem) {
	ctx, cancel := context.WithTimeout(s.bg, importTimeout)
	defer cancel()

	queue := make(chan *domain.ImportItem)
	var wg sync.WaitGroup
	for range s.workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for it := range queue {
				s.importOne(ctx, actorID, it)
			}
		}()
	}
feed:
	for _, it := range items {
		// select picks randomly among ready cases, so check for shutdown first.
		if ctx.Err() != nil {
			break feed
		}
		select {
		case queue <- it:
		case <-ctx.Done():
			// Unsent rows stay queued; RecoverInterrupted fails them at the next start.
			break feed
		}
	}
	close(queue)
	wg.Wait()
}

func (s *ImportService) importOne(ctx context.Context, actorID int, it *domain.ImportItem) {
	if ctx.Err() != nil {
		return // left queued; RecoverInterrupted fails it at the next start
	}
	var (
		content *domain.Content
		err     error
	)
	switch it.DestinationType {
	case domain.ContentTypeYouTubeVideo:
		content, err = s.content.CreateFromYouTube(ctx, it.CanonicalURL, actorID)
	case domain.ContentTypeMovie:
		content, err = s.content.CreateFromMovie(ctx, it.CanonicalURL, actorID)
	default:
		err = fmt.Errorf("%w: cannot import %s", domain.ErrInvalidInput, it.DestinationType)
	}

	status := domain.ImportItemStatusImported
	var msg *string
	switch {
	case errors.Is(err, domain.ErrAlreadyExists):
		status = domain.ImportItemStatusSkipped
	case err != nil:
		status = domain.ImportItemStatusFailed
		m := importFailureDetail(err)
		msg = &m
		slog.Warn("import item failed", "itemID", it.ID, "jobID", it.JobID, "error", err)
	}
	var contentID *int
	if content != nil {
		contentID = &content.ID
	}
	writeCtx, writeCancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
	defer writeCancel()
	if werr := s.repo.RecordOutcome(writeCtx, it.ID, status, msg, contentID); werr != nil {
		slog.Error("import outcome not saved", "itemID", it.ID, "error", werr)
	}
}

// importFailureDetail is the user-facing reason one row failed. Upstream
// error text is never shown (it can carry URLs and keys).
func importFailureDetail(err error) string {
	switch {
	case errors.Is(err, domain.ErrContentNotAllowed):
		return domain.ErrContentNotAllowed.Error()
	case errors.Is(err, domain.ErrNotFound):
		return "The source no longer has this item."
	case errors.Is(err, context.DeadlineExceeded), errors.Is(err, context.Canceled):
		return "The import was cut short. Select it again to retry."
	default:
		return "The source API refused the request. Try again later."
	}
}

// RecoverInterrupted fails work a restart cut short.
func (s *ImportService) RecoverInterrupted(ctx context.Context) error {
	sources, items, err := s.repo.FailInterrupted(ctx, interruptedDetail)
	if err != nil {
		return err
	}
	if sources > 0 || items > 0 {
		slog.Info("marked interrupted imports as failed", "sources", sources, "items", items)
	}
	return nil
}

func uniquePositive(ids []int) []int {
	seen := make(map[int]bool, len(ids))
	out := make([]int, 0, len(ids))
	for _, id := range ids {
		if id > 0 && !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}
