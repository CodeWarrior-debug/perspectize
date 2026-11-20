package services_test

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/CodeWarrior-debug/perspectize/backend/pkg/limiter"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// waitFor bounds every wait on another goroutine. The waits return as soon as
// their condition holds, so the margin only matters when something is wrong.
const (
	waitFor = 5 * time.Second
	tick    = 5 * time.Millisecond
)

// --- helpers ------------------------------------------------------------------

// approvedJob adds an approved import, so rows staged in it can be imported.
func approvedJob(t *testing.T, repo *fakeImportRepo) *domain.ImportJob {
	t.Helper()
	job, err := repo.CreateJob(context.Background(), &domain.ImportJob{Name: "x", RequestStatus: domain.ImportRequestStatusApproved})
	require.NoError(t, err)
	return job
}

// seedRows stages n YouTube rows named prefix0, prefix1, ... in the job and
// returns their ids and creator urls in that order.
func seedRows(t *testing.T, repo *fakeImportRepo, jobID int, prefix string, n int) (ids []int, urls []string) {
	t.Helper()
	rows := make([]*domain.ImportItemWithDetails, n)
	byExternal := make(map[string]int, n)
	for i := range rows {
		ext := prefix + string(rune('0'+i))
		rows[i] = candidate(ext, domain.ContentTypeYouTubeVideo)
		rows[i].Item.JobID = jobID
		urls = append(urls, rows[i].Item.CanonicalURL)
		byExternal[ext] = 0
	}
	require.NoError(t, repo.UpsertItems(context.Background(), rows))

	repo.mu.Lock()
	defer repo.mu.Unlock()
	for id, it := range repo.items {
		if _, ok := byExternal[it.Item.ExternalID]; ok {
			byExternal[it.Item.ExternalID] = id
		}
	}
	for i := range rows {
		ids = append(ids, byExternal[prefix+string(rune('0'+i))])
	}
	return ids, urls
}

// importBatch queues ids as one batch, as a user's ImportItems call does.
func importBatch(t *testing.T, svc *services.ImportService, jobID int, ids []int) {
	t.Helper()
	res, err := svc.ImportItems(context.Background(), importUser, jobID, ids)
	require.NoError(t, err)
	require.Equal(t, len(ids), res.Queued)
}

// statusOf is a row's import status, or "" while it has none.
func statusOf(repo *fakeImportRepo, id int) domain.ImportItemStatus {
	repo.mu.Lock()
	defer repo.mu.Unlock()
	if st := repo.items[id].Item.ImportStatus; st != nil {
		return *st
	}
	return ""
}

func assertAllStatus(t *testing.T, repo *fakeImportRepo, ids []int, want domain.ImportItemStatus) {
	t.Helper()
	for _, id := range ids {
		assert.Equal(t, want, statusOf(repo, id), "row %d", id)
	}
}

// opener returns a func that closes gate once; use it both in the test body and
// as a t.Cleanup, so a failed test never leaves creator calls blocked.
func opener(gate chan struct{}) func() {
	var once sync.Once
	return func() { once.Do(func() { close(gate) }) }
}

// goSpawnDone is goSpawn that also closes the returned channel once the nth
// spawned func (counting from 1) has returned, so a test can wait for one
// batch while another is still running.
func goSpawnDone(wg *sync.WaitGroup, nth int32) (services.ImportServiceOption, <-chan struct{}) {
	var spawned atomic.Int32
	done := make(chan struct{})
	opt := services.WithImportSpawn(func(f func()) {
		n := spawned.Add(1)
		wg.Add(1)
		go func() {
			defer wg.Done()
			f()
			if n == nth {
				close(done)
			}
		}()
	})
	return opt, done
}

// shortBatchTimeout is the batch time limit the timeout tests set. Rows that
// must finish inside it are fake and take microseconds; the rest wait for it.
const shortBatchTimeout = 300 * time.Millisecond

// cutShortDetail is what a row shows after its batch ran out of time or was
// stopped while the row was importing.
const cutShortDetail = "The import was cut short. Select it again to retry."

// setOf is the set of the given urls, for fakeCreator.holdUntilDone.
func setOf(urls ...string) map[string]bool {
	set := make(map[string]bool, len(urls))
	for _, u := range urls {
		set[u] = true
	}
	return set
}

