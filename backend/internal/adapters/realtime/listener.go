package realtime

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

const (
	listenChannel  = "thread_events"
	initialBackoff = 250 * time.Millisecond
	maxBackoff     = 10 * time.Second
)

// Listener owns a dedicated Postgres connection that LISTENs on the
// thread_events channel and feeds each decoded EventEnvelope into the Hub. It
// reconnects with capped exponential backoff and asks the Hub to reset every
// subscriber whenever the connection drops, so consumers know to re-sync.
type Listener struct {
	dsn string
	hub *Hub
}

// NewListener returns a Listener that will dial dsn and publish into hub.
func NewListener(dsn string, hub *Hub) *Listener {
	return &Listener{dsn: dsn, hub: hub}
}

// Run blocks until ctx is canceled. It repeatedly opens a dedicated
// connection, LISTENs, and forwards notifications. On any connection-level
// error (while ctx is still live) it logs, resets Hub subscribers, sleeps for
// the current backoff, and retries. Backoff starts at 250ms, doubles, and is
// capped at 10s; it resets after a connection attempt returns without error.
func (l *Listener) Run(ctx context.Context) {
	backoff := initialBackoff
	for ctx.Err() == nil {
		// Reset backoff as soon as a connection is established and LISTEN
		// succeeds, so a long-lived connection that later drops retries fast.
		err := l.listenOnce(ctx, func() { backoff = initialBackoff })
		if ctx.Err() != nil {
			return
		}
		if err != nil {
			slog.Warn("thread_events listener error; will reconnect",
				"error", err, "backoff", backoff)
			l.hub.ResetAll()
			select {
			case <-ctx.Done():
				return
			case <-time.After(backoff):
			}
			if backoff < maxBackoff {
				backoff *= 2
				if backoff > maxBackoff {
					backoff = maxBackoff
				}
			}
		}
	}
}

// listenOnce opens one dedicated connection, issues LISTEN, and loops on
// WaitForNotification until an error occurs or ctx is canceled. A malformed
// payload is logged and skipped rather than ending the loop.
func (l *Listener) listenOnce(ctx context.Context, onReady func()) error {
	conn, err := pgx.Connect(ctx, l.dsn)
	if err != nil {
		return err
	}
	defer func() { _ = conn.Close(context.Background()) }()

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
