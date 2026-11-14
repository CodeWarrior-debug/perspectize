package services_test

import (
	"context"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	gormpg "gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// newSweeperMockDB returns a *gorm.DB backed by go-sqlmock so the sweeper's
// Run loop can be exercised without a database.
func newSweeperMockDB(t *testing.T) (*gorm.DB, sqlmock.Sqlmock) {
	t.Helper()
	sqlDB, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherRegexp))
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })
	gdb, err := gorm.Open(
		gormpg.New(gormpg.Config{Conn: sqlDB}),
		&gorm.Config{
			DisableAutomaticPing:   true,
			SkipDefaultTransaction: true,
			Logger:                 logger.Default.LogMode(logger.Silent),
		},
	)
	require.NoError(t, err)
	return gdb, mock
}

// runSweeper starts Run in a goroutine and returns a stop func that cancels it
// and waits for it to return.
func runSweeper(t *testing.T, sw *services.RetentionSweeper) (stop func()) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		sw.Run(ctx)
	}()
	return func() {
		cancel()
		select {
		case <-done:
		case <-time.After(5 * time.Second):
			t.Fatal("Run did not return after context cancellation")
		}
	}
}

// A non-positive interval must fall back to a usable default. time.NewTicker
// panics on a non-positive duration, so a zero default would crash Run.
func TestRetentionSweeper_NonPositiveIntervalFallsBackToDefault(t *testing.T) {
	for _, tt := range []struct {
		name     string
		interval time.Duration
	}{
		{"zero", 0},
		{"negative", -time.Second},
	} {
		t.Run(tt.name, func(t *testing.T) {
			db, mock := newSweeperMockDB(t)
			mock.ExpectExec(`DELETE FROM messages`).WithArgs(5).WillReturnResult(sqlmock.NewResult(0, 2))

			sw := services.NewRetentionSweeper(db, 5, tt.interval)
			stop := runSweeper(t, sw)

			// Run sweeps immediately, before the first tick.
			require.Eventually(t, func() bool { return mock.ExpectationsWereMet() == nil },
				5*time.Second, time.Millisecond)
			stop()
		})
	}
}

// A positive interval must be honoured, not replaced by the 15 minute default:
// with a 1ms interval a second sweep follows the immediate one.
func TestRetentionSweeper_PositiveIntervalIsHonoured(t *testing.T) {
	db, mock := newSweeperMockDB(t)
	mock.ExpectExec(`DELETE FROM messages`).WithArgs(5).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(`DELETE FROM messages`).WithArgs(5).WillReturnResult(sqlmock.NewResult(0, 0))

	sw := services.NewRetentionSweeper(db, 5, time.Millisecond)
	stop := runSweeper(t, sw)

	assert.Eventually(t, func() bool { return mock.ExpectationsWereMet() == nil },
		5*time.Second, time.Millisecond, "expected a second sweep after one 1ms tick")
	stop()
}
