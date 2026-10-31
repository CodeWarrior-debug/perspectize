package services

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strconv"
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
	spawn    func(func())
	workers  int
	now      func() time.Time
	progress *importProgressTracker
	// progressInterval is how often live progress is pushed (tests shorten it).
	progressInterval time.Duration
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

// WithImportProgressInterval sets how often live import progress is pushed.
func WithImportProgressInterval(d time.Duration) ImportServiceOption {
	return func(s *ImportService) { s.progressInterval = d }
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

		progressInterval: defaultProgressInterval,
	}
	for _, opt := range opts {
		opt(s)
	}
	s.progress = newImportProgressTracker(s.progressInterval, s.now)
	return s
}

// ListImportJobs returns every import with its sources. Closed imports are
// for admins only, and only when asked for.
func (s *ImportService) ListImportJobs(ctx context.Context, viewer *domain.AuthenticatedUser, includeClosed bool) ([]*domain.ImportJob, error) {
	return s.repo.ListJobs(ctx, includeClosed && isImportAdmin(viewer))
}

// GetImportJob returns one import, or (nil, nil) when it doesn't exist or is
// closed and the viewer isn't an admin (a closed import is hidden from them).
func (s *ImportService) GetImportJob(ctx context.Context, viewer *domain.AuthenticatedUser, id int) (*domain.ImportJob, error) {
	if id <= 0 {
		return nil, nil
	}
	job, err := s.repo.GetJob(ctx, id)
	if errors.Is(err, domain.ErrNotFound) {
		return nil, nil
	}
	if err == nil && job.ClosedAt != nil && !isImportAdmin(viewer) {
		return nil, nil
	}
	return job, err
}

func isImportAdmin(u *domain.AuthenticatedUser) bool {
	return u != nil && u.Role == domain.UserRoleAdmin
}

// openJob returns the job when its rows may change: it exists, was approved
// and isn't closed (1 query).
func (s *ImportService) openJob(ctx context.Context, jobID int) (*domain.ImportJob, error) {
	job, err := s.repo.GetJobState(ctx, jobID)
	if err != nil {
		return nil, err
	}
	switch {
	case job.ClosedAt != nil:
		return nil, fmt.Errorf("%w: this import is closed", domain.ErrInvalidInput)
	case job.RequestStatus != domain.ImportRequestStatusApproved:
		return nil, fmt.Errorf("%w: this import hasn't been approved", domain.ErrInvalidInput)
	}
	return job, nil
}

// SetItemsExcluded marks rows "don't import" (excluded) or clears the mark.
// Anyone signed in may do either, until an admin closes the import. Rows
// queued or imported keep their state. Returns how many rows changed.
func (s *ImportService) SetItemsExcluded(ctx context.Context, actor *domain.AuthenticatedUser, jobID int, itemIDs []int, excluded bool) (int, error) {
	if actor == nil {
		return 0, fmt.Errorf("%w: sign in to mark rows", domain.ErrForbidden)
	}
	ids := uniquePositive(itemIDs)
	if len(ids) == 0 {
		return 0, fmt.Errorf("%w: pick at least one row", domain.ErrInvalidInput)
	}
	if len(ids) > domain.MaxAdminImportItemsPerRequest {
		return 0, fmt.Errorf("%w: mark up to %s rows at a time", domain.ErrInvalidInput, formatThousands(domain.MaxAdminImportItemsPerRequest))
	}
	if _, err := s.openJob(ctx, jobID); err != nil {
		return 0, err
	}
	changed, err := s.repo.SetExcluded(ctx, jobID, ids, excluded)
	if err != nil {
		return 0, err
	}
	return len(changed), nil
}

