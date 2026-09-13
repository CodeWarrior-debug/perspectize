package realtime

import (
	"sync"
	"time"
)

// presenceTTL is how long after a user's last activity they are still
// considered online once every live connection has gone away.
const presenceTTL = 45 * time.Second

// presenceEntry tracks one user's live connection count and the wall-clock time
// of their most recent activity (connect, disconnect or heartbeat).
type presenceEntry struct {
	refs     int
	lastSeen time.Time
}

// PresenceTracker is an in-memory, concurrency-safe record of which users have
// at least one live realtime connection, with a short grace period after the
// last connection closes. It holds no database state.
type PresenceTracker struct {
	// NowFn supplies the current time. Defaults to time.Now; override in tests.
	NowFn func() time.Time

	mu      sync.Mutex
	entries map[int]*presenceEntry
}

// NewPresenceTracker returns an empty tracker using time.Now as its clock.
func NewPresenceTracker() *PresenceTracker {
	return &PresenceTracker{
		NowFn:   time.Now,
		entries: make(map[int]*presenceEntry),
	}
}

// Connect records a new live connection for userID and stamps its activity.
// It returns true when this is the user's first live connection.
func (p *PresenceTracker) Connect(userID int) (firstConnection bool) {
	p.mu.Lock()
	defer p.mu.Unlock()

	e := p.entries[userID]
	if e == nil {
		e = &presenceEntry{}
		p.entries[userID] = e
	}
	e.refs++
	e.lastSeen = p.NowFn()
	return e.refs == 1
}

// Disconnect records that one live connection for userID has closed and stamps
// its activity. It returns true when the user has no live connections left.
func (p *PresenceTracker) Disconnect(userID int) (lastConnection bool) {
	p.mu.Lock()
	defer p.mu.Unlock()

	e := p.entries[userID]
	if e == nil {
		return true
	}
	if e.refs > 0 {
		e.refs--
	}
	e.lastSeen = p.NowFn()
	return e.refs == 0
}

// Touch records a heartbeat for userID, refreshing the grace-period window.
func (p *PresenceTracker) Touch(userID int) {
	p.mu.Lock()
	defer p.mu.Unlock()

	e := p.entries[userID]
	if e == nil {
		e = &presenceEntry{}
		p.entries[userID] = e
	}
	e.lastSeen = p.NowFn()
}

// RefCount reports the number of live connections currently held for userID
// (0 if unknown). Used by the presence session to decide, after the offline
// grace period, whether the user has genuinely gone away.
func (p *PresenceTracker) RefCount(userID int) int {
	p.mu.Lock()
	defer p.mu.Unlock()
	if e, ok := p.entries[userID]; ok {
		return e.refs
	}
	return 0
}

// IsOnline reports whether userID has a live connection or was active within
// the last presenceTTL.
func (p *PresenceTracker) IsOnline(userID int) bool {
	p.mu.Lock()
	defer p.mu.Unlock()

	e := p.entries[userID]
	if e == nil {
		return false
	}
	return e.refs > 0 || p.NowFn().Sub(e.lastSeen) <= presenceTTL
}

// Expire drops entries that have no live connections and whose last activity is
// older than presenceTTL. Call it periodically to bound memory use.
func (p *PresenceTracker) Expire() {
	p.mu.Lock()
	defer p.mu.Unlock()

	now := p.NowFn()
	for userID, e := range p.entries {
		if e.refs == 0 && now.Sub(e.lastSeen) > presenceTTL {
			delete(p.entries, userID)
		}
	}
}
