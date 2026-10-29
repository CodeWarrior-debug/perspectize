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

func next(t *testing.T, ch <-chan domain.ImportProgress) domain.ImportProgress {
	t.Helper()
	select {
	case p, ok := <-ch:
		require.True(t, ok, "channel closed")
		return p
	case <-time.After(2 * time.Second):
		t.Fatal("no progress published")
		return domain.ImportProgress{}
	}
}

func TestProgress_SubscriberGetsTheCurrentCountAtOnce(t *testing.T) {
	tr := newImportProgressTracker(time.Hour, time.Now)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	p := next(t, tr.subscribe(ctx, 7))
	assert.Equal(t, domain.ImportProgress{JobID: 7}, domain.ImportProgress{JobID: p.JobID, Total: p.Total, Running: p.Running})
	assert.False(t, p.UpdatedAt.IsZero())
}

func TestProgress_StartAndFinishPublishAtOnceAndTicksAreThrottled(t *testing.T) {
	const interval = 50 * time.Millisecond
	tr := newImportProgressTracker(interval, time.Now)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch := tr.subscribe(ctx, 1)
	next(t, ch) // idle snapshot

	tr.begin(1, 1000)
	started := next(t, ch)
	assert.True(t, started.Running)
	assert.Equal(t, 1000, started.Total)
	assert.Equal(t, 0, started.Done)

	// A thousand outcomes in a burst cost a handful of messages, not a thousand.
	var mu sync.Mutex
	var got []domain.ImportProgress
	done := make(chan struct{})
	go func() {
		defer close(done)
		for p := range ch {
			mu.Lock()
			got = append(got, p)
			mu.Unlock()
			if !p.Running {
				return
			}
		}
	}()
	start := time.Now()
	for i := range 1000 {
		st := domain.ImportItemStatusImported
		if i%10 == 0 {
			st = domain.ImportItemStatusFailed
		}
		tr.record(1, st)
		if i%100 == 0 {
			time.Sleep(interval / 4) // spread the burst over a few intervals
		}
	}
	tr.end(1)
	<-done
	elapsed := time.Since(start)

	mu.Lock()
	defer mu.Unlock()
	maxMessages := int(elapsed/interval) + 2 // ticks while running, plus the final publish
	assert.LessOrEqual(t, len(got), maxMessages, "published at most once per interval")
	final := got[len(got)-1]
	assert.False(t, final.Running)
	assert.Equal(t, 1000, final.Done)
	assert.Equal(t, 900, final.Imported)
	assert.Equal(t, 100, final.Failed)
	for i := 1; i < len(got); i++ {
		assert.GreaterOrEqual(t, got[i].Done, got[i-1].Done, "counts only go up")
	}
}

func TestProgress_ASlowSubscriberNeverBlocksAndGetsTheLatest(t *testing.T) {
	tr := newImportProgressTracker(time.Millisecond, time.Now)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch := tr.subscribe(ctx, 2) // never read until the end

	tr.begin(2, 3)
	for range 3 {
		tr.record(2, domain.ImportItemStatusSkipped)
		time.Sleep(5 * time.Millisecond) // let ticks publish into the full channel
	}
	tr.end(2) // must not block although the subscriber is not reading

	p := next(t, ch)
	assert.False(t, p.Running, "only the newest snapshot is kept")
	assert.Equal(t, 3, p.Skipped)
}

func TestProgress_BatchesOverlapThenANewRunStartsFresh(t *testing.T) {
	tr := newImportProgressTracker(time.Hour, time.Now)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch := tr.subscribe(ctx, 3)
	next(t, ch)

	tr.begin(3, 10)
	next(t, ch)
	tr.begin(3, 5) // a second person imports from the same sheet meanwhile
	assert.Equal(t, 15, next(t, ch).Total)
	tr.record(3, domain.ImportItemStatusImported)
	tr.end(3)
	tr.end(3)
	final := next(t, ch)
	assert.False(t, final.Running)
	assert.Equal(t, 1, final.Done)

	tr.begin(3, 4)
	fresh := next(t, ch)
	assert.Equal(t, 4, fresh.Total, "a new run doesn't add to a finished one")
	assert.Equal(t, 0, fresh.Done)
}

func TestProgress_UnsubscribeClosesTheChannel(t *testing.T) {
	tr := newImportProgressTracker(time.Hour, time.Now)
	ctx, cancel := context.WithCancel(context.Background())
	ch := tr.subscribe(ctx, 4)
	next(t, ch)
	cancel()
	select {
	case _, ok := <-ch:
		assert.False(t, ok)
	case <-time.After(time.Second):
		t.Fatal("not closed")
	}
	tr.mu.Lock()
	assert.Empty(t, tr.jobs[4].subs)
	tr.mu.Unlock()
	tr.begin(4, 1) // publishing after the subscriber left is safe
	tr.end(4)
}