// errorOf is a row's import error text, or "" while it has none.
func errorOf(repo *fakeImportRepo, id int) string {
	repo.mu.Lock()
	defer repo.mu.Unlock()
	if msg := repo.items[id].Item.ImportError; msg != nil {
		return *msg
	}
	return ""
}

// progressNow is the import's progress as a new subscriber sees it.
func progressNow(t *testing.T, svc *services.ImportService, jobID int) domain.ImportProgress {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch, err := svc.SubscribeImportProgress(ctx, importUser, jobID)
	require.NoError(t, err)
	select {
	case p := <-ch:
		return p
	case <-time.After(waitFor):
		require.Fail(t, "no progress snapshot")
		return domain.ImportProgress{}
	}
}

func indexOf(t *testing.T, list []string, want string) int {
	t.Helper()
	for i, s := range list {
		if s == want {
			return i
		}
	}
	require.Failf(t, "not found", "%q not in %v", want, list)
	return -1
}

// --- tests --------------------------------------------------------------------

func TestImportService_RowLimiter_CapsRowsAcrossBatches(t *testing.T) {
	repo := newFakeImportRepo()
	job := approvedJob(t, repo)
	lim := limiter.New("rows", 2)
	creator := &fakeCreator{gate: make(chan struct{})}
	openGate := opener(creator.gate)
	t.Cleanup(openGate)
	var wg sync.WaitGroup
	svc := newImportService(repo, nil, nil, creator, services.WithImportRowLimiter(lim), goSpawn(&wg))

	var all []int
	for _, prefix := range []string{"a", "b", "c"} {
		ids, _ := seedRows(t, repo, job.ID, prefix, 4)
		importBatch(t, svc, job.ID, ids)
		all = append(all, ids...)
	}

	// Each batch starts two workers (the cap), so six rows contend for two slots.
	require.Eventually(t, func() bool { return lim.Stats() == limiter.Stats{InFlight: 2, Waiting: 4} }, waitFor, tick)
	assert.Equal(t, 2, creator.inFlightNow(), "only the rows holding a slot reach the creator")

	openGate()
	wg.Wait()
	assert.LessOrEqual(t, creator.peakInFlight(), 2, "the cap holds across batches")
	assertAllStatus(t, repo, all, domain.ImportItemStatusImported)
	assert.Equal(t, limiter.Stats{}, lim.Stats(), "every slot is given back")
}

func TestImportService_RowLimiter_InterleavesBatches(t *testing.T) {
	repo := newFakeImportRepo()
	job := approvedJob(t, repo)
	lim := limiter.New("rows", 1)
	creator := &fakeCreator{gate: make(chan struct{})}
	openGate := opener(creator.gate)
	t.Cleanup(openGate)
	var wg sync.WaitGroup
	svc := newImportService(repo, nil, nil, creator, services.WithImportRowLimiter(lim), goSpawn(&wg))

	aIDs, aURLs := seedRows(t, repo, job.ID, "a", 6)
	importBatch(t, svc, job.ID, aIDs)
	require.Eventually(t, func() bool { return creator.inFlightNow() == 1 }, waitFor, tick, "batch A's first row holds the only slot")
	bIDs, bURLs := seedRows(t, repo, job.ID, "b", 1)
	importBatch(t, svc, job.ID, bIDs)
	require.Eventually(t, func() bool { return lim.Stats() == limiter.Stats{InFlight: 1, Waiting: 1} }, waitFor, tick, "batch B's row waits its turn")

	openGate()
	wg.Wait()
	assert.Less(t, indexOf(t, creator.youtube, bURLs[0]), indexOf(t, creator.youtube, aURLs[5]),
		"a short batch does not wait for a long one to finish")
	assertAllStatus(t, repo, append(aIDs, bIDs...), domain.ImportItemStatusImported)
}

