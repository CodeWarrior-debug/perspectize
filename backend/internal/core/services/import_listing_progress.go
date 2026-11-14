package services

import (
	"context"
	"sort"
	"sync"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// listingTracker keeps each import's source-listing progress in memory and
// fans it out to admin subscribers. Listing reports each staged batch as it
// lands; a ticker per listing import publishes at most once per interval, so
// a 5,000-video channel costs subscribers two messages a second, not one per
// batch. Begin and finish publish at once. Nothing here touches the database.
//
// Like importProgressTracker, it is per process (one server instance).
type listingTracker struct {
	mu       sync.Mutex
	interval time.Duration
	now      func() time.Time
	jobs     map[int]*jobListing
}

type jobListing struct {
	sources   map[int]domain.ImportSourceListingProgress // by source id
	updatedAt time.Time
	dirty     bool // changed since the last publish
	ticking   bool
	subs      map[chan domain.ImportListingProgress]struct{}
}

func newListingTracker(interval time.Duration, now func() time.Time) *listingTracker {
	return &listingTracker{interval: interval, now: now, jobs: map[int]*jobListing{}}
}

func (t *listingTracker) job(jobID int) *jobListing {
	jl, ok := t.jobs[jobID]
	if !ok {
		jl = &jobListing{sources: map[int]domain.ImportSourceListingProgress{}, subs: map[chan domain.ImportListingProgress]struct{}{}}
		t.jobs[jobID] = jl
	}
	return jl
}

// source returns the source's progress, or a fresh LISTING entry if the tracker hasn't seen it.
func (jl *jobListing) source(sourceID int) domain.ImportSourceListingProgress {
	src, ok := jl.sources[sourceID]
	if !ok {
		src = domain.ImportSourceListingProgress{SourceID: sourceID, Status: domain.ImportSourceStatusListing}
	}
	return src
}

// begin records a source starting to list and publishes at once.
func (t *listingTracker) begin(jobID, sourceID int) {
	t.mu.Lock()
	defer t.mu.Unlock()
	jl := t.job(jobID)
	jl.sources[sourceID] = domain.ImportSourceListingProgress{SourceID: sourceID, Status: domain.ImportSourceStatusListing}
	t.publishLocked(jobID, jl)
	t.startTickerLocked(jobID, jl)
}

// staged records one batch of rows upserted for a source. It doesn't publish; the ticker does.
func (t *listingTracker) staged(jobID, sourceID, rows int) {
	t.mu.Lock()
	defer t.mu.Unlock()
	jl := t.job(jobID)
	src := jl.source(sourceID)
	src.Staged += rows
	src.Batches++
	jl.sources[sourceID] = src
	jl.dirty = true
}

// finish records a source's final status and publishes at once.
func (t *listingTracker) finish(jobID, sourceID int, status domain.ImportSourceStatus) {
	t.mu.Lock()
	defer t.mu.Unlock()
	jl := t.job(jobID)
	src := jl.source(sourceID)
	src.Status = status
	jl.sources[sourceID] = src
	t.publishLocked(jobID, jl)
}

// startTickerLocked starts the job's publish ticker unless one is already running.
func (t *listingTracker) startTickerLocked(jobID int, jl *jobListing) {
	if !jl.ticking {
		jl.ticking = true
		go t.tick(jobID)
	}
}

// tick publishes a listing import's changes once per interval, and stops
// when no source is still listing.
func (t *listingTracker) tick(jobID int) {
	ticker := time.NewTicker(t.interval)
	defer ticker.Stop()
	for range ticker.C {
		t.mu.Lock()
		jl := t.job(jobID)
		if jl.dirty {
			t.publishLocked(jobID, jl)
		}
		if !jl.listingLocked() {
			jl.ticking = false
			t.mu.Unlock()
			return
		}
		t.mu.Unlock()
	}
}

// listingLocked reports whether any source is still LISTING.
func (jl *jobListing) listingLocked() bool {
	for _, src := range jl.sources {
		if src.Status == domain.ImportSourceStatusListing {
			return true
		}
	}
	return false
}

func (t *listingTracker) publishLocked(jobID int, jl *jobListing) {
	jl.dirty = false
	jl.updatedAt = t.now().UTC()
	snap := jl.snapshot(jobID)
	for ch := range jl.subs {
		sendLatest(ch, snap)
	}
}

// snapshot copies the job's state, sources in SourceID order.
func (jl *jobListing) snapshot(jobID int) domain.ImportListingProgress {
	ids := make([]int, 0, len(jl.sources))
	for id := range jl.sources {
		ids = append(ids, id)
	}
	sort.Ints(ids)
	snap := domain.ImportListingProgress{
		JobID:     jobID,
		Sources:   make([]domain.ImportSourceListingProgress, 0, len(ids)),
		Listing:   jl.listingLocked(),
		UpdatedAt: jl.updatedAt,
	}
	for _, id := range ids {
		snap.Sources = append(snap.Sources, jl.sources[id])
	}
	return snap
}

// subscribe returns a channel that receives the job's current listing
// progress at once, then every published change, until ctx ends (then it is closed).
func (t *listingTracker) subscribe(ctx context.Context, jobID int) <-chan domain.ImportListingProgress {
	ch := make(chan domain.ImportListingProgress, 1)
	t.mu.Lock()
	jl := t.job(jobID)
	jl.subs[ch] = struct{}{}
	snap := jl.snapshot(jobID)
	if snap.UpdatedAt.IsZero() {
		snap.UpdatedAt = t.now().UTC()
	}
	ch <- snap
	t.mu.Unlock()

	go func() {
		<-ctx.Done()
		t.mu.Lock()
		delete(jl.subs, ch)
		close(ch)
		t.mu.Unlock()
	}()
	return ch
}
