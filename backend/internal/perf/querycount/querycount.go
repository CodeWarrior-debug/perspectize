// Package querycount counts the SQL statements a *gorm.DB issues, so tests can
// assert "this code path costs at most N round-trips" and fail in CI when an
// N+1 or a duplicated lookup sneaks back in.
//
// It counts through GORM callbacks, so it works the same against go-sqlmock
// (repository unit tests) and a real Postgres (the opt-in perf harness).
//
// Typical use:
//
//	db, mock := newMockDB(t)
//	// ... queue expectations ...
//	querycount.AssertAtMost(t, db, 1, func() {
//		_, _ = repo.GetByIDs(ctx, ids) // 50 ids, still ONE query
//	})
//
// Use Attach directly when one test needs the statement text (Statements) or
// several measured sections.
package querycount

import (
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"gorm.io/gorm"
)

// registrations makes callback names unique per Attach call: GORM rejects a
// second callback registered under the same name on the same *gorm.DB.
var registrations atomic.Int64

// Counter tallies statements issued on the *gorm.DB it was attached to.
type Counter struct {
	mu    sync.Mutex
	stmts []string
}

// Attach registers counting callbacks on db and returns the Counter. Every
// GORM operation is covered: Query (Find/First), Row (Raw().Scan, Count),
// Create, Update, Delete and Raw (Exec).
func Attach(t testing.TB, db *gorm.DB) *Counter {
	t.Helper()
	c := &Counter{}
	id := registrations.Add(1)
	hook := func(tx *gorm.DB) { c.record(tx.Statement.SQL.String()) }

	reg := []struct {
		kind string
		err  error
	}{
		{"query", db.Callback().Query().After("*").Register(fmt.Sprintf("querycount:%d:query", id), hook)},
		{"row", db.Callback().Row().After("*").Register(fmt.Sprintf("querycount:%d:row", id), hook)},
		{"create", db.Callback().Create().After("*").Register(fmt.Sprintf("querycount:%d:create", id), hook)},
		{"update", db.Callback().Update().After("*").Register(fmt.Sprintf("querycount:%d:update", id), hook)},
		{"delete", db.Callback().Delete().After("*").Register(fmt.Sprintf("querycount:%d:delete", id), hook)},
		{"raw", db.Callback().Raw().After("*").Register(fmt.Sprintf("querycount:%d:raw", id), hook)},
	}
	for _, r := range reg {
		if r.err != nil {
			t.Fatalf("querycount: register %s callback: %v", r.kind, r.err)
		}
	}
	return c
}

func (c *Counter) record(sql string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.stmts = append(c.stmts, sql)
}

// Count is the number of statements issued since Attach or the last Reset.
func (c *Counter) Count() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.stmts)
}

// Statements returns a copy of the SQL text issued, in order. Handy for
// failure messages and for asserting two calls are not the same statement.
func (c *Counter) Statements() []string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]string(nil), c.stmts...)
}

// Reset clears the tally between measured sections.
func (c *Counter) Reset() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.stmts = nil
}

// AssertAtMost runs fn and fails the test if it issued more than max
// statements. The failure lists every statement so a regression is diagnosable
// from the CI log alone.
//
// Pick max as the number the path costs TODAY (not a generous ceiling): the
// point is that adding a query, or losing a batch, turns the test red.
func AssertAtMost(t testing.TB, db *gorm.DB, max int, fn func()) {
	t.Helper()
	c := Attach(t, db)
	fn()
	c.AssertAtMost(t, max)
}

// AssertAtMost fails the test if more than max statements were counted.
func (c *Counter) AssertAtMost(t testing.TB, max int) {
	t.Helper()
	if got := c.Count(); got > max {
		t.Errorf("expected at most %d SQL statement(s), got %d:\n  %s",
			max, got, strings.Join(c.Statements(), "\n  "))
	}
}

// AssertExactly fails unless exactly want statements were counted. Prefer this
// over AssertAtMost when zero matters (e.g. "an empty input must not hit the DB").
func (c *Counter) AssertExactly(t testing.TB, want int) {
	t.Helper()
	if got := c.Count(); got != want {
		t.Errorf("expected exactly %d SQL statement(s), got %d:\n  %s",
			want, got, strings.Join(c.Statements(), "\n  "))
	}
}