func TestImportService_NoLimiter_KeepsFourWorkersPerBatch(t *testing.T) {
	repo := newFakeImportRepo()
	job := approvedJob(t, repo)
	creator := &fakeCreator{gate: make(chan struct{})}
	openGate := opener(creator.gate)
	t.Cleanup(openGate)
	var wg sync.WaitGroup
	svc := newImportService(repo, nil, nil, creator, goSpawn(&wg))

	ids, _ := seedRows(t, repo, job.ID, "a", 8)
	importBatch(t, svc, job.ID, ids)

	require.Eventually(t, func() bool { return creator.inFlightNow() == 4 }, waitFor, tick, "four rows import at once")
	// A fifth worker would join within microseconds; give it far longer than that.
	assert.Never(t, func() bool { return creator.inFlightNow() > 4 }, 300*time.Millisecond, tick)

	openGate()
	wg.Wait()
	assert.Equal(t, 4, creator.peakInFlight())
	assertAllStatus(t, repo, ids, domain.ImportItemStatusImported)
}

// RF1: a shutdown ends rows that are only waiting for a slot; they stay queued
// for RecoverInterrupted and never reach the creator.
func TestImportService_RowLimiter_ShutdownLeavesWaitingRowsQueued(t *testing.T) {
	repo := newFakeImportRepo()
	job := approvedJob(t, repo)
	lim := limiter.New("rows", 1)
	creator := &fakeCreator{gate: make(chan struct{})}
	openGate := opener(creator.gate)
	t.Cleanup(openGate)
	bg, shutdown := context.WithCancel(context.Background())
	t.Cleanup(shutdown)
	var wg sync.WaitGroup
	spawn, bDone := goSpawnDone(&wg, 2)
	svc := newImportService(repo, nil, nil, creator, services.WithImportRowLimiter(lim), services.WithImportBackground(bg), spawn)

	aIDs, aURLs := seedRows(t, repo, job.ID, "a", 1)
	importBatch(t, svc, job.ID, aIDs)
	require.Eventually(t, func() bool { return creator.inFlightNow() == 1 }, waitFor, tick, "batch A's row holds the only slot")
	bIDs, _ := seedRows(t, repo, job.ID, "b", 2)
	importBatch(t, svc, job.ID, bIDs)
	require.Eventually(t, func() bool { return lim.Stats() == limiter.Stats{InFlight: 1, Waiting: 1} }, waitFor, tick, "batch B waits for a slot")

	shutdown()
	select {
	case <-bDone:
	case <-time.After(waitFor):
		require.Fail(t, "batch B did not return after shutdown while its rows waited for a slot")
	}
	assert.Equal(t, 1, creator.inFlightNow(), "only batch A's row is in the creator")
	assertAllStatus(t, repo, bIDs, domain.ImportItemStatusQueued)
	assert.Zero(t, repo.failQueuedCallCount(), "a shutdown leaves rows to RecoverInterrupted instead of failing them")

	openGate()
	wg.Wait()
	assert.Equal(t, aURLs, creator.youtube, "the creator never saw batch B's rows")
	assertAllStatus(t, repo, aIDs, domain.ImportItemStatusImported)
	assertAllStatus(t, repo, bIDs, domain.ImportItemStatusQueued)
	assert.Equal(t, limiter.Stats{}, lim.Stats(), "every slot is given back")
}

// RF4: a batch that runs out of time while its rows wait for a slot fails
// them, so the user can queue them again at once instead of after a restart.
// Batch A's row holds the only slot throughout; batch B's rows never get one.
func TestImportService_RowLimiter_BatchTimeoutFailsRowsWaitingForASlot(t *testing.T) {
	repo := newFakeImportRepo()
	job := approvedJob(t, repo)
	lim := limiter.New("rows", 1)
	creator := &fakeCreator{gate: make(chan struct{})}
	openGate := opener(creator.gate)
	t.Cleanup(openGate)
	var wg sync.WaitGroup
	spawn, bDone := goSpawnDone(&wg, 2)
	svc := newImportService(repo, nil, nil, creator, services.WithImportRowLimiter(lim), services.WithImportBatchTimeout(shortBatchTimeout), spawn)

	aIDs, aURLs := seedRows(t, repo, job.ID, "a", 1)
	importBatch(t, svc, job.ID, aIDs)
	require.Eventually(t, func() bool { return creator.inFlightNow() == 1 }, waitFor, tick, "batch A's row holds the only slot")
	bIDs, _ := seedRows(t, repo, job.ID, "b", 2)
	importBatch(t, svc, job.ID, bIDs)

	select {
	case <-bDone:
	case <-time.After(waitFor):
		require.Fail(t, "batch B did not return after its time ran out while its rows waited for a slot")
	}
	assertAllStatus(t, repo, bIDs, domain.ImportItemStatusFailed)
	for _, id := range bIDs {
		assert.Equal(t, cutShortDetail, errorOf(repo, id), "row %d", id)
	}
	assert.Equal(t, 1, creator.inFlightNow(), "only batch A's row is in the creator")

	openGate()
	wg.Wait()
	assert.Equal(t, aURLs, creator.youtube, "the creator never saw batch B's rows")
	assertAllStatus(t, repo, aIDs, domain.ImportItemStatusImported)
	assert.Equal(t, limiter.Stats{}, lim.Stats(), "every slot is given back")
}

