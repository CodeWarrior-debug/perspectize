package services

import (
	"context"
	"fmt"
	"runtime"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// hubCounter is the per-key state the hub tests drive: a number to publish and
// whether the key still counts as active (keeps its ticker running).
type hubCounter struct {
	n      int
	active bool
}

// hubSnap is what subscribers receive: the number and the time the hub stamped.
type hubSnap struct {
	N  int
	At time.Time
}

func newTestHub(interval time.Duration, now func() time.Time) *latestHub[string, hubCounter, hubSnap] {
	return newLatestHub(interval, now,
		func(string) *hubCounter { return &hubCounter{} },
		func(_ string, c *hubCounter, at time.Time) hubSnap { return hubSnap{N: c.n, At: at} },
		func(c *hubCounter) bool { return c.active },
	)
}

// setCounter returns an update that stores n and the activity flag, then asks
// for the given publish mode.
func setCounter(n int, active bool, mode publishMode) func(*hubCounter) publishMode {
	return func(c *hubCounter) publishMode {
		c.n = n
		c.active = active
		return mode
	}
}

// isTicking reports whether key's ticker goroutine is running.
func (h *latestHub[K, V, S]) isTicking(key K) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	e, ok := h.entries[key]
	return ok && e.ticking
}

// subscriberCount reports how many subscribers key currently has.
func (h *latestHub[K, V, S]) subscriberCount(key K) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	e, ok := h.entries[key]
	if !ok {
		return 0
	}
	return len(e.subs)
}

// hasEntry reports whether the hub still holds state for key.
func (h *latestHub[K, V, S]) hasEntry(key K) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	_, ok := h.entries[key]
	return ok
}

func recvHub(t *testing.T, ch <-chan hubSnap) hubSnap {
	t.Helper()
	select {
	case s, ok := <-ch:
		require.True(t, ok, "channel closed")
		return s
	case <-time.After(2 * time.Second):
		t.Fatal("nothing delivered")
		return hubSnap{}
	}
}

func requireNothingWithin(t *testing.T, ch <-chan hubSnap, d time.Duration) {
	t.Helper()
	select {
	case s, ok := <-ch:
		t.Fatalf("unexpected delivery (open=%v): %+v", ok, s)
	case <-time.After(d):
	}
}

func TestHub_SubscribeSendsCurrentSnapshotFirst(t *testing.T) {
	h := newTestHub(time.Hour, time.Now)
	h.update("k", setCounter(5, false, keep))

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch := h.subscribe(ctx, "k")

	assert.Equal(t, 5, recvHub(t, ch).N, "the first message is the state as it stands")
	requireNothingWithin(t, ch, 20*time.Millisecond)
}

func TestHub_SubscribeToAnUnseenKeySendsTheNewStateSnapshot(t *testing.T) {
	h := newTestHub(time.Hour, time.Now)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	s := recvHub(t, h.subscribe(ctx, "never-updated"))

	assert.Equal(t, 0, s.N)
	assert.False(t, s.At.IsZero())
}

func TestHub_LatestWinsForSlowSubscriber(t *testing.T) {
	h := newTestHub(time.Hour, time.Now)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch := h.subscribe(ctx, "k") // its single slot already holds the idle snapshot

	h.update("k", setCounter(1, false, publishNow))
	h.update("k", setCounter(2, false, publishNow))
	h.update("k", setCounter(3, false, publishNow))

	assert.Equal(t, 3, recvHub(t, ch).N, "only the newest unread snapshot survives")
	requireNothingWithin(t, ch, 20*time.Millisecond)
}

func TestHub_MarkDirtyWaitsForTick(t *testing.T) {
	h := newTestHub(200*time.Millisecond, time.Now)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch := h.subscribe(ctx, "k")
	recvHub(t, ch) // idle snapshot

	h.update("k", setCounter(1, true, markDirty))

	requireNothingWithin(t, ch, 10*time.Millisecond)
	select {
	case s := <-ch:
		assert.Equal(t, 1, s.N)
	case <-time.After(time.Second):
		t.Fatal("the ticker never published the marked change")
	}

	h.update("k", setCounter(1, false, keep)) // let the ticker stop
}

