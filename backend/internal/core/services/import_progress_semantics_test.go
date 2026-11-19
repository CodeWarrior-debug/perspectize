package services

import (
	"context"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// These tests pin when the import progress tracker tells subscribers about a
// change, and where a snapshot's time comes from. They go through the tracker's
// own methods and the snapshots it publishes only, so they hold however the
// tracker is built underneath.
//
// Where a test needs "no publish", the interval is time.Hour whenever the
// scenario allows, so no tick can fire. Where it needs a tick to publish, it
// waits with next's two-second allowance, far above the tick interval.

// drainImportProgress discards the snapshots already waiting on ch, without blocking.
func drainImportProgress(ch <-chan domain.ImportProgress) {
	for {
		select {
		case _, ok := <-ch:
			if !ok {
				return
			}
		default:
			return
		}
	}
}

// requireNoImportProgress fails the test if a snapshot arrives on ch, or ch is
// closed, within d.
func requireNoImportProgress(t *testing.T, ch <-chan domain.ImportProgress, d time.Duration) {
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

// Counting an outcome only marks the import as changed; the next tick of a
// running import is what delivers it. The test never ends the batch, so the
// snapshot can only have come from the tick.
func TestImportProgress_RecordPublishesOnTickWhileRunning(t *testing.T) {
	tr := newImportProgressTracker(30*time.Millisecond, time.Now)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch := tr.subscribe(ctx, 1)
	next(t, ch) // idle snapshot

	tr.begin(1, 2)
	t.Cleanup(func() { tr.end(1) }) // lets the import's ticker stop
	started := next(t, ch)
	require.True(t, started.Running)
	require.Equal(t, 0, started.Done)

	tr.record(1, domain.ImportItemStatusImported)
	got := next(t, ch)
	assert.Equal(t, 1, got.Done)
	assert.Equal(t, 1, got.Imported)
	assert.Equal(t, 2, got.Total)
	assert.True(t, got.Running, "the batch has not ended")
}

// Ending one of several overlapping batches changes nothing subscribers can
// see, so it publishes nothing; only the last end announces the finished import.
// With a one-hour interval the only way to receive a snapshot is an immediate
// publish.
func TestImportProgress_EndWithBatchesRemainingDoesNotPublish(t *testing.T) {
	tr := newImportProgressTracker(time.Hour, time.Now)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch := tr.subscribe(ctx, 2)
	next(t, ch) // idle snapshot

	tr.begin(2, 3)
	tr.begin(2, 4)
	both := next(t, ch)
	require.True(t, both.Running)
	require.Equal(t, 7, both.Total)
	drainImportProgress(ch)

	tr.end(2) // one batch is still running
	requireNoImportProgress(t, ch, 100*time.Millisecond)

	tr.end(2)
	final := next(t, ch)
	assert.False(t, final.Running)
	assert.Equal(t, 7, final.Total)
}

// An outcome for an import with no running batch is counted but announced to
// nobody: there is no ticker for it, and counting does not publish by itself.
func TestImportProgress_RecordWithNoRunningBatchPublishesNothing(t *testing.T) {
	tr := newImportProgressTracker(30*time.Millisecond, time.Now)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch := tr.subscribe(ctx, 3)
	idle := next(t, ch)
	require.False(t, idle.Running)

	tr.record(3, domain.ImportItemStatusImported) // job 3 was never begun
	requireNoImportProgress(t, ch, 200*time.Millisecond)
}

// A snapshot's UpdatedAt is the injected clock's reading, in UTC, whatever zone
// the clock reports it in. A fixed non-UTC instant tells it apart from the
// wall clock and from an unconverted time.
func TestImportProgress_UpdatedAtIsInjectedClockInUTC(t *testing.T) {
	instant := time.Date(2026, 11, 16, 9, 30, 0, 0, time.FixedZone("UTC+5", 5*60*60))
	tr := newImportProgressTracker(time.Hour, func() time.Time { return instant })
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch := tr.subscribe(ctx, 4)

	requireClockInstantInUTC := func(t *testing.T, got time.Time) {
		t.Helper()
		assert.True(t, instant.Equal(got), "UpdatedAt %v is not the clock's instant %v", got, instant)
		assert.Same(t, time.UTC, got.Location(), "UpdatedAt is not in UTC")
	}

	requireClockInstantInUTC(t, next(t, ch).UpdatedAt) // the snapshot a new subscriber gets

	tr.begin(4, 1)
	requireClockInstantInUTC(t, next(t, ch).UpdatedAt) // a published snapshot
}