// Rows a batch never handed to a worker are failed with the rest, and the
// progress count ends at the batch's total with them counted as failed.
func TestImportService_BatchTimeoutFailsUnreachedRowsAndCompletesProgress(t *testing.T) {
	repo := newFakeImportRepo()
	job := approvedJob(t, repo)
	lim := limiter.New("rows", 1)
	creator := &fakeCreator{}
	var wg sync.WaitGroup
	svc := newImportService(repo, nil, nil, creator, services.WithImportRowLimiter(lim), services.WithImportBatchTimeout(shortBatchTimeout), goSpawn(&wg))

	// One worker takes the rows in order: rows 0 and 1 import, row 2 is still
	// in the creator when the time runs out, rows 3 and 4 are never reached.
	ids, urls := seedRows(t, repo, job.ID, "a", 5)
	creator.holdUntilDone = setOf(urls[2])
	watcherCtx, stopWatching := context.WithCancel(context.Background())
	defer stopWatching()
	watch, err := svc.SubscribeImportProgress(watcherCtx, importUser, job.ID)
	require.NoError(t, err)
	importBatch(t, svc, job.ID, ids)
	wg.Wait()

	// The snapshot that says the batch has stopped already carries the swept rows.
	var last domain.ImportProgress
	deadline := time.After(waitFor)
	for !(!last.Running && last.Total == 5) {
		select {
		case last = <-watch:
		case <-deadline:
			require.Fail(t, "no stopped snapshot for the batch", "last seen: %+v", last)
		}
	}
	assert.Equal(t, 5, last.Done, "the stopped snapshot counts every row, swept ones included")
	assert.Equal(t, 3, last.Failed)

	assertAllStatus(t, repo, ids[:2], domain.ImportItemStatusImported)
	assertAllStatus(t, repo, ids[2:], domain.ImportItemStatusFailed)
	for _, id := range ids[2:] {
		assert.Equal(t, cutShortDetail, errorOf(repo, id), "row %d", id)
	}
	assert.Equal(t, urls[:2], creator.youtube, "row 2 never finished a create and rows 3 and 4 never reached the creator")
	assert.Zero(t, creator.inFlightNow())
	assert.Equal(t, limiter.Stats{}, lim.Stats(), "every slot is given back")

	p := progressNow(t, svc, job.ID)
	assert.False(t, p.Running)
	assert.Equal(t, 5, p.Total)
	assert.Equal(t, 5, p.Done, "every row is accounted for")
	assert.Equal(t, 2, p.Imported)
	assert.Equal(t, 3, p.Failed)
}

// A row failed by a timeout is not stuck: selecting it again queues it.
func TestImportService_BatchTimeoutRowsCanBeQueuedAgain(t *testing.T) {
	repo := newFakeImportRepo()
	job := approvedJob(t, repo)
	creator := &fakeCreator{}
	var wg sync.WaitGroup
	svc := newImportService(repo, nil, nil, creator, services.WithImportRowLimiter(limiter.New("rows", 1)), services.WithImportBatchTimeout(shortBatchTimeout), goSpawn(&wg))

	ids, urls := seedRows(t, repo, job.ID, "a", 3)
	creator.holdUntilDone = setOf(urls...)
	importBatch(t, svc, job.ID, ids)
	wg.Wait()
	assertAllStatus(t, repo, ids, domain.ImportItemStatusFailed)

	res, err := svc.ImportItems(context.Background(), importUser, job.ID, ids)
	require.NoError(t, err)
	assert.Equal(t, domain.ImportBatchResult{Queued: 3}, *res, "all three are queued again, none stuck as already queued")
	wg.Wait()
}