func TestHub_PublishNowIsImmediate(t *testing.T) {
	h := newTestHub(time.Hour, time.Now)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch := h.subscribe(ctx, "k")
	recvHub(t, ch) // idle snapshot

	h.update("k", setCounter(9, false, publishNow))

	select {
	case s := <-ch:
		assert.Equal(t, 9, s.N)
	default:
		t.Fatal("publishNow returned before the subscriber's channel had the snapshot")
	}
}

func TestHub_KeepPublishesNothing(t *testing.T) {
	h := newTestHub(20*time.Millisecond, time.Now)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch := h.subscribe(ctx, "k")
	recvHub(t, ch) // idle snapshot

	h.update("k", setCounter(4, true, keep))

	requireNothingWithin(t, ch, 120*time.Millisecond) // several ticks pass; nothing is dirty
	h.update("k", setCounter(4, false, keep))
}

func TestHub_TickerStopsWhenInactive(t *testing.T) {
	h := newTestHub(20*time.Millisecond, time.Now)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch := h.subscribe(ctx, "k")
	recvHub(t, ch) // idle snapshot

	assert.False(t, h.isTicking("k"))
	h.update("k", setCounter(1, true, markDirty))
	assert.True(t, h.isTicking("k"), "an active key gets a ticker")
	h.update("k", setCounter(2, true, markDirty))
	assert.True(t, h.isTicking("k"))

	h.update("k", setCounter(3, false, markDirty)) // inactive, with a change still unpublished

	require.Eventually(t, func() bool { return !h.isTicking("k") }, time.Second, 5*time.Millisecond,
		"the ticker must stop once the key is inactive")
	last := recvHub(t, ch)
	assert.Equal(t, 3, last.N, "the change pending when the key went inactive is still published")
}

func TestHub_TickerRestartsWhenActiveAgain(t *testing.T) {
	h := newTestHub(20*time.Millisecond, time.Now)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch := h.subscribe(ctx, "k")
	recvHub(t, ch) // idle snapshot

	h.update("k", setCounter(1, true, keep))
	h.update("k", setCounter(1, false, keep))
	require.Eventually(t, func() bool { return !h.isTicking("k") }, time.Second, 5*time.Millisecond)

	h.update("k", setCounter(2, true, markDirty))

	assert.Equal(t, 2, recvHub(t, ch).N, "a fresh ticker publishes the new run's change")
	h.update("k", setCounter(2, false, keep))
}

func TestHub_MarkDirtyBurstIsThrottled(t *testing.T) {
	const interval = 50 * time.Millisecond
	h := newTestHub(interval, time.Now)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch := h.subscribe(ctx, "k")
	recvHub(t, ch) // idle snapshot

	var mu sync.Mutex
	var got []int
	go func() {
		for s := range ch {
			mu.Lock()
			got = append(got, s.N)
			mu.Unlock()
		}
	}()

	start := time.Now()
	for i := 1; i <= 1000; i++ {
		h.update("k", setCounter(i, true, markDirty))
	}
	time.Sleep(4 * interval)
	h.update("k", setCounter(1000, false, keep))
	elapsed := time.Since(start)

	mu.Lock()
	defer mu.Unlock()
	require.NotEmpty(t, got)
	assert.Equal(t, 1000, got[len(got)-1], "the newest count is what arrives")
	maxPublishes := int(elapsed/interval) + 1
	assert.LessOrEqual(t, len(got), maxPublishes, "at most one publish per interval, however many updates")
}

func TestHub_ContextEndClosesChannelAndRemovesSubscriber(t *testing.T) {
	h := newTestHub(time.Hour, time.Now)
	ctx, cancel := context.WithCancel(context.Background())
	ch := h.subscribe(ctx, "k")
	other, cancelOther := context.WithCancel(context.Background())
	defer cancelOther()
	otherCh := h.subscribe(other, "k")
	require.Equal(t, 2, h.subscriberCount("k"))

	cancel()

	require.Eventually(t, func() bool { return h.subscriberCount("k") == 1 }, time.Second, 5*time.Millisecond)
	recvHub(t, ch) // the snapshot buffered before the context ended
	select {
	case _, ok := <-ch:
		assert.False(t, ok, "the channel is closed once the context ends")
	case <-time.After(time.Second):
		t.Fatal("channel not closed after the context ended")
	}

	require.NotPanics(t, func() { h.update("k", setCounter(1, false, publishNow)) }, "publishing after a subscriber left must not send on its closed channel")
	assert.Equal(t, 1, recvHub(t, otherCh).N, "the remaining subscriber is unaffected")
}

