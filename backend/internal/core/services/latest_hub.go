package services

import (
	"context"
	"sync"
	"time"
)

// defaultMaxIdleEntries is how many idle keys (nothing running, nobody
// subscribed) a hub keeps. Without a bound, every key ever seen would stay in
// memory for as long as the process runs. Keeping the most recent few hundred
// lets a late subscriber to a key that just finished still see how it ended;
// an older key reads as one this process never saw, as it does after a restart.
const defaultMaxIdleEntries = 256

// publishMode is what an update asks the hub to do with subscribers.
type publishMode int

const (
	// keep changes state only: nothing is published and nothing is marked
	// for the ticker.
	keep publishMode = iota
	// markDirty records that subscribers are behind; the key's ticker
	// publishes at its next tick.
	markDirty
	// publishNow sends a snapshot to every subscriber before update returns.
	publishNow
)

// latestHub keeps in-memory state V per key and fans snapshots S of it out to
// subscribers, latest wins. Writers change state as fast as they like through
// update; the hub never blocks on a slow subscriber, and a key's ticker
// publishes accumulated changes at most once per interval. Nothing here
// touches the database, and state lives per process.
//
// A wrapper supplies four things:
//   - newState builds the zero state for a key the hub has not seen;
//   - snapshot turns a key's state into the value subscribers receive. Its
//     time argument is when the hub last published that key (or now, if it
//     never has), so a snapshot needs no clock of its own;
//   - active reports whether the key still has work in flight. A key's ticker
//     runs while its state is active and stops once it is not;
//   - the update callbacks decide per change whether to publish at once.
//
// snapshot and active run under the hub's lock and must not call back into
// the hub. Snapshots go to every subscriber of a key, so a snapshot must not
// share mutable memory with the state it came from.
//
// A key is idle when its state is not active, its ticker has stopped and it
// has no subscribers. The hub keeps at most maxIdle idle keys and evicts the
// one that went idle longest ago; a key that is running or watched is never
// evicted. A key that goes idle again, say when its last subscriber leaves,
// counts as newly idle. An evicted key that is seen again starts from newState,
// even if the work it stood for was only partly done.
type latestHub[K comparable, V any, S any] struct {
	mu        sync.Mutex
	interval  time.Duration
	now       func() time.Time
	newState  func(K) *V
	snapshot  func(K, *V, time.Time) S
	active    func(*V) bool
	entries   map[K]*hubEntry[V, S]
	maxIdle   int
	idleCount int    // entries with idleAt != 0
	idleSeq   uint64 // last idleAt handed out
}

// hubEntry is one key's state, publish bookkeeping and subscribers.
type hubEntry[V any, S any] struct {
	state     *V
	updatedAt time.Time // when this key last published; zero until it does
	dirty     bool      // changed since the last publish
	ticking   bool      // a ticker goroutine is running for this key
	subs      map[chan S]struct{}
	idleAt    uint64 // when the key went idle, in idleSeq order; 0 while it is not idle
}

func newLatestHub[K comparable, V any, S any](
	interval time.Duration,
	now func() time.Time,
	newState func(K) *V,
	snapshot func(K, *V, time.Time) S,
	active func(*V) bool,
) *latestHub[K, V, S] {
	return &latestHub[K, V, S]{
		interval: interval,
		now:      now,
		newState: newState,
		snapshot: snapshot,
		active:   active,
		entries:  map[K]*hubEntry[V, S]{},
		maxIdle:  defaultMaxIdleEntries,
	}
}

// settleLocked records whether the key has just gone idle or stopped being
// idle, and evicts the longest-idle keys while more than maxIdle are idle. Call
// it wherever one of the three things idleness depends on (active state,
// ticker, subscribers) may have changed.
func (h *latestHub[K, V, S]) settleLocked(e *hubEntry[V, S]) {
	idle := !e.ticking && len(e.subs) == 0 && !h.active(e.state)
	switch {
	case idle && e.idleAt == 0:
		h.idleSeq++
		e.idleAt = h.idleSeq
		h.idleCount++
		for h.idleCount > h.maxIdle {
			if !h.evictOldestIdleLocked() {
				break
			}
		}
	case !idle && e.idleAt != 0:
		e.idleAt = 0
		h.idleCount--
	}
}

// evictOldestIdleLocked drops the key that went idle longest ago, reporting
// whether there was one.
func (h *latestHub[K, V, S]) evictOldestIdleLocked() bool {
	var oldest K
	var oldestAt uint64
	for key, e := range h.entries {
		if e.idleAt != 0 && (oldestAt == 0 || e.idleAt < oldestAt) {
			oldest, oldestAt = key, e.idleAt
		}
	}
	if oldestAt == 0 {
		return false
	}
	delete(h.entries, oldest)
	h.idleCount--
	return true
}

func (h *latestHub[K, V, S]) entryLocked(key K) *hubEntry[V, S] {
	e, ok := h.entries[key]
	if !ok {
		e = &hubEntry[V, S]{state: h.newState(key), subs: map[chan S]struct{}{}}
		h.entries[key] = e
	}
	return e
}

// update runs fn on the key's state under the hub's lock and acts on the mode
// it returns. If the state is active afterwards and the key has no ticker, one
// starts. fn runs under the hub's lock and must not call back into the hub (a
// call would deadlock).
func (h *latestHub[K, V, S]) update(key K, fn func(*V) publishMode) {
	h.mu.Lock()
	defer h.mu.Unlock()
	e := h.entryLocked(key)
	switch fn(e.state) {
	case publishNow:
		h.publishLocked(key, e)
	case markDirty:
		e.dirty = true
	}
	if !e.ticking && h.active(e.state) {
		e.ticking = true
		go h.tick(key, e)
	}
	h.settleLocked(e)
}

// tick publishes the key's changes once per interval, and stops when the
// key's state is no longer active.
func (h *latestHub[K, V, S]) tick(key K, e *hubEntry[V, S]) {
	ticker := time.NewTicker(h.interval)
	defer ticker.Stop()
	for range ticker.C {
		h.mu.Lock()
		if e.dirty {
			h.publishLocked(key, e)
		}
		if !h.active(e.state) {
			e.ticking = false
			h.settleLocked(e)
			h.mu.Unlock()
			return
		}
		h.mu.Unlock()
	}
}

func (h *latestHub[K, V, S]) publishLocked(key K, e *hubEntry[V, S]) {
	e.dirty = false
	e.updatedAt = h.now().UTC()
	snap := h.snapshot(key, e.state, e.updatedAt)
	for ch := range e.subs {
		sendLatest(ch, snap)
	}
}

// subscribe returns a channel that receives the key's current snapshot at
// once, then every published change, until ctx ends (then it is closed).
func (h *latestHub[K, V, S]) subscribe(ctx context.Context, key K) <-chan S {
	ch := make(chan S, 1)
	h.mu.Lock()
	e := h.entryLocked(key)
	e.subs[ch] = struct{}{}
	at := e.updatedAt
	if at.IsZero() {
		at = h.now().UTC()
	}
	ch <- h.snapshot(key, e.state, at)
	h.settleLocked(e)
	h.mu.Unlock()

	context.AfterFunc(ctx, func() {
		h.mu.Lock()
		delete(e.subs, ch)
		close(ch)
		h.settleLocked(e)
		h.mu.Unlock()
	})
	return ch
}

// sendLatest delivers s without ever blocking the publisher: a subscriber's
// channel holds one snapshot, and a newer one replaces an unread older one.
// Only the publisher (under the hub's lock) sends, so the drain-then-send
// can't race another sender.
func sendLatest[T any](ch chan T, s T) {
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
