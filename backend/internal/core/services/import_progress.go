package services

import (
	"context"
	"sync"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// defaultProgressInterval is how often a running import's progress is pushed
// to subscribers: twice a second, however fast rows finish.
const defaultProgressInterval = 500 * time.Millisecond

// importProgressTracker keeps each import's live progress in memory and fans
// it out to subscribers. Workers report outcomes as fast as they like; a
// ticker per running import publishes at most once per interval, so a
// thousand-row batch costs subscribers two messages a second, not a thousand.
// Start and finish publish at once. Nothing here touches the database.
//
// It is per process, like the import workers themselves (one server instance).
type importProgressTracker struct {
	mu       sync.Mutex
	interval time.Duration
	now      func() time.Time
	jobs     map[int]*jobProgress
}

type jobProgress struct {
	snap    domain.ImportProgress
	batches int  // batches still running
	dirty   bool // changed since the last publish
	ticking bool
	subs    map[chan domain.ImportProgress]struct{}
}

func newImportProgressTracker(interval time.Duration, now func() time.Time) *importProgressTracker {
	return &importProgressTracker{interval: interval, now: now, jobs: map[int]*jobProgress{}}
}

func (t *importProgressTracker) job(jobID int) *jobProgress {
	jp, ok := t.jobs[jobID]
	if !ok {
		jp = &jobProgress{snap: domain.ImportProgress{JobID: jobID}, subs: map[chan domain.ImportProgress]struct{}{}}
		t.jobs[jobID] = jp
	}
	return jp
}

// begin records a batch of n rows starting. A batch starting while none is
// running begins a fresh count; one starting alongside others adds to it.
func (t *importProgressTracker) begin(jobID, n int) {
	t.mu.Lock()
	defer t.mu.Unlock()
	jp := t.job(jobID)
	if jp.batches == 0 {
		jp.snap = domain.ImportProgress{JobID: jobID}
	}
	jp.batches++
	jp.snap.Total += n
	jp.snap.Running = true
	t.publishLocked(jp)
	if !jp.ticking {
		jp.ticking = true
		go t.tick(jobID)
	}
}

// record counts one finished row. It doesn't publish; the ticker does.
func (t *importProgressTracker) record(jobID int, status domain.ImportItemStatus) {
	t.mu.Lock()
	defer t.mu.Unlock()
	jp := t.job(jobID)
	jp.snap.Done++
	switch status {
	case domain.ImportItemStatusImported:
		jp.snap.Imported++
	case domain.ImportItemStatusSkipped:
		jp.snap.Skipped++
	default:
		jp.snap.Failed++
	}
	jp.dirty = true
}

// end records a batch finishing (or stopping early); the last one publishes
// the final count straight away.
func (t *importProgressTracker) end(jobID int) {
	t.mu.Lock()
	defer t.mu.Unlock()
	jp := t.job(jobID)
	if jp.batches > 0 {
		jp.batches--
	}
	if jp.batches == 0 {
		jp.snap.Running = false
		t.publishLocked(jp)
	}
}

// tick publishes a running import's changes once per interval, and stops
// when the import is no longer running.
func (t *importProgressTracker) tick(jobID int) {
	ticker := time.NewTicker(t.interval)
	defer ticker.Stop()
	for range ticker.C {
		t.mu.Lock()
		jp := t.job(jobID)
		if jp.dirty {
			t.publishLocked(jp)
		}
		if jp.batches == 0 {
			jp.ticking = false
			t.mu.Unlock()
			return
		}
		t.mu.Unlock()
	}
}

func (t *importProgressTracker) publishLocked(jp *jobProgress) {
	jp.dirty = false
	jp.snap.UpdatedAt = t.now().UTC()
	for ch := range jp.subs {
		sendLatest(ch, jp.snap)
	}
}

// sendLatest delivers s without ever blocking the publisher: a subscriber's
// channel holds one snapshot, and a newer one replaces an unread older one.
// Only the publisher (under the tracker's lock) sends, so the drain-then-send
// can't race another sender.
func sendLatest(ch chan domain.ImportProgress, s domain.ImportProgress) {
	select {
	case ch <- s:
		return
	default:
	}
	select {
	case <-ch:
	default:
	}
	ch <- s
}

// subscribe returns a channel that receives the import's current progress at
// once, then every published change, until ctx ends (then it is closed).
func (t *importProgressTracker) subscribe(ctx context.Context, jobID int) <-chan domain.ImportProgress {
	ch := make(chan domain.ImportProgress, 1)
	t.mu.Lock()
	jp := t.job(jobID)
	jp.subs[ch] = struct{}{}
	snap := jp.snap
	if snap.UpdatedAt.IsZero() {
		snap.UpdatedAt = t.now().UTC()
	}
	ch <- snap
	t.mu.Unlock()

	go func() {
		<-ctx.Done()
		t.mu.Lock()
		delete(jp.subs, ch)
		close(ch)
		t.mu.Unlock()
	}()
	return ch
}
