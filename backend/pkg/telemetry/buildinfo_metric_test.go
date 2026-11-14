package telemetry_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"

	"github.com/CodeWarrior-debug/perspectize/backend/pkg/buildinfo"
	"github.com/CodeWarrior-debug/perspectize/backend/pkg/telemetry"
)

func TestRegisterBuildInfo(t *testing.T) {
	origVersion := buildinfo.Version
	origCommit := buildinfo.Commit
	t.Cleanup(func() {
		buildinfo.Version = origVersion
		buildinfo.Commit = origCommit
	})
	buildinfo.Version = "9.9.9"
	buildinfo.Commit = "deadbeef"

	reader := sdkmetric.NewManualReader()
	mp := sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader))
	meter := mp.Meter("test")

	reg, err := telemetry.RegisterBuildInfo(meter)
	require.NoError(t, err)
	require.NotNil(t, reg)

	var rm metricdata.ResourceMetrics
	require.NoError(t, reader.Collect(context.Background(), &rm))

	require.Len(t, rm.ScopeMetrics, 1)
	require.Len(t, rm.ScopeMetrics[0].Metrics, 1)
	m := rm.ScopeMetrics[0].Metrics[0]
	assert.Equal(t, "app.build.info", m.Name)

	gauge, ok := m.Data.(metricdata.Gauge[int64])
	require.True(t, ok)
	require.Len(t, gauge.DataPoints, 1)
	dp := gauge.DataPoints[0]
	assert.Equal(t, int64(1), dp.Value)

	version, ok := dp.Attributes.Value("service.version")
	require.True(t, ok)
	assert.Equal(t, "9.9.9", version.AsString())

	commit, ok := dp.Attributes.Value("vcs.ref.head.revision")
	require.True(t, ok)
	assert.Equal(t, "deadbeef", commit.AsString())

	require.NoError(t, reg.Unregister())
}

func TestRegisterBuildInfo_DefaultCommitIsUnknown(t *testing.T) {
	origCommit := buildinfo.Commit
	t.Cleanup(func() { buildinfo.Commit = origCommit })
	buildinfo.Commit = ""

	reader := sdkmetric.NewManualReader()
	mp := sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader))
	meter := mp.Meter("test")

	reg, err := telemetry.RegisterBuildInfo(meter)
	require.NoError(t, err)
	require.NotNil(t, reg)
	t.Cleanup(func() { _ = reg.Unregister() })

	var rm metricdata.ResourceMetrics
	require.NoError(t, reader.Collect(context.Background(), &rm))

	dp := rm.ScopeMetrics[0].Metrics[0].Data.(metricdata.Gauge[int64]).DataPoints[0]
	commit, ok := dp.Attributes.Value("vcs.ref.head.revision")
	require.True(t, ok)
	assert.Equal(t, "unknown", commit.AsString())
}