// CloseImportJob closes an import (hidden from non-admins, read-only) or
// reopens it. Admin only. Rows already importing finish.
func (s *ImportService) CloseImportJob(ctx context.Context, actor *domain.AuthenticatedUser, jobID int, closed bool) (*domain.ImportJob, error) {
	if !isImportAdmin(actor) {
		return nil, fmt.Errorf("%w: only an admin may close or reopen an import", domain.ErrForbidden)
	}
	var at *time.Time
	if closed {
		t := s.now().UTC()
		at = &t
	}
	if err := s.repo.SetClosed(ctx, jobID, at); err != nil {
		return nil, err
	}
	return s.repo.GetJob(ctx, jobID)
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
// An admin's import starts listing at once. Anyone else's is a request: saved
// with its sources WAITING, spending no listing quota until an admin approves it.
func (s *ImportService) CreateImportJob(ctx context.Context, actor *domain.AuthenticatedUser, input domain.CreateImportJobInput) (*domain.ImportJob, error) {
	if actor == nil {
		return nil, fmt.Errorf("%w: sign in to request an import", domain.ErrForbidden)
	}
	isAdmin := actor.Role == domain.UserRoleAdmin
	name := strings.TrimSpace(input.Name)
	if name == "" || len([]rune(name)) > 120 {
		return nil, fmt.Errorf("%w: import name must be 1-120 characters", domain.ErrInvalidInput)
	}
	if len(input.Sources) == 0 || len(input.Sources) > domain.MaxImportSourcesPerJob {
		return nil, fmt.Errorf("%w: an import needs 1-%d sources", domain.ErrInvalidInput, domain.MaxImportSourcesPerJob)
	}

	if !isAdmin {
		pending, err := s.repo.CountPendingRequests(ctx, actor.ID)
		if err != nil {
			return nil, err
		}
		if pending >= domain.MaxPendingImportRequests {
			return nil, fmt.Errorf("%w: you already have %d requests waiting for an admin; wait for one to be reviewed",
				domain.ErrInvalidInput, pending)
		}
	}

	job := &domain.ImportJob{UserID: actor.ID, Name: name, RequestStatus: domain.ImportRequestStatusApproved}
	sourceStatus := domain.ImportSourceStatusListing
	if !isAdmin {
		job.RequestStatus, sourceStatus = domain.ImportRequestStatusRequested, domain.ImportSourceStatusWaiting
	}
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
			Status:          sourceStatus,
		})
	}

	created, err := s.repo.CreateJob(ctx, job)
	if err != nil {
		return nil, err
	}
	if isAdmin {
		s.startListing(created.Sources, resolved)
	}
	return created, nil
}

func (s *ImportService) startListing(sources []*domain.ImportSource, resolved []resolvedSource) {
	for i, src := range sources {
		src, rs := src, resolved[i]
		s.spawn(func() { s.listSource(src, rs) })
	}
}

// ReviewImportJob is an admin approving or declining a request. Approving
// re-resolves each source (the request may be days old) and starts listing; a
// source that no longer resolves fails on its own without blocking the rest.
// A decline needs a reason, since it is what the requester reads.
func (s *ImportService) ReviewImportJob(ctx context.Context, actor *domain.AuthenticatedUser, jobID int, approve bool, note string) (*domain.ImportJob, error) {
	if actor == nil || actor.Role != domain.UserRoleAdmin {
		return nil, fmt.Errorf("%w: only an admin may review import requests", domain.ErrForbidden)
	}
	note = strings.TrimSpace(note)
	if len([]rune(note)) > 500 {
		return nil, fmt.Errorf("%w: a review note is at most 500 characters", domain.ErrInvalidInput)
	}
	if !approve && note == "" {
		return nil, fmt.Errorf("%w: say why the request is declined", domain.ErrInvalidInput)
	}
	job, err := s.repo.GetJob(ctx, jobID)
	if err != nil {
		return nil, err
	}
	if job.RequestStatus != domain.ImportRequestStatusRequested {
		return nil, fmt.Errorf("%w: this import is already %s", domain.ErrInvalidInput, strings.ToLower(string(job.RequestStatus)))
	}

	status := domain.ImportRequestStatusDeclined
	if approve {
		status = domain.ImportRequestStatusApproved
	}
	var notePtr *string
	if note != "" {
		notePtr = &note
	}
	at := s.now().UTC()
	if err := s.repo.ReviewJob(ctx, jobID, status, notePtr, at); err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("%w: another admin reviewed this request first", domain.ErrInvalidInput)
		}
		return nil, err
	}
	job.RequestStatus, job.ReviewNote, job.ReviewedAt = status, notePtr, &at
	if !approve {
		return job, nil
	}

	var listable []*domain.ImportSource
	var resolved []resolvedSource
	for _, src := range job.Sources {
		src.Status = domain.ImportSourceStatusListing
		if rs, ok := s.resolveForListing(ctx, src); ok {
			listable = append(listable, src)
			resolved = append(resolved, rs)
		}
	}
	s.startListing(listable, resolved)
	return job, nil
}

