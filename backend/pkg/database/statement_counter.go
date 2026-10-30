package database

import (
	"context"
	"strings"
	"sync"

	"github.com/jackc/pgx/v5"
)

// StatementCounter is a pgx tracer that records every statement sent to
// Postgres — including the BEGIN/COMMIT/ROLLBACK that database/sql and GORM
// issue for transactions — in order. Each one is a network round trip, which
// is the cost the round-trip tests (test/roundtrips) pin down per operation.
//
// It deliberately doesn't count the Parse/Describe that pgx's statement cache
// sends the first time a query text runs on a connection: whether that
// happens depends on which pooled connection a request lands on, so it would
// make the counts flaky. Those are recorded separately in Prepares.
type StatementCounter struct {
	mu         sync.Mutex
	statements []string
	prepares   int
}

var (
	_ pgx.QueryTracer   = (*StatementCounter)(nil)
	_ pgx.PrepareTracer = (*StatementCounter)(nil)
)

// TraceQueryStart implements pgx.QueryTracer.
func (c *StatementCounter) TraceQueryStart(ctx context.Context, _ *pgx.Conn, data pgx.TraceQueryStartData) context.Context {
	c.mu.Lock()
	c.statements = append(c.statements, strings.Join(strings.Fields(data.SQL), " "))
	c.mu.Unlock()
	return ctx
}

// TraceQueryEnd implements pgx.QueryTracer.
func (c *StatementCounter) TraceQueryEnd(context.Context, *pgx.Conn, pgx.TraceQueryEndData) {}

// TracePrepareStart implements pgx.PrepareTracer.
func (c *StatementCounter) TracePrepareStart(ctx context.Context, _ *pgx.Conn, _ pgx.TracePrepareStartData) context.Context {
	c.mu.Lock()
	c.prepares++
	c.mu.Unlock()
	return ctx
}

// TracePrepareEnd implements pgx.PrepareTracer.
func (c *StatementCounter) TracePrepareEnd(context.Context, *pgx.Conn, pgx.TracePrepareEndData) {}

// Reset forgets everything recorded so far.
func (c *StatementCounter) Reset() {
	c.mu.Lock()
	c.statements = nil
	c.prepares = 0
	c.mu.Unlock()
}

// Statements returns the statements recorded since the last Reset, in order,
// with whitespace collapsed.
func (c *StatementCounter) Statements() []string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]string(nil), c.statements...)
}

// Prepares returns how many statement-cache prepares happened since Reset.
func (c *StatementCounter) Prepares() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.prepares
}
