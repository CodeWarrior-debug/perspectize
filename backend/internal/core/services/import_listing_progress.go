package services

import (
	"sort"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// listingTracker keeps each import's source-listing progress in memory and
// fans it out to admin subscribers. Listing reports each staged batch as it
// lands; the hub's ticker for a listing import publishes at most once per
// interval, so a 5,000-video channel costs subscribers two messages a second,
// not one per batch. Begin and finish publish at once. Nothing here touches
// the database.
//
// The embedded hub is keyed by job ID. It supplies subscribe: the import's
// current listing progress at once, then every published change, until the
// context ends (then the channel is closed).
//
// Like importProgressTracker, it is per process (one server instance).
type listingTracker struct {
	*latestHub[int, jobListing, domain.ImportListingProgress]
}

// jobListing is one import's state in the hub: each source's listing progress,
// by source ID.
type jobListing struct {
	sources map[int]domain.ImportSourceListingProgress
}

func newListingTracker(interval time.Duration, now func() time.Time) *listingTracker {
	hub := newLatestHub(
		interval,
		now,
		func(int) *jobListing {
			return &jobListing{sources: map[int]domain.ImportSourceListingProgress{}}
		},
		func(jobID int, jl *jobListing, at time.Time) domain.ImportListingProgress {
			return jl.snapshot(jobID, at)
		},
		(*jobListing).listingLocked,
	)
	return &listingTracker{latestHub: hub}
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
	t.update(jobID, func(jl *jobListing) publishMode {
		jl.sources[sourceID] = domain.ImportSourceListingProgress{SourceID: sourceID, Status: domain.ImportSourceStatusListing}
		return publishNow
	})
}

// staged records one batch of rows upserted for a source. It doesn't publish; the ticker does.
func (t *listingTracker) staged(jobID, sourceID, rows int) {
	t.update(jobID, func(jl *jobListing) publishMode {
		src := jl.source(sourceID)
		src.Staged += rows
		src.Batches++
		jl.sources[sourceID] = src
		return markDirty
	})
}

// finish records a source's final status and publishes at once.
func (t *listingTracker) finish(jobID, sourceID int, status domain.ImportSourceStatus) {
	t.update(jobID, func(jl *jobListing) publishMode {
		src := jl.source(sourceID)
		src.Status = status
		jl.sources[sourceID] = src
		return publishNow
	})
}

// listingLocked reports whether any source is still LISTING. The hub's ticker
// runs while this reports true.
func (jl *jobListing) listingLocked() bool {
	for _, src := range jl.sources {
		if src.Status == domain.ImportSourceStatusListing {
			return true
		}
	}
	return false
}

// snapshot copies the job's state as of at, sources in SourceID order.
func (jl *jobListing) snapshot(jobID int, at time.Time) domain.ImportListingProgress {
	ids := make([]int, 0, len(jl.sources))
	for id := range jl.sources {
		ids = append(ids, id)
	}
	sort.Ints(ids)
	snap := domain.ImportListingProgress{
		JobID:     jobID,
		Sources:   make([]domain.ImportSourceListingProgress, 0, len(ids)),
		Listing:   jl.listingLocked(),
		UpdatedAt: at,
	}
	for _, id := range ids {
		snap.Sources = append(snap.Sources, jl.sources[id])
	}
	return snap
}