// If the database refuses the sweep, the batch still ends: the rows stay
// queued for RecoverInterrupted and the count stops at what was recorded.
func TestImportService_BatchTimeoutSweepErrorStillEndsTheBatch(t *testing.T) {
	repo := newFakeImportRepo()
	repo.failQueuedErr = errors.New("db down")
	job := approvedJob(t, repo)
	creator := &fakeCreator{}
	var wg sync.WaitGroup
	svc := newImportService(repo, nil, nil, creator, services.WithImportRowLimiter(limiter.New("rows", 1)), services.WithImportBatchTimeout(shortBatchTimeout), goSpawn(&wg))

	ids, urls := seedRows(t, repo, job.ID, "a", 3)
	creator.holdUntilDone = setOf(urls[0])
	importBatch(t, svc, job.ID, ids)
	wg.Wait()

	assert.Equal(t, 1, repo.failQueuedCallCount())
	assert.Equal(t, domain.ImportItemStatusFailed, statusOf(repo, ids[0]), "the row that was importing is failed by its own outcome")
	assertAllStatus(t, repo, ids[1:], domain.ImportItemStatusQueued)
	p := progressNow(t, svc, job.ID)
	assert.False(t, p.Running, "the batch ended")
	assert.Equal(t, 1, p.Done)
	assert.Equal(t, 1, p.Failed)
}

// An outcome the database refused to save leaves its row queued although the
// progress already counted it; the sweep fails that row too, and the count must
// not pass the batch's total.
func TestImportService_BatchTimeoutDoesNotCountAnUnsavedOutcomeTwice(t *testing.T) {
	repo := newFakeImportRepo()
	repo.recordErr = errors.New("db down")
	job := approvedJob(t, repo)
	creator := &fakeCreator{}
	var wg sync.WaitGroup
	svc := newImportService(repo, nil, nil, creator, services.WithImportRowLimiter(limiter.New("rows", 1)), services.WithImportBatchTimeout(shortBatchTimeout), goSpawn(&wg))

	// Row 0 creates but its outcome is not saved, row 1 is in the creator when the
	// time runs out (and its failure is not saved either), row 2 is never reached.
	ids, urls := seedRows(t, repo, job.ID, "a", 3)
	creator.holdUntilDone = setOf(urls[1])
	importBatch(t, svc, job.ID, ids)
	wg.Wait()

	assertAllStatus(t, repo, ids, domain.ImportItemStatusFailed) // no outcome was saved, so the sweep failed all three
	p := progressNow(t, svc, job.ID)
	assert.Equal(t, 3, p.Total)
	assert.Equal(t, 3, p.Done, "the count ends at the batch's total, not past it")
	assert.Equal(t, 1, p.Imported)
	assert.Equal(t, 2, p.Failed)
}

