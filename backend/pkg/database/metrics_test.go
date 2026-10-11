package database

import (
	"context"
	"database/sql"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
)

// newPoolMetricsMockDB returns a *sql.DB backed by go-sqlmock, with a
// deterministic max-open-connections setting for assertions.
func newPoolMetricsMockDB(t *testing.T) *sql.DB {
	t.Helper()

	sqlDB, _, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })

	sqlDB.SetMaxOpenConns(7)

	return sqlDB
}

func metricByName(rm *metricdata.ResourceMetrics, name string) (metricdata.Metrics, bool) {
	for _, sm := range rm.ScopeMetrics {
		for _, m := range sm.Metrics {
			if m.Name == name {
				return m, true
			}
		}
	}
	return metricdata.Metrics{}, false
}

func TestRegisterPoolMetrics_NilDB(t *testing.T) {
	reader := sdkmetric.NewManualReader()
	mp := sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader))
	meter := mp.Meter("test")

	reg, err := RegisterPoolMetrics(meter, nil)
	require.Error(t, err)
	assert.Nil(t, reg)
}

func TestRegisterPoolMetrics_ReportsStats(t *testing.T) {
	sqlDB := newPoolMetricsMockDB(t)

	reader := sdkmetric.NewManualReader()
	mp := sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader))
	meter := mp.Meter("test")

	reg, err := RegisterPoolMetrics(meter, sqlDB)
	require.NoError(t, err)
	require.NotNil(t, reg)

	var rm metricdata.ResourceMetrics
	require.NoError(t, reader.Collect(context.Background(), &rm))

	countMetric, ok := metricByName(&rm, "db.client.connection.count")
	require.True(t, ok, "db.client.connection.count should be present")
	sum, ok := countMetric.Data.(metricdata.Sum[int64])
	require.True(t, ok)
	require.Len(t, sum.DataPoints, 2)

	states := map[string]int64{}
	for _, dp := range sum.DataPoints {
		state, ok := dp.Attributes.Value("state")
		require.True(t, ok)
		states[state.AsString()] = dp.Value
	}
	_, hasIdle := states[stateIdle]
	_, hasUsed := states[stateUsed]
	assert.True(t, hasIdle, "expected an idle state data point")
	assert.True(t, hasUsed, "expected a used state data point")

	maxMetric, ok := metricByName(&rm, "db.client.connection.max")
	require.True(t, ok, "db.client.connection.max should be present")
	gauge, ok := maxMetric.Data.(metricdata.Gauge[int64])
	require.True(t, ok)
	require.Len(t, gauge.DataPoints, 1)
	assert.Equal(t, int64(7), gauge.DataPoints[0].Value)

	waitCountMetric, ok := metricByName(&rm, "db.client.connection.wait_count")
	require.True(t, ok, "db.client.connection.wait_count should be present")
	waitCountSum, ok := waitCountMetric.Data.(metricdata.Sum[int64])
	require.True(t, ok)
	require.Len(t, waitCountSum.DataPoints, 1)
	assert.Equal(t, int64(0), waitCountSum.DataPoints[0].Value)

	waitDurationMetric, ok := metricByName(&rm, "db.client.connection.wait_duration")
	require.True(t, ok, "db.client.connection.wait_duration should be present")
	waitDurationSum, ok := waitDurationMetric.Data.(metricdata.Sum[float64])
	require.True(t, ok)
	require.Len(t, waitDurationSum.DataPoints, 1)
	assert.Equal(t, "s", waitDurationMetric.Unit)

	// Unregistering stops the callback from contributing further data
	// points on the next collection.
	require.NoError(t, reg.Unregister())

	var rmAfter metricdata.ResourceMetrics
	require.NoError(t, reader.Collect(context.Background(), &rmAfter))
	_, stillPresent := metricByName(&rmAfter, "db.client.connection.count")
	assert.False(t, stillPresent, "metrics should not be reported after Unregister")
}
