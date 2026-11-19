package services_test

import (
	"context"
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

// expiringLimiter lets its first Acquire through and holds every later one
// until the caller's context ends, then reports a deadline, as a spent batch
// timeout does to rows still waiting for a slot.
type expiringLimiter struct {
	calls   atomic.Int32
	waiting chan struct{} // gets a value when an Acquire starts waiting (buffer 1; extras are dropped)
}

func (l *expiringLimiter) Capacity() int { return 1 }

func (l *expiringLimiter) Acquire(ctx context.Context) (func(), error) {
	if l.calls.Add(1) == 1 {
		return func() {}, nil
	}
	select {
	case l.waiting <- struct{}{}:
	default:
	}
	<-ctx.Done()
	return nil, context.DeadlineExceeded
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

	openGate()
	wg.Wait()
	assert.Equal(t, aURLs, creator.youtube, "the creator never saw batch B's rows")
	assertAllStatus(t, repo, aIDs, domain.ImportItemStatusImported)
	assertAllStatus(t, repo, bIDs, domain.ImportItemStatusQueued)
	assert.Equal(t, limiter.Stats{}, lim.Stats(), "every slot is given back")
}

// RF4: the batch timeout cannot be shortened from a test, so the batch context
// is ended by cancelling its parent and the limiter stub reports the end as a
// deadline, which is what a spent timeout looks like to a row still waiting.
func TestImportService_RowLimiter_BatchTimeoutWhileQueued(t *testing.T) {
	repo := newFakeImportRepo()
	job := approvedJob(t, repo)
	lim := &expiringLimiter{waiting: make(chan struct{}, 1)}
	creator := &fakeCreator{}
	bg, expire := context.WithCancel(context.Background())
	t.Cleanup(expire)
	var wg sync.WaitGroup
	spawn, bDone := goSpawnDone(&wg, 2)
	svc := newImportService(repo, nil, nil, creator, services.WithImportRowLimiter(lim), services.WithImportBackground(bg), spawn)

	aIDs, aURLs := seedRows(t, repo, job.ID, "a", 1)
	importBatch(t, svc, job.ID, aIDs)
	require.Eventually(t, func() bool { return statusOf(repo, aIDs[0]) == domain.ImportItemStatusImported }, waitFor, tick, "batch A's row got the slot")
	bIDs, _ := seedRows(t, repo, job.ID, "b", 2)
	importBatch(t, svc, job.ID, bIDs)
	select {
	case <-lim.waiting:
	case <-time.After(waitFor):
		require.Fail(t, "batch B's row never started waiting for a slot")
	}

	expire()
	select {
	case <-bDone:
	case <-time.After(waitFor):
		require.Fail(t, "batch B did not return after its context expired while its rows waited for a slot")
	}
	wg.Wait()
	assert.Equal(t, aURLs, creator.youtube, "the creator never saw batch B's rows")
	assertAllStatus(t, repo, bIDs, domain.ImportItemStatusQueued)
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