// A row this batch finished and the user then selected again belongs to the
// batch that re-queued it: the first batch's sweep must not fail it from under
// that batch. Batch 1 fails row 0 at once, and its deadline strands row 5; the
// user re-queues row 0 in batch 2, which holds it in the creator when batch 1's
// time runs out.
func TestImportService_BatchTimeoutSweepLeavesARowAnotherBatchRequeued(t *testing.T) {
	repo := newFakeImportRepo()
	job := approvedJob(t, repo)
	creator := &fakeCreator{gate: make(chan struct{})}
	openGate := opener(creator.gate)
	t.Cleanup(openGate)
	var wg sync.WaitGroup
	spawn, firstDone := goSpawnDone(&wg, 1)
	svc := newImportService(repo, nil, nil, creator, services.WithImportBatchTimeout(shortBatchTimeout), spawn)

	// Four workers (the default cap): row 0 fails, rows 1 to 4 are held until the
	// time runs out (row 4 by the worker that finished row 0), row 5 is never reached.
	ids, urls := seedRows(t, repo, job.ID, "a", 6)
	creator.failFirstThenGate = setOf(urls[0])
	creator.holdUntilDone = setOf(urls[1:5]...)
	importBatch(t, svc, job.ID, ids)
	require.Eventually(t, func() bool { return statusOf(repo, ids[0]) == domain.ImportItemStatusFailed }, waitFor, tick, "row 0 failed")
	importBatch(t, svc, job.ID, ids[:1])
	require.Eventually(t, func() bool { return creator.inFlightNow() == 5 }, waitFor, tick, "rows 1 to 4 and batch 2's row 0 are in the creator")

	select {
	case <-firstDone:
	case <-time.After(waitFor):
		require.Fail(t, "batch 1 did not end when its time ran out")
	}
	assert.Equal(t, domain.ImportItemStatusQueued, statusOf(repo, ids[0]), "row 0 is batch 2's, so batch 1 leaves it alone")
	assert.Equal(t, domain.ImportItemStatusFailed, statusOf(repo, ids[5]), "row 5 was batch 1's and never reached")
	assert.Equal(t, cutShortDetail, errorOf(repo, ids[5]))

	openGate()
	wg.Wait()
	assert.Equal(t, domain.ImportItemStatusImported, statusOf(repo, ids[0]), "batch 2 finished row 0")
}

// When every row of a batch has an outcome by the time it ends, there is
// nothing to sweep and the database is not asked.
func TestImportService_BatchTimeoutWithEveryRowFinishedDoesNotSweep(t *testing.T) {
	repo := newFakeImportRepo()
	job := approvedJob(t, repo)
	creator := &fakeCreator{}
	var wg sync.WaitGroup
	svc := newImportService(repo, nil, nil, creator, services.WithImportBatchTimeout(shortBatchTimeout), goSpawn(&wg))

	// Both rows are in the creator (default cap of four) when the time runs out
	// and each fails with its own outcome.
	ids, urls := seedRows(t, repo, job.ID, "a", 2)
	creator.holdUntilDone = setOf(urls...)
	importBatch(t, svc, job.ID, ids)
	wg.Wait()

	assertAllStatus(t, repo, ids, domain.ImportItemStatusFailed)
	assert.Zero(t, repo.failQueuedCallCount())
}

// A batch that finishes inside its time never sweeps.
func TestImportService_BatchWithinTimeDoesNotSweep(t *testing.T) {
	repo := newFakeImportRepo()
	job := approvedJob(t, repo)
	var wg sync.WaitGroup
	svc := newImportService(repo, nil, nil, &fakeCreator{}, services.WithImportBatchTimeout(time.Minute), goSpawn(&wg))

	ids, _ := seedRows(t, repo, job.ID, "a", 3)
	importBatch(t, svc, job.ID, ids)
	wg.Wait()

	assertAllStatus(t, repo, ids, domain.ImportItemStatusImported)
	assert.Zero(t, repo.failQueuedCallCount())
}

// --- listing slots ------------------------------------------------------------

// holdLister is a source lister that counts the List calls in flight and can
// hold them. fakeLister's plain counters are not safe for listings that run at
// once, and it cannot block inside List.
type holdLister struct {
	gate chan struct{} // set before the service runs; when set, List waits for it to close (or its context to end)

	mu        sync.Mutex
	listed    []string        // resolved ids, in the order List was called
	timeLeft  []time.Duration // time left on each List call's context when it began
	inFlight  int
	peak      int
	callCount int
}

func (l *holdLister) Resolve(_ context.Context, ref string) (*portservices.ResolvedImportSource, error) {
	return &portservices.ResolvedImportSource{ID: "id-" + ref, Title: "Title " + ref, URL: "https://example.com/" + ref}, nil
}