func TestHub_ContextAlreadyEndedStillClosesTheChannel(t *testing.T) {
	h := newTestHub(time.Hour, time.Now)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	ch := h.subscribe(ctx, "k")

	recvHub(t, ch) // the current snapshot is still delivered first
	select {
	case _, ok := <-ch:
		assert.False(t, ok)
	case <-time.After(time.Second):
		t.Fatal("channel not closed for an already-ended context")
	}
	require.Eventually(t, func() bool { return h.subscriberCount("k") == 0 }, time.Second, 5*time.Millisecond)
}

func TestHub_KeysAreIndependent(t *testing.T) {
	h := newTestHub(time.Hour, time.Now)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	a := h.subscribe(ctx, "a")
	b := h.subscribe(ctx, "b")
	recvHub(t, a)
	recvHub(t, b)

	h.update("a", setCounter(1, false, publishNow))

	assert.Equal(t, 1, recvHub(t, a).N)
	requireNothingWithin(t, b, 20*time.Millisecond)
}

func TestHub_SnapshotCarriesTheHubsPublishTime(t *testing.T) {
	var mu sync.Mutex
	clock := time.Date(2026, 1, 2, 3, 4, 5, 0, time.FixedZone("offset", 3600))
	now := func() time.Time {
		mu.Lock()
		defer mu.Unlock()
		return clock
	}
	advance := func(d time.Duration) {
		mu.Lock()
		defer mu.Unlock()
		clock = clock.Add(d)
	}
	h := newTestHub(time.Hour, now)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	idle := recvHub(t, h.subscribe(ctx, "k"))
	assert.Equal(t, now().UTC(), idle.At, "before any publish a subscriber sees the current time, in UTC")

	advance(time.Minute)
	published := now().UTC()
	h.update("k", setCounter(1, false, publishNow))
	advance(time.Minute)

	late := recvHub(t, h.subscribe(ctx, "k"))
	assert.Equal(t, published, late.At, "a later subscriber sees when the state was last published, not now")
	assert.Equal(t, time.UTC, late.At.Location())
}

func TestHub_NoGoroutineLeakAfterManySubscribers(t *testing.T) {
	// require.Eventually evaluates its condition on a goroutine of its own, so
	// the baseline is sampled the same way the later checks are: from inside a
	// condition, with that evaluator counted on both sides.
	var baseline int
	require.Eventually(t, func() bool {
		baseline = runtime.NumGoroutine()
		return true
	}, time.Second, time.Millisecond)
	h := newTestHub(10*time.Millisecond, time.Now)

	cancels := make([]context.CancelFunc, 0, 300)
	for i := 0; i < 300; i++ {
		ctx, cancel := context.WithCancel(context.Background())
		cancels = append(cancels, cancel)
		key := []string{"a", "b", "c"}[i%3]
		h.subscribe(ctx, key)
		h.update(key, setCounter(i, true, markDirty)) // keeps a ticker per key running
	}
	for _, cancel := range cancels {
		cancel()
	}
	for _, key := range []string{"a", "b", "c"} {
		h.update(key, setCounter(0, false, keep)) // lets each ticker stop
	}

	// A ticker clears its flag only when its next tick sees an inactive key, and
	// the process-wide goroutine count can dip to the baseline before that (other
	// tests' goroutines exiting), so wait on the hub's own state first.
	for _, key := range []string{"a", "b", "c"} {
		key := key
		require.Eventually(t, func() bool { return h.subscriberCount(key) == 0 && !h.isTicking(key) },
			3*time.Second, 5*time.Millisecond, "key %q: subscribers and ticker should be gone", key)
	}
	require.Eventually(t, func() bool { return runtime.NumGoroutine() <= baseline }, 3*time.Second, 10*time.Millisecond,
		"goroutines: baseline %d", baseline)
}

