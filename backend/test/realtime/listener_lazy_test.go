package realtime_test

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/realtime"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// fakeConn is a hand-written realtime.Conn. WaitForNotification blocks until
// its context is canceled or the connection is closed.
type fakeConn struct {
	execs  []string
	mu     sync.Mutex
	closed atomic.Bool
	done   chan struct{}
	once   sync.Once
}

func (c *fakeConn) Exec(_ context.Context, sql string, _ ...any) (pgconn.CommandTag, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.execs = append(c.execs, sql)
	return pgconn.CommandTag{}, nil
}

func (c *fakeConn) WaitForNotification(ctx context.Context) (*pgconn.Notification, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-c.done:
		return nil, errors.New("closed")
	}
}

func (c *fakeConn) Close(context.Context) error {
	c.closed.Store(true)
	c.once.Do(func() { close(c.done) })
	return nil
}

// fakeDialer records every dial and hands back a fresh fakeConn.
type fakeDialer struct {
	mu    sync.Mutex
	conns []*fakeConn
}

func (d *fakeDialer) dial(context.Context, string) (realtime.Conn, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	c := &fakeConn{done: make(chan struct{})}
	d.conns = append(d.conns, c)
	return c, nil
}

func (d *fakeDialer) dials() int {
	d.mu.Lock()
	defer d.mu.Unlock()
	return len(d.conns)
}

func (d *fakeDialer) conn(i int) *fakeConn {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.conns[i]
}

// receivesReset reports whether ch yields a StreamResetEvent within timeout.
func receivesReset(ch <-chan domain.ThreadEvent, timeout time.Duration) bool {
	select {
	case evt := <-ch:
		_, ok := evt.(domain.StreamResetEvent)
		return ok
	case <-time.After(timeout):
		return false
	}
}

func TestListener_LazyStateMachine(t *testing.T) {
	const grace = 150 * time.Millisecond
	const settle = 3 * grace

	tests := []struct {
		name       string
		scenario   func(t *testing.T, hub *realtime.Hub, d *fakeDialer)
		wantDials  int
		wantClosed []bool // per dialed connection, evaluated after the scenario
	}{
		{
			name: "idle holds no connection with zero subscribers",
			scenario: func(t *testing.T, _ *realtime.Hub, d *fakeDialer) {
				time.Sleep(settle)
				assert.Equal(t, 0, d.dials())
			},
			wantDials: 0,
		},
		{
			name: "first subscriber dials, listens and resets",
			scenario: func(t *testing.T, hub *realtime.Hub, d *fakeDialer) {
				ch, unsub := hub.Subscribe(1, 1)
				t.Cleanup(unsub)
				require.True(t, receivesReset(ch, time.Second), "expected StreamReset after connect")
				require.Equal(t, 1, d.dials())
				d.conn(0).mu.Lock()
				defer d.conn(0).mu.Unlock()
				assert.Equal(t, []string{"LISTEN thread_events"}, d.conn(0).execs)
			},
			wantDials:  1,
			wantClosed: []bool{false},
		},
		{
			name: "last subscriber leaving closes after grace then idles",
			scenario: func(t *testing.T, hub *realtime.Hub, d *fakeDialer) {
				ch, unsub := hub.Subscribe(1, 1)
				require.True(t, receivesReset(ch, time.Second))
				unsub()
				assert.Eventually(t, func() bool { return d.conn(0).closed.Load() },
					settle, 10*time.Millisecond, "connection should close after grace")
				time.Sleep(settle)
				assert.Equal(t, 1, d.dials(), "no re-dial while idle")
			},
			wantDials:  1,
			wantClosed: []bool{true},
		},
		{
			name: "subscriber during grace cancels the close without re-dial",
			scenario: func(t *testing.T, hub *realtime.Hub, d *fakeDialer) {
				ch, unsub := hub.Subscribe(1, 1)
				require.True(t, receivesReset(ch, time.Second))
				unsub()
				time.Sleep(grace / 3)
				_, unsub2 := hub.Subscribe(2, 2)
				t.Cleanup(unsub2)
				time.Sleep(settle)
				assert.False(t, d.conn(0).closed.Load(), "connection must stay open")
			},
			wantDials:  1,
			wantClosed: []bool{false},
		},
		{
			name: "subscriber after idle close re-dials and resets",
			scenario: func(t *testing.T, hub *realtime.Hub, d *fakeDialer) {
				ch, unsub := hub.Subscribe(1, 1)
				require.True(t, receivesReset(ch, time.Second))
				unsub()
				require.Eventually(t, func() bool { return d.conn(0).closed.Load() },
					settle, 10*time.Millisecond)
				ch2, unsub2 := hub.Subscribe(1, 1)
				t.Cleanup(unsub2)
				assert.True(t, receivesReset(ch2, time.Second), "reset after re-dial")
			},
			wantDials:  2,
			wantClosed: []bool{true, false},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			hub := realtime.NewHub(nil, nil, nil)
			d := &fakeDialer{}
			l := realtime.NewListener("dsn", hub,
				realtime.WithDialer(d.dial), realtime.WithGracePeriod(grace))

			ctx, cancel := context.WithCancel(context.Background())
			done := make(chan struct{})
			go func() { l.Run(ctx); close(done) }()

			tt.scenario(t, hub, d)

			assert.Equal(t, tt.wantDials, d.dials())
			for i, want := range tt.wantClosed {
				assert.Equal(t, want, d.conn(i).closed.Load(), "conn %d closed", i)
			}

			cancel()
			select {
			case <-done:
			case <-time.After(time.Second):
				t.Fatal("Run did not return after cancel (graceful shutdown)")
			}
			for i := 0; i < d.dials(); i++ {
				assert.True(t, d.conn(i).closed.Load(), "conn %d closed on shutdown", i)
			}
		})
	}
}

func TestListener_ReconnectsWithBackoffWhileSubscribed(t *testing.T) {
	hub := realtime.NewHub(nil, nil, nil)
	var attempts atomic.Int32
	dial := func(context.Context, string) (realtime.Conn, error) {
		if attempts.Add(1) < 3 {
			return nil, errors.New("dial failed")
		}
		return &fakeConn{done: make(chan struct{})}, nil
	}
	l := realtime.NewListener("dsn", hub,
		realtime.WithDialer(dial),
		realtime.WithGracePeriod(time.Minute),
		realtime.WithBackoff(5*time.Millisecond, 20*time.Millisecond))

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { l.Run(ctx); close(done) }()

	_, unsub := hub.Subscribe(1, 1)
	t.Cleanup(unsub)

	require.Eventually(t, func() bool { return attempts.Load() >= 3 },
		2*time.Second, 5*time.Millisecond, "should retry after dial failures")

	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Run did not return after cancel")
	}
}