func (l *holdLister) List(ctx context.Context, rs portservices.ResolvedImportSource, _ *domain.ImportPersonRole, emit portservices.ImportBatchFunc) error {
	l.mu.Lock()
	l.callCount++
	l.listed = append(l.listed, rs.ID)
	if deadline, ok := ctx.Deadline(); ok {
		l.timeLeft = append(l.timeLeft, time.Until(deadline))
	}
	l.inFlight++
	l.peak = max(l.peak, l.inFlight)
	l.mu.Unlock()
	defer func() {
		l.mu.Lock()
		l.inFlight--
		l.mu.Unlock()
	}()

	if l.gate != nil {
		select {
		case <-l.gate:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	return emit([]*domain.ImportItemWithDetails{candidate(rs.ID, domain.ContentTypeYouTubeVideo)})
}

func (l *holdLister) inFlightNow() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.inFlight
}

func (l *holdLister) peakInFlight() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.peak
}

func (l *holdLister) calls() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.callCount
}

func (l *holdLister) timeLeftOnEachCall() []time.Duration {
	l.mu.Lock()
	defer l.mu.Unlock()
	return append([]time.Duration(nil), l.timeLeft...)
}

// newListingService builds a service whose only lister is lister, on a fixed
// clock. Unlike newImportService it does not set a spawner: listing tests pass
// goSpawn so sources list at once.
func newListingService(repo *fakeImportRepo, lister *holdLister, opts ...services.ImportServiceOption) *services.ImportService {
	listers := map[domain.ImportSourceType]portservices.ImportSourceLister{domain.ImportSourceYouTubeChannel: lister}
	return services.NewImportService(repo, listers, &fakeCreator{}, append([]services.ImportServiceOption{fixedNow}, opts...)...)
}

// listingJob has an admin create an import with one YouTube source per ref,
// which starts listing every source.
func listingJob(t *testing.T, svc *services.ImportService, refs ...string) *domain.ImportJob {
	t.Helper()
	job, err := svc.CreateImportJob(context.Background(), importAdmin, domain.CreateImportJobInput{Name: "x", Sources: ytSources(refs...)})
	require.NoError(t, err)
	require.Len(t, job.Sources, len(refs))
	return job
}

// sourceState is a source's saved status and detail.
func sourceState(repo *fakeImportRepo, id int) (domain.ImportSourceStatus, string) {
	repo.mu.Lock()
	defer repo.mu.Unlock()
	src := repo.source(id)
	detail := ""
	if src.StatusDetail != nil {
		detail = *src.StatusDetail
	}
	return src.Status, detail
}

// waitDone waits for the background work counted in wg, failing the test
// instead of hanging when it never finishes.
func waitDone(t *testing.T, wg *sync.WaitGroup) {
	t.Helper()
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(waitFor):
		require.Fail(t, "background work did not finish")
	}
}

// holdSlot takes the limiter's only slot for the test, so every source waits.
// The slot is given back when the test ends if the test has not done so.
func holdSlot(t *testing.T, lim *limiter.Limiter) (release func()) {
	t.Helper()
	release, err := lim.Acquire(context.Background())
	require.NoError(t, err)
	t.Cleanup(release)
	return release
}

func TestImportService_ListingLimiter_CapsConcurrentListings(t *testing.T) {
	repo := newFakeImportRepo()
	lim := limiter.New("listings", 1)
	lister := &holdLister{gate: make(chan struct{})}
	openGate := opener(lister.gate)
	t.Cleanup(openGate)
	var wg sync.WaitGroup
	svc := newListingService(repo, lister, services.WithImportListingLimiter(lim), goSpawn(&wg))

	job := listingJob(t, svc, "a", "b", "c")

	// All three sources are listing, but one holds the slot and two wait for it.
	require.Eventually(t, func() bool {
		return lim.Stats() == limiter.Stats{InFlight: 1, Waiting: 2} && lister.inFlightNow() == 1
	}, waitFor, tick)

	openGate()
	waitDone(t, &wg)
	assert.Equal(t, 3, lister.calls())
	assert.Equal(t, 1, lister.peakInFlight(), "one listing at a time")
	for _, src := range job.Sources {
		status, detail := sourceState(repo, src.ID)
		assert.Equal(t, domain.ImportSourceStatusReady, status, "source %d: %s", src.ID, detail)
	}
	assert.Equal(t, limiter.Stats{}, lim.Stats(), "every slot is given back")
}

