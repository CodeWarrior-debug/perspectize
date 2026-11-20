package services

import (
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// defaultProgressInterval is how often a running import's progress is pushed
// to subscribers: twice a second, however fast rows finish.
const defaultProgressInterval = 500 * time.Millisecond

// importProgressTracker keeps each import's live progress in memory and fans
// it out to subscribers. Workers report outcomes as fast as they like; the
// hub's ticker for a running import publishes at most once per interval, so a
// thousand-row batch costs subscribers two messages a second, not a thousand.
// Start and finish publish at once. Nothing here touches the database.
//
// The embedded hub is keyed by job ID. It supplies subscribe: the import's
// current progress at once, then every published change, until the context
// ends (then the channel is closed).
//
// It is per process, like the import workers themselves (one server instance).
type importProgressTracker struct {
	*latestHub[int, jobProgress, domain.ImportProgress]
}

// jobProgress is one import's state in the hub: its count so far and how many
// batches of it are still running.
type jobProgress struct {
	snap    domain.ImportProgress
	batches int
}

func newImportProgressTracker(interval time.Duration, now func() time.Time) *importProgressTracker {
	hub := newLatestHub(
		interval,
		now,
		func(jobID int) *jobProgress {
			return &jobProgress{snap: domain.ImportProgress{JobID: jobID}}
		},
		func(_ int, jp *jobProgress, at time.Time) domain.ImportProgress {
			snap := jp.snap
			snap.UpdatedAt = at
			return snap
		},
		func(jp *jobProgress) bool { return jp.batches > 0 },
	)
	return &importProgressTracker{latestHub: hub}
}

// begin records a batch of n rows starting. A batch starting while none is
// running begins a fresh count; one starting alongside others adds to it.
func (t *importProgressTracker) begin(jobID, n int) {
	t.update(jobID, func(jp *jobProgress) publishMode {
		if jp.batches == 0 {
			jp.snap = domain.ImportProgress{JobID: jobID}
		}
		jp.batches++
		jp.snap.Total += n
		jp.snap.Running = true
		return publishNow
	})
}

// record counts one finished row. It doesn't publish; the ticker does.
func (t *importProgressTracker) record(jobID int, status domain.ImportItemStatus) {
	t.update(jobID, func(jp *jobProgress) publishMode {
		jp.snap.Done++
		switch status {
		case domain.ImportItemStatusImported:
			jp.snap.Imported++
		case domain.ImportItemStatusSkipped:
			jp.snap.Skipped++
		default:
			jp.snap.Failed++
		}
		return markDirty
	})
}

// end records a batch finishing (or stopping early); the last one publishes
// the final count straight away.
func (t *importProgressTracker) end(jobID int) {
	t.update(jobID, func(jp *jobProgress) publishMode {
		if jp.batches > 0 {
			jp.batches--
		}
		if jp.batches > 0 {
			return keep
		}
		jp.snap.Running = false
		return publishNow
	})
}