// resolveForListing resolves an approved request's source again. When that
// fails, the source is marked failed with the reason and skipped.
func (s *ImportService) resolveForListing(ctx context.Context, src *domain.ImportSource) (resolvedSource, bool) {
	fail := func(detail string) (resolvedSource, bool) {
		src.Status, src.StatusDetail = domain.ImportSourceStatusFailed, &detail
		if err := s.repo.UpdateSource(ctx, src.ID, repositories.ImportSourceUpdate{Status: src.Status, StatusDetail: &detail}); err != nil {
			slog.Error("import source failure not saved", "sourceID", src.ID, "error", err)
		}
		return resolvedSource{}, false
	}
	lister, ok := s.listers[src.SourceType]
	if !ok {
		return fail(fmt.Sprintf("%s sources are not configured on this server", src.SourceType))
	}
	r, err := lister.Resolve(ctx, src.SourceRef)
	if err != nil {
		slog.Warn("approved import source no longer resolves", "sourceID", src.ID, "error", err)
		return fail("The source could not be found any more. Check the reference and request it again.")
	}
	return resolvedSource{lister: lister, resolved: *r}, true
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

// ImportItems queues the eligible picked rows (3 statements on the request)
// and imports them in the background.
func (s *ImportService) ImportItems(ctx context.Context, actor *domain.AuthenticatedUser, jobID int, itemIDs []int) (*domain.ImportBatchResult, error) {
	if actor == nil {
		return nil, fmt.Errorf("%w: sign in to import", domain.ErrForbidden)
	}
	ids := uniquePositive(itemIDs)
	if len(ids) == 0 {
		return nil, fmt.Errorf("%w: pick at least one row", domain.ErrInvalidInput)
	}
	limit := domain.MaxImportItemsPerRequest
	if actor.Role == domain.UserRoleAdmin {
		limit = domain.MaxAdminImportItemsPerRequest
	}
	if len(ids) > limit {
		return nil, fmt.Errorf("%w: select up to %s rows at a time (you picked %s)",
			domain.ErrInvalidInput, formatThousands(limit), formatThousands(len(ids)))
	}

	if _, err := s.openJob(ctx, jobID); err != nil {
		return nil, err
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
		case r.Excluded:
			result.Excluded++
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
		// Count the batch in before returning, so a progress subscription opened
		// right after this call already sees it.
		s.progress.begin(jobID, len(queued))
		s.spawn(func() { s.runImports(jobID, actorID, queued) })
	}
	return result, nil
}

// runImports is the import pipeline: a channel of queued rows feeding a
// fixed pool of workers, each creating content through the normal
// single-item path (so validation, dedupe and metadata are identical to
// adding the URL by hand).
//
// Progress is a fan-in: every worker sends its row's outcome down one
// outcomes channel, and a single collector counts them into the progress
// tracker, which pushes to subscribers at most twice a second.
func (s *ImportService) runImports(jobID, actorID int, items []*domain.ImportItem) {
	ctx, cancel := context.WithTimeout(s.bg, importTimeout)
	defer cancel()

	outcomes := make(chan domain.ImportItemStatus, s.workers)
	collected := make(chan struct{})
	go func() {
		defer close(collected)
		for st := range outcomes {
			s.progress.record(jobID, st)
		}
	}()
	defer func() {
		<-collected // every outcome counted before the final publish
		s.progress.end(jobID)
	}()

	queue := make(chan *domain.ImportItem)
	var wg sync.WaitGroup
	for range s.workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for it := range queue {
				if st, ok := s.importOne(ctx, actorID, it); ok {
					outcomes <- st
				}
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
	close(outcomes)
}

// importOne imports one row and records its outcome; ok is false when it
// was left queued because the import is shutting down.
func (s *ImportService) importOne(ctx context.Context, actorID int, it *domain.ImportItem) (domain.ImportItemStatus, bool) {
	if ctx.Err() != nil {
		return "", false // left queued; RecoverInterrupted fails it at the next start
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
	return status, true
}

// SubscribeImportProgress streams an import's live progress: the current
// count at once, then changes at most twice a second while it imports,
// until ctx ends. Any signed-in user may watch (the sheet is shared).
func (s *ImportService) SubscribeImportProgress(ctx context.Context, actor *domain.AuthenticatedUser, jobID int) (<-chan domain.ImportProgress, error) {
	if actor == nil {
		return nil, fmt.Errorf("%w: sign in to watch an import", domain.ErrForbidden)
	}
	if _, err := s.repo.GetJob(ctx, jobID); err != nil {
		return nil, err
	}
	return s.progress.subscribe(ctx, jobID), nil
}

// formatThousands writes n with comma separators ("1,000").
func formatThousands(n int) string {
	str := strconv.Itoa(n)
	for i := len(str) - 3; i > 0; i -= 3 {
		str = str[:i] + "," + str[i:]
	}
	return str
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