func TestHub_IdleKeysAreCappedOldestFirst(t *testing.T) {
	h := newTestHub(time.Hour, time.Now)
	h.maxIdle = 2
	for i, key := range []string{"a", "b", "c", "d"} {
		h.update(key, setCounter(i+1, false, keep)) // inactive, no ticker, no subscribers: idle at once
	}

	assert.False(t, h.hasEntry("a"), "the oldest idle key goes first")
	assert.False(t, h.hasEntry("b"))
	assert.True(t, h.hasEntry("c"))
	assert.True(t, h.hasEntry("d"))
}

func TestHub_AFinishedKeyKeepsItsFinalStateWhileUnderTheCap(t *testing.T) {
	h := newTestHub(time.Hour, time.Now)
	h.update("job", setCounter(9, false, publishNow))
	for i := range defaultMaxIdleEntries - 1 {
		h.update(fmt.Sprintf("other-%d", i), setCounter(1, false, keep))
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	assert.Equal(t, 9, recvHub(t, h.subscribe(ctx, "job")).N, "a late subscriber still sees how it ended")
}

func TestHub_AnEvictedKeyStartsFreshWhenNextSeen(t *testing.T) {
	h := newTestHub(time.Hour, time.Now)
	h.maxIdle = 1
	h.update("old", setCounter(9, false, publishNow))
	h.update("newer", setCounter(1, false, keep))
	require.False(t, h.hasEntry("old"))
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	assert.Equal(t, 0, recvHub(t, h.subscribe(ctx, "old")).N, "like a job this process never ran")
}

func TestHub_NeverEvictsAKeyWithSubscribers(t *testing.T) {
	h := newTestHub(time.Hour, time.Now)
	h.maxIdle = 1
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch := h.subscribe(ctx, "watched")
	recvHub(t, ch)
	h.update("watched", setCounter(7, false, publishNow))

	for _, key := range []string{"x", "y", "z"} {
		h.update(key, setCounter(1, false, keep))
	}

	assert.True(t, h.hasEntry("watched"))
	assert.Equal(t, 7, recvHub(t, ch).N, "its subscriber still receives")
}

func TestHub_AKeyBecomesEvictableOnceItsLastSubscriberLeaves(t *testing.T) {
	h := newTestHub(time.Hour, time.Now)
	h.maxIdle = 1
	ctx, cancel := context.WithCancel(context.Background())
	recvHub(t, h.subscribe(ctx, "watched"))
	h.update("x", setCounter(1, false, keep))
	h.update("y", setCounter(1, false, keep)) // x is the only idle key over the cap of one: evicted
	require.False(t, h.hasEntry("x"))

	cancel()

	require.Eventually(t, func() bool { return !h.hasEntry("y") }, time.Second, 5*time.Millisecond,
		"watched became idle after y, so the older idle key y goes")
	assert.True(t, h.hasEntry("watched"))
}

func TestHub_AnActiveKeyIsNotEvictedAndRejoinsAsNewestWhenItFinishes(t *testing.T) {
	h := newTestHub(5*time.Millisecond, time.Now)
	h.maxIdle = 2
	h.update("a", setCounter(1, false, keep)) // idle
	h.update("a", setCounter(2, true, markDirty))
	for _, key := range []string{"b", "c", "d"} {
		h.update(key, setCounter(1, false, keep))
	}
	assert.True(t, h.hasEntry("a"), "running, so not idle")
	assert.False(t, h.hasEntry("b"), "b was the oldest idle key when d arrived")

	h.update("a", setCounter(3, false, keep)) // finishes: its ticker stops at the next tick
	require.Eventually(t, func() bool { return !h.isTicking("a") }, time.Second, time.Millisecond)

	assert.True(t, h.hasEntry("a"), "a finished last, so it is the newest idle key")
	assert.False(t, h.hasEntry("c"), "c is now the oldest idle key")
	assert.True(t, h.hasEntry("d"))
}

func TestHub_SlowSubscriberNeverBlocksPublisher(t *testing.T) {
	h := newTestHub(time.Hour, time.Now)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch := h.subscribe(ctx, "k") // never read while publishing

	done := make(chan struct{})
	go func() {
		defer close(done)
		for i := 1; i <= 1000; i++ {
			h.update("k", setCounter(i, false, publishNow))
		}
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("publisher blocked on a subscriber that is not reading")
	}
	assert.Equal(t, 1000, recvHub(t, ch).N, "the subscriber, once it reads, gets the newest")
}
