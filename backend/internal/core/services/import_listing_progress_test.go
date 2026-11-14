package services

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// nextListing receives the next listing snapshot, failing the test if none arrives.
func nextListing(t *testing.T, ch <-chan domain.ImportListingProgress) domain.ImportListingProgress {
	t.Helper()
	select {
	case p, ok := <-ch:
		require.True(t, ok, "channel closed")
		return p
	case <-time.After(2 * time.Second):
		t.Fatal("no listing progress published")
		return domain.ImportListingProgress{}
	}
}

func TestListingTracker_ImmediateSnapshotOnSubscribe(t *testing.T) {
	tr := newListingTracker(time.Hour, time.Now)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	ch := tr.subscribe(ctx, 7)
	idle := nextListing(t, ch)
	assert.Equal(t, 7, idle.JobID)
	assert.False(t, idle.Listing)
	assert.Empty(t, idle.Sources)
	assert.False(t, idle.UpdatedAt.IsZero())

	tr.begin(7, 3)
	listing := nextListing(t, ch)
	assert.True(t, listing.Listing)
	assert.Equal(t, []domain.ImportSourceListingProgress{
		{SourceID: 3, Staged: 0, Batches: 0, Status: domain.ImportSourceStatusListing},
	}, listing.Sources)
}

func TestListingTracker_ThrottlesBurst(t *testing.T) {
	const interval = 50 * time.Millisecond
	tr := newListingTracker(interval, time.Now)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch := tr.subscribe(ctx, 1)
	nextListing(t, ch) // idle snapshot

	tr.begin(1, 1)
	started := nextListing(t, ch)
	assert.True(t, started.Listing)

	var mu sync.Mutex
	var got []domain.ImportListingProgress
	done := make(chan struct{})
	go func() {
		defer close(done)
		for p := range ch {
			mu.Lock()
			got = append(got, p)
			mu.Unlock()
			if !p.Listing {
				return
			}
		}
	}()

	start := time.Now()
	for i := range 1000 {
		tr.staged(1, 1, 1)
		if i%100 == 0 {
			time.Sleep(interval / 4) // spread the burst over a few intervals
		}
	}
	tr.finish(1, 1, domain.ImportSourceStatusReady)
	<-done
	elapsed := time.Since(start)

	mu.Lock()
	defer mu.Unlock()
	maxMessages := int(elapsed/interval) + 2 // ticks while listing, plus the final publish
	assert.LessOrEqual(t, len(got), maxMessages, "published at most once per interval")
	final := got[len(got)-1]
	assert.False(t, final.Listing)
	require.Len(t, final.Sources, 1)
	assert.Equal(t, 1000, final.Sources[0].Staged)
	assert.Equal(t, 1000, final.Sources[0].Batches)
	assert.Equal(t, domain.ImportSourceStatusReady, final.Sources[0].Status)
	for i := 1; i < len(got); i++ {
		assert.GreaterOrEqual(t, got[i].Sources[0].Staged, got[i-1].Sources[0].Staged, "counts only go up")
	}
}

func TestListingTracker_LatestWinsForSlowSubscriber(t *testing.T) {
	tr := newListingTracker(time.Millisecond, time.Now)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch := tr.subscribe(ctx, 2) // never read until the end

	tr.begin(2, 5)
	for range 3 {
		tr.staged(2, 5, 4)
		time.Sleep(5 * time.Millisecond) // let ticks publish into the full channel
	}
	tr.finish(2, 5, domain.ImportSourceStatusReady) // must not block on the unread subscriber

	p := nextListing(t, ch)
	assert.False(t, p.Listing, "only the newest snapshot is kept")
	require.Len(t, p.Sources, 1)
	assert.Equal(t, 12, p.Sources[0].Staged)
	assert.Equal(t, 3, p.Sources[0].Batches)
}

func TestListingTracker_FailedSourceEndsListing(t *testing.T) {
	tr := newListingTracker(time.Hour, time.Now)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch := tr.subscribe(ctx, 9)
	nextListing(t, ch)

	tr.begin(9, 21)
	tr.staged(9, 21, 2)
	tr.finish(9, 21, domain.ImportSourceStatusFailed)

	p := nextListing(t, ch)
	for p.Listing {
		p = nextListing(t, ch)
	}
	assert.False(t, p.Listing, "a failed source is no longer listing")
	require.Len(t, p.Sources, 1)
	assert.Equal(t, domain.ImportSourceStatusFailed, p.Sources[0].Status)
	assert.Equal(t, 2, p.Sources[0].Staged, "rows staged before the failure are kept")
}

func TestListingTracker_SourcesAreOrderedBySourceID(t *testing.T) {
	tr := newListingTracker(time.Hour, time.Now)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch := tr.subscribe(ctx, 4)
	nextListing(t, ch)

	// Sources arrive in listing order, not id order; each begin is read before the next.
	var p domain.ImportListingProgress
	for _, id := range []int{30, 10, 20} {
		tr.begin(4, id)
		p = nextListing(t, ch)
	}
	require.Len(t, p.Sources, 3)
	assert.Equal(t, 10, p.Sources[0].SourceID)
	assert.Equal(t, 20, p.Sources[1].SourceID)
	assert.Equal(t, 30, p.Sources[2].SourceID)
}

func TestListingTracker_UnsubscribeClosesTheChannel(t *testing.T) {
	tr := newListingTracker(time.Hour, time.Now)
	ctx, cancel := context.WithCancel(context.Background())
	ch := tr.subscribe(ctx, 8)
	nextListing(t, ch)
	cancel()
	select {
	case _, ok := <-ch:
		assert.False(t, ok)
	case <-time.After(time.Second):
		t.Fatal("not closed")
	}
	tr.mu.Lock()
	assert.Empty(t, tr.jobs[8].subs)
	tr.mu.Unlock()
	tr.begin(8, 1) // publishing after the subscriber left is safe
	tr.finish(8, 1, domain.ImportSourceStatusReady)
}
