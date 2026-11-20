package resolvers

import (
	"context"
	"runtime"
	"strconv"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// forward is unexported, so these tests live in package resolvers beside the
// other helper tests.

const forwardWait = 2 * time.Second

// drainUntilClosed reads ch until it is closed and returns what it read. It
// fails the test if the channel is still open after forwardWait.
func drainUntilClosed[T any](t *testing.T, ch <-chan T) []T {
	t.Helper()
	var got []T
	deadline := time.After(forwardWait)
	for {
		select {
		case v, ok := <-ch:
			if !ok {
				return got
			}
			got = append(got, v)
		case <-deadline:
			t.Fatalf("channel still open after %s; read so far: %v", forwardWait, got)
			return got
		}
	}
}

// goroutineBaseline samples runtime.NumGoroutine the same way the later checks
// do. require.Eventually evaluates its condition on a goroutine of its own, so
// a count taken outside it would be one lower than every count taken inside it.
func goroutineBaseline(t *testing.T) int {
	t.Helper()
	var baseline int
	require.Eventually(t, func() bool {
		baseline = runtime.NumGoroutine()
		return true
	}, time.Second, time.Millisecond)
	return baseline
}

func TestForward_MapsEveryValue(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	const n = 50
	in := make(chan int)
	go func() {
		defer close(in)
		for i := 0; i < n; i++ {
			in <- i
		}
	}()

	got := drainUntilClosed(t, forward(ctx, in, func(v int) string { return "v" + strconv.Itoa(v*2) }))

	want := make([]string, n)
	for i := range want {
		want[i] = "v" + strconv.Itoa(i*2)
	}
	assert.Equal(t, want, got, "every value is mapped once, in order")
}

func TestForward_ClosesWhenInputCloses(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	t.Run("empty input", func(t *testing.T) {
		in := make(chan int)
		close(in)
		assert.Empty(t, drainUntilClosed(t, forward(ctx, in, func(v int) int { return v })))
	})

	t.Run("values already queued are delivered before the close", func(t *testing.T) {
		in := make(chan int, 3)
		in <- 1
		in <- 2
		in <- 3
		close(in)
		assert.Equal(t, []int{1, 2, 3}, drainUntilClosed(t, forward(ctx, in, func(v int) int { return v })))
	})
}

func TestForward_OutputBufferIsOne(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	out := forward(ctx, make(chan int), func(v int) int { return v })
	assert.Equal(t, 1, cap(out))
}

func TestForward_StopsWhenContextEndsEvenIfReaderGone(t *testing.T) {
	t.Run("values pending and nobody reading", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		baseline := goroutineBaseline(t)

		in := make(chan int, 10)
		for i := 0; i < cap(in); i++ {
			in <- i
		}
		out := forward(ctx, in, func(v int) int { return v })

		// The forwarder fills the output buffer with one value, takes a second
		// and parks on the send: that is the "reader gone" state.
		require.Eventually(t, func() bool { return len(out) == 1 && len(in) == cap(in)-2 },
			forwardWait, time.Millisecond, "forwarder never reached the blocked send")

		cancel()

		require.Eventually(t, func() bool { return runtime.NumGoroutine() <= baseline }, 3*time.Second, 10*time.Millisecond,
			"goroutines: baseline %d", baseline)
		drainUntilClosed(t, out)
	})

	t.Run("input open and empty, nobody reading", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		baseline := goroutineBaseline(t)

		in := make(chan int) // never written to, never closed
		out := forward(ctx, in, func(v int) int { return v })

		// The forwarder is a goroutine on top of the sampled baseline while it
		// waits for a value that never comes.
		require.Eventually(t, func() bool { return runtime.NumGoroutine() > baseline },
			forwardWait, time.Millisecond, "forwarder goroutine never started")

		cancel()

		require.Eventually(t, func() bool { return runtime.NumGoroutine() <= baseline }, 3*time.Second, 10*time.Millisecond,
			"goroutines: baseline %d", baseline)
		assert.Empty(t, drainUntilClosed(t, out))
	})
}