// RF3: a source waiting for a slot has not started listing, so its 30-minute
// budget starts when it gets the slot, not before.
func TestImportService_ListingLimiter_TimeoutStartsAfterSlot(t *testing.T) {
	repo := newFakeImportRepo()
	lim := limiter.New("listings", 1)
	lister := &holdLister{}
	var wg sync.WaitGroup
	svc := newListingService(repo, lister, services.WithImportListingLimiter(lim), goSpawn(&wg))

	release := holdSlot(t, lim)
	listingJob(t, svc, "a")
	require.Eventually(t, func() bool { return lim.Stats() == limiter.Stats{InFlight: 1, Waiting: 1} }, waitFor, tick, "the source waits for the slot")

	// The one intentional timing in these tests: the source waits at least this
	// long, and none of it may come off the budget.
	time.Sleep(300 * time.Millisecond)
	release()
	waitDone(t, &wg)

	left := lister.timeLeftOnEachCall()
	require.Len(t, left, 1)
	assert.Greater(t, left[0], 30*time.Minute-150*time.Millisecond, "the budget was spent while waiting for the slot")
}

// RF1: a shutdown ends sources that are only waiting for a slot. They are
// saved as failed, like a listing the shutdown cut short, and never list.
func TestImportService_ListingLimiter_ShutdownFailsWaitingSource(t *testing.T) {
	repo := newFakeImportRepo()
	lim := limiter.New("listings", 1)
	lister := &holdLister{}
	bg, shutdown := context.WithCancel(context.Background())
	t.Cleanup(shutdown)
	var wg sync.WaitGroup
	svc := newListingService(repo, lister, services.WithImportListingLimiter(lim), services.WithImportBackground(bg), goSpawn(&wg))

	holdSlot(t, lim)
	job := listingJob(t, svc, "a")
	require.Eventually(t, func() bool { return lim.Stats() == limiter.Stats{InFlight: 1, Waiting: 1} }, waitFor, tick, "the source waits for the slot")

	shutdown()
	waitDone(t, &wg)

	status, detail := sourceState(repo, job.Sources[0].ID)
	assert.Equal(t, domain.ImportSourceStatusFailed, status)
	assert.Contains(t, detail, "server stopped")
	assert.Zero(t, lister.calls(), "the lister never ran")
	assert.Equal(t, limiter.Stats{InFlight: 1}, lim.Stats(), "the waiter gave up without taking a slot")

	// The sheet must not show the source as listing for ever.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch, err := svc.SubscribeListingProgress(ctx, importAdmin, job.ID)
	require.NoError(t, err)
	p := listingUntil(t, ch, func(p domain.ImportListingProgress) bool { return len(p.Sources) == 1 })
	assert.False(t, p.Listing)
	assert.Equal(t, domain.ImportSourceStatusFailed, p.Sources[0].Status)
}

// A source waiting for a slot is already LISTING: no new status is introduced.
func TestImportService_ListingLimiter_SheetShowsListingWhileWaiting(t *testing.T) {
	repo := newFakeImportRepo()
	lim := limiter.New("listings", 1)
	lister := &holdLister{}
	var wg sync.WaitGroup
	svc := newListingService(repo, lister, services.WithImportListingLimiter(lim), goSpawn(&wg))

	release := holdSlot(t, lim)
	job := listingJob(t, svc, "a")
	srcID := job.Sources[0].ID
	require.Eventually(t, func() bool { return lim.Stats() == limiter.Stats{InFlight: 1, Waiting: 1} }, waitFor, tick, "the source waits for the slot")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch, err := svc.SubscribeListingProgress(ctx, importAdmin, job.ID)
	require.NoError(t, err)
	p := listingUntil(t, ch, func(p domain.ImportListingProgress) bool { return len(p.Sources) == 1 })
	assert.True(t, p.Listing)
	assert.Equal(t, []domain.ImportSourceListingProgress{{SourceID: srcID, Status: domain.ImportSourceStatusListing}}, p.Sources)
	status, _ := sourceState(repo, srcID)
	assert.Equal(t, domain.ImportSourceStatusListing, status, "the saved status is LISTING too")
	assert.Zero(t, lister.calls(), "it has not started listing")

	release()
	waitDone(t, &wg)
	status, _ = sourceState(repo, srcID)
	assert.Equal(t, domain.ImportSourceStatusReady, status)
}
