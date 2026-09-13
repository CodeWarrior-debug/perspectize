package realtime

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PgNotifier publishes event envelopes on the Postgres thread_events channel
// via pg_notify, which is what makes ephemeral events (typing, read receipts,
// participant and presence changes) cross process boundaries: every instance's
// Listener is LISTENing on the same channel.
//
// Durable MESSAGE_POSTED events are not published this way — they originate
// from the message insert trigger.
type PgNotifier struct {
	pool *pgxpool.Pool
}

var _ Notifier = (*PgNotifier)(nil)

// NewPgNotifier dials dsn and returns a notifier backed by the resulting pool.
// The caller owns the pool and must call Close when done.
func NewPgNotifier(ctx context.Context, dsn string) (*PgNotifier, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("create notifier pool: %w", err)
	}
	return &PgNotifier{pool: pool}, nil
}

// Notify emits payload on the thread_events channel.
func (n *PgNotifier) Notify(ctx context.Context, payload string) error {
	if _, err := n.pool.Exec(ctx, "SELECT pg_notify($1, $2)", listenChannel, payload); err != nil {
		return fmt.Errorf("pg_notify %s: %w", listenChannel, err)
	}
	return nil
}

// Close releases the notifier's connection pool.
func (n *PgNotifier) Close() {
	n.pool.Close()
}
