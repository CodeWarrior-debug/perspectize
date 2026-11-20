package services

import (
	"context"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// These tests pin when the listing tracker tells subscribers about a change,
// and where a snapshot's time comes from. They go through the tracker's own
// methods and the snapshots it publishes only, so they hold however the
// tracker is built underneath.
//
// Where a test needs "no publish", the interval is time.Hour whenever the
// scenario allows, so no tick can fire. Where it needs a tick to publish, it
// waits with nextListing's two-second allowance, far above the tick interval.

// requireNoListingProgress fails the test if a snapshot arrives on ch, or ch is
// closed, within d.
func requireNoListingProgress(t *testing.T, ch <-chan domain.ImportListingProgress, d time.Duration) {
	t.Helper()
	select {
	case p, ok := <-ch:
		if !ok {
			t.Fatal("channel closed")
		}
		t.Fatalf("unexpected snapshot published: %+v", p)
	case <-time.After(d):
	}
}

// Staging a batch only marks the listing as changed; the next tick of a
// listing import delivers it. The test never finishes the source: it asserts
// that the updated progress arrives while the source is still listing, without
// waiting for finish.
func TestListing_StagedPublishesOnTickWhileListing(t *testing.T) {
	tr := newListingTracker(30*time.Millisecond, time.Now)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch := tr.subscribe(ctx, 1)
	nextListing(t, ch) // idle snapshot

	tr.begin(1, 5)
	t.Cleanup(func() { tr.finish(1, 5, domain.ImportSourceStatusReady) }) // lets the import's ticker stop
	started := nextListing(t, ch)
	require.True(t, started.Listing)
	require.Len(t, started.Sources, 1)
	require.Equal(t, 0, started.Sources[0].Staged)

	tr.staged(1, 5, 4)
	got := nextListing(t, ch)
	assert.True(t, got.Listing, "the source has not finished")
	require.Len(t, got.Sources, 1)
	assert.Equal(t, 5, got.Sources[0].SourceID)
	assert.Equal(t, 4, got.Sources[0].Staged)
	assert.Equal(t, 1, got.Sources[0].Batches)
	assert.Equal(t, domain.ImportSourceStatusListing, got.Sources[0].Status)
}

// A source starting and a source finishing each publish before the call
// returns, even while another source of the import is still listing. With a
// one-hour interval the only way to receive a snapshot is an immediate publish.
func TestListing_BeginAndFinishPublishAtOnce(t *testing.T) {
	tr := newListingTracker(time.Hour, time.Now)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch := tr.subscribe(ctx, 2)
	nextListing(t, ch) // idle snapshot

	tr.begin(2, 10)
	first := nextListing(t, ch)
	assert.True(t, first.Listing)
	require.Len(t, first.Sources, 1)

	tr.begin(2, 20)
	second := nextListing(t, ch)
	assert.True(t, second.Listing)
	require.Len(t, second.Sources, 2)

	tr.finish(2, 10, domain.ImportSourceStatusReady) // source 20 is still listing
	partial := nextListing(t, ch)
	assert.True(t, partial.Listing, "source 20 is still listing")
	require.Len(t, partial.Sources, 2)
	assert.Equal(t, domain.ImportSourceStatusReady, partial.Sources[0].Status)
	assert.Equal(t, domain.ImportSourceStatusListing, partial.Sources[1].Status)

	tr.finish(2, 20, domain.ImportSourceStatusFailed)
	last := nextListing(t, ch)
	assert.False(t, last.Listing)
	require.Len(t, last.Sources, 2)
	assert.Equal(t, domain.ImportSourceStatusFailed, last.Sources[1].Status)
}

// Rows staged for a source that is no longer listing are counted but announced
// to nobody: nothing is listing, so there is no ticker, and staging does not
// publish by itself. The source is finished before it was ever begun and
// subscribed to afterwards, so the only snapshot is the one every new
// subscriber gets, and no ticker was ever started that could still be winding
// down.
func TestListing_StagedWithNothingListingPublishesNothing(t *testing.T) {
	tr := newListingTracker(30*time.Millisecond, time.Now)
	tr.finish(3, 7, domain.ImportSourceStatusReady)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch := tr.subscribe(ctx, 3)
	idle := nextListing(t, ch)
	require.False(t, idle.Listing)
	require.Len(t, idle.Sources, 1)
	require.Equal(t, domain.ImportSourceStatusReady, idle.Sources[0].Status)

	tr.staged(3, 7, 5)
	requireNoListingProgress(t, ch, 200*time.Millisecond)
}

// A snapshot's UpdatedAt is the injected clock's reading, in UTC, whatever zone
// the clock reports it in. A fixed non-UTC instant tells it apart from the
// wall clock and from an unconverted time.
func TestListing_UpdatedAtIsInjectedClockInUTC(t *testing.T) {
	instant := time.Date(2026, 11, 16, 9, 30, 0, 0, time.FixedZone("UTC+5", 5*60*60))
	tr := newListingTracker(time.Hour, func() time.Time { return instant })
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch := tr.subscribe(ctx, 4)

	requireClockInstantInUTC := func(t *testing.T, got time.Time) {
		t.Helper()
		assert.True(t, instant.Equal(got), "UpdatedAt %v is not the clock's instant %v", got, instant)
		assert.Same(t, time.UTC, got.Location(), "UpdatedAt is not in UTC")
	}

	requireClockInstantInUTC(t, nextListing(t, ch).UpdatedAt) // the snapshot a new subscriber gets

	tr.begin(4, 1)
	requireClockInstantInUTC(t, nextListing(t, ch).UpdatedAt) // a published snapshot
}

func TestListingTracker_OnlyTheMostRecentFinishedListingsAreKept(t *testing.T) {
	tr := newListingTracker(5*time.Millisecond, time.Now)
	tr.maxIdle = 1
	for job := 1; job <= 3; job++ {
		tr.begin(job, 1)
		tr.finish(job, 1, domain.ImportSourceStatusReady)
		require.Eventually(t, func() bool { return !tr.isTicking(job) }, time.Second, time.Millisecond)
	}

	assert.False(t, tr.hasEntry(1))
	assert.False(t, tr.hasEntry(2))
	assert.True(t, tr.hasEntry(3), "the latest finished listing is kept")
}

func TestListingTracker_AListingInProgressIsNeverEvicted(t *testing.T) {
	tr := newListingTracker(5*time.Millisecond, time.Now)
	tr.maxIdle = 0
	tr.begin(1, 1)

	tr.begin(2, 1)
	tr.finish(2, 1, domain.ImportSourceStatusReady)
	require.Eventually(t, func() bool { return !tr.isTicking(2) }, time.Second, time.Millisecond)

	assert.True(t, tr.hasEntry(1), "import 1 still has a source listing")
	assert.False(t, tr.hasEntry(2))
	tr.finish(1, 1, domain.ImportSourceStatusReady)
}
