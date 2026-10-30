package database

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

// stateIdle and stateUsed are the values of the "state" attribute on the
// db.client.connection.count instrument, matching the pool numbers the
// existing /debug/db-stats handler (stats.go) already reads from
// sql.DB.Stats().
const (
	stateIdle = "idle"
	stateUsed = "used"
)

// RegisterPoolMetrics registers observable OpenTelemetry instruments that
// report db.Stats() on every collection:
//   - db.client.connection.count{state=idle|used}
//   - db.client.connection.max
//   - db.client.connection.wait_count
//   - db.client.connection.wait_duration (seconds)
//
// The returned Registration can be used to unregister the callback (e.g. in
// tests, or during graceful shutdown). Passing a nil db is an error.
func RegisterPoolMetrics(m metric.Meter, db *sql.DB) (metric.Registration, error) {
	if db == nil {
		return nil, errors.New("database: RegisterPoolMetrics: db must not be nil")
	}

	connCount, err := m.Int64ObservableUpDownCounter(
		"db.client.connection.count",
		metric.WithDescription("Number of open connections in the pool, by state (idle or used)."),
	)
	if err != nil {
		return nil, fmt.Errorf("database: creating db.client.connection.count instrument: %w", err)
	}

	connMax, err := m.Int64ObservableGauge(
		"db.client.connection.max",
		metric.WithDescription("Maximum number of open connections allowed in the pool."),
	)
	if err != nil {
		return nil, fmt.Errorf("database: creating db.client.connection.max instrument: %w", err)
	}

	waitCount, err := m.Int64ObservableCounter(
		"db.client.connection.wait_count",
		metric.WithDescription("Total number of connections waited for."),
	)
	if err != nil {
		return nil, fmt.Errorf("database: creating db.client.connection.wait_count instrument: %w", err)
	}

	waitDuration, err := m.Float64ObservableCounter(
		"db.client.connection.wait_duration",
		metric.WithDescription("Total time blocked waiting for a new connection."),
		metric.WithUnit("s"),
	)
	if err != nil {
		return nil, fmt.Errorf("database: creating db.client.connection.wait_duration instrument: %w", err)
	}

	idleAttr := attribute.NewSet(attribute.String("state", stateIdle))
	usedAttr := attribute.NewSet(attribute.String("state", stateUsed))

	reg, err := m.RegisterCallback(func(_ context.Context, o metric.Observer) error {
		stats := db.Stats()

		o.ObserveInt64(connCount, int64(stats.Idle), metric.WithAttributeSet(idleAttr))
		o.ObserveInt64(connCount, int64(stats.InUse), metric.WithAttributeSet(usedAttr))
		o.ObserveInt64(connMax, int64(stats.MaxOpenConnections))
		o.ObserveInt64(waitCount, stats.WaitCount)
		o.ObserveFloat64(waitDuration, stats.WaitDuration.Seconds())

		return nil
	}, connCount, connMax, waitCount, waitDuration)
	if err != nil {
		return nil, fmt.Errorf("database: registering pool metrics callback: %w", err)
	}

	return reg, nil
}
