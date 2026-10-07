package realtime

import (
	"context"
	"encoding/json"
	"log/slog"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

const (
	listenChannel  = "thread_events"
	initialBackoff = 250 * time.Millisecond
	maxBackoff     = 10 * time.Second

	// DefaultGracePeriod is how long the Listener keeps its connection after the
	// last Hub subscriber leaves, so a quick reconnect does not re-dial.
	DefaultGracePeriod = 30 * time.Second

	// connCloseTimeout bounds conn.Close so a half-dead socket can't stall
	// idle close or shutdown.
	connCloseTimeout = 5 * time.Second
)

// Conn is the slice of *pgx.Conn the Listener needs. It is the dial seam's
// product, so tests can substitute a fake without a database.
type Conn interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	WaitForNotification(ctx context.Context) (*pgconn.Notification, error)
	Close(ctx context.Context) error
}

// DialFunc opens a dedicated connection to dsn.
type DialFunc func(ctx context.Context, dsn string) (Conn, error)

func pgxDial(ctx context.Context, dsn string) (Conn, error) {
	return pgx.Connect(ctx, dsn)
}

// ListenerOption customizes a Listener.
type ListenerOption func(*Listener)

// WithDialer replaces the function used to open the LISTEN connection.
func WithDialer(d DialFunc) ListenerOption { return func(l *Listener) { l.dial = d } }

// WithGracePeriod sets how long the connection lingers after the last
// subscriber leaves before it is closed.
func WithGracePeriod(d time.Duration) ListenerOption {
	return func(l *Listener) { l.grace = d }
}

// WithBackoff overrides the reconnect backoff bounds (initial, max).
func WithBackoff(initial, max time.Duration) ListenerOption {
	return func(l *Listener) { l.initialBackoff, l.maxBackoff = initial, max }
}

// Listener owns a dedicated Postgres connection that LISTENs on the
// thread_events channel and feeds each decoded EventEnvelope into the Hub.
//
// The connection is lazy so the database can scale to zero when nobody is
// connected: the Listener is IDLE (no connection) while the Hub has no
// subscribers, dials on the first subscriber, and closes again once the last
// subscriber has been gone for the grace period. After every successful connect
// it asks the Hub to reset all subscribers, so clients re-sync anything missed
// while the Listener was idle or reconnecting. Connection errors reconnect with
// capped exponential backoff.
type Listener struct {
	dsn            string
	hub            *Hub
	dial           DialFunc
	grace          time.Duration
	initialBackoff time.Duration
	maxBackoff     time.Duration
}

// NewListener returns a Listener that will dial dsn and publish into hub.
func NewListener(dsn string, hub *Hub, opts ...ListenerOption) *Listener {
	l := &Listener{
		dsn:            dsn,
		hub:            hub,
		dial:           pgxDial,
		grace:          DefaultGracePeriod,
		initialBackoff: initialBackoff,
		maxBackoff:     maxBackoff,
	}
	for _, o := range opts {
		o(l)
	}
	return l
}

// Run blocks until ctx is canceled.
//
// States: IDLE (no connection, waiting for a subscriber) -> ACTIVE (connected
// and LISTENing) -> GRACE (connected, zero subscribers, close timer running) ->
// IDLE. A subscriber arriving during GRACE cancels the close and stays ACTIVE
// on the same connection. On any connection-level error while subscribers are
// present it logs, sleeps for the current backoff, and retries (subscribers are
// reset once the new connection is LISTENing). Backoff starts at 250ms, doubles, and is capped at 10s; it resets
// once a connection is established and LISTEN succeeds.
func (l *Listener) Run(ctx context.Context) {
	backoff := l.initialBackoff
	for ctx.Err() == nil {
		// IDLE: hold no connection until someone subscribes.
		if l.hub.SubscriberCount() == 0 {
			select {
			case <-ctx.Done():
				return
			case <-l.hub.Changed():
			}
			continue
		}

		var idleClosed atomic.Bool
		err := l.session(ctx, &idleClosed, func() {
			backoff = l.initialBackoff
			// Clients may have missed events while idle or disconnected.
			l.hub.ResetAll()
		})
		if ctx.Err() != nil {
			return
		}
		if idleClosed.Load() {
			slog.Info("thread_events listener idle; connection closed")
			continue
		}
		if err != nil {
			slog.Warn("thread_events listener error; will reconnect",
				"error", err, "backoff", backoff)
			// No ResetAll here: onReady resets subscribers once the next
			// connection is LISTENing, which is when they can actually resync.
			select {
			case <-ctx.Done():
				return
			case <-time.After(backoff):
			}
			if backoff < l.maxBackoff {
				backoff *= 2
				if backoff > l.maxBackoff {
					backoff = l.maxBackoff
				}
			}
		}
	}
}

// session runs one connection's lifetime together with a watcher that cancels
// it (setting idleClosed) once the Hub has had zero subscribers for the grace
// period. It returns after the connection is closed and the watcher has exited.
func (l *Listener) session(ctx context.Context, idleClosed *atomic.Bool, onReady func()) error {
	sessCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	watchDone := make(chan struct{})
	go func() {
		defer close(watchDone)
		l.watchIdle(sessCtx, func() {
			idleClosed.Store(true)
			cancel()
		})
	}()

	err := l.listenOnce(sessCtx, onReady)
	cancel()
	<-watchDone
	return err
}

// watchIdle calls closeIdle once the Hub has had no subscribers for the full
// grace period. A subscriber arriving first stops the timer. It returns when
// ctx is done or after calling closeIdle.
func (l *Listener) watchIdle(ctx context.Context, closeIdle func()) {
	var timer *time.Timer
	var timerC <-chan time.Time
	stop := func() {
		if timer != nil {
			timer.Stop()
			timer, timerC = nil, nil
		}
	}
	defer stop()

	for {
		switch count := l.hub.SubscriberCount(); {
		case count == 0 && timer == nil:
			timer = time.NewTimer(l.grace)
			timerC = timer.C
		case count > 0:
			stop()
		}

		select {
		case <-ctx.Done():
			return
		case <-l.hub.Changed():
		case <-timerC:
			if l.hub.SubscriberCount() == 0 {
				closeIdle()
				return
			}
			stop()
		}
	}
}

// listenOnce opens one dedicated connection, issues LISTEN, and loops on
// WaitForNotification until an error occurs or ctx is canceled. A malformed
// payload is logged and skipped rather than ending the loop.
func (l *Listener) listenOnce(ctx context.Context, onReady func()) error {
	conn, err := l.dial(ctx, l.dsn)
	if err != nil {
		return err
	}
	defer func() {
		// Bounded so closing a half-dead socket can't stall idle close or shutdown.
		closeCtx, cancel := context.WithTimeout(context.Background(), connCloseTimeout)
		defer cancel()
		_ = conn.Close(closeCtx)
	}()

	if _, err := conn.Exec(ctx, "LISTEN "+listenChannel); err != nil {
		return err
	}
	slog.Info("listening on thread_events")
	if onReady != nil {
		onReady()
	}

	for {
		n, err := conn.WaitForNotification(ctx)
		if err != nil {
			return err
		}
		var env domain.EventEnvelope
		if err := json.Unmarshal([]byte(n.Payload), &env); err != nil {
			slog.Warn("bad thread_events payload", "payload", n.Payload, "error", err)
			continue
		}
		l.hub.PublishEnvelope(ctx, env)
	}
}
