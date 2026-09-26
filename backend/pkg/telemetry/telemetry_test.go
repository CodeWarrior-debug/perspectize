package telemetry_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	sdkresource "go.opentelemetry.io/otel/sdk/resource"

	"github.com/CodeWarrior-debug/perspectize/backend/pkg/buildinfo"
	"github.com/CodeWarrior-debug/perspectize/backend/pkg/telemetry"
)

// assertAttr fails the test unless res carries key=want among its attributes.
func assertAttr(t *testing.T, res *sdkresource.Resource, key, want string) {
	t.Helper()
	require.NotNil(t, res)
	for _, kv := range res.Attributes() {
		if string(kv.Key) == key {
			assert.Equal(t, want, kv.Value.Emit())
			return
		}
	}
	t.Fatalf("resource missing attribute %q (attrs: %v)", key, res.Attributes())
}

func TestSetup_NoEndpoint_IsNoop(t *testing.T) {
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")

	shutdown, err := telemetry.Setup(context.Background(), telemetry.Config{Environment: "test"})
	require.NoError(t, err)

	assert.False(t, telemetry.Enabled())
	assert.Nil(t, telemetry.Resource())

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	assert.NoError(t, shutdown(ctx))
}

func TestSetup_WithEndpoint_SetsResourceAttrs(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer srv.Close()

	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", srv.URL)
	t.Setenv("OTEL_RESOURCE_ATTRIBUTES", "")

	shutdown, err := telemetry.Setup(context.Background(), telemetry.Config{Environment: "test"})
	require.NoError(t, err)
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = shutdown(ctx)
	}()

	assert.True(t, telemetry.Enabled())

	res := telemetry.Resource()
	assertAttr(t, res, "service.name", "perspectize-backend")
	assertAttr(t, res, "deployment.environment.name", "test")
	assertAttr(t, res, "service.version", buildinfo.Version)
}

func TestSetup_ResourceFromEnvOverrides(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer srv.Close()

	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", srv.URL)
	t.Setenv("OTEL_RESOURCE_ATTRIBUTES", "service.version=9.9.9")

	shutdown, err := telemetry.Setup(context.Background(), telemetry.Config{Environment: "test"})
	require.NoError(t, err)
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = shutdown(ctx)
	}()

	res := telemetry.Resource()
	assertAttr(t, res, "service.version", "9.9.9")
}

func TestSetup_CustomServiceName(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer srv.Close()

	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", srv.URL)
	t.Setenv("OTEL_RESOURCE_ATTRIBUTES", "")

	shutdown, err := telemetry.Setup(context.Background(), telemetry.Config{
		ServiceName: "custom-service",
		Environment: "",
	})
	require.NoError(t, err)
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = shutdown(ctx)
	}()

	res := telemetry.Resource()
	assertAttr(t, res, "service.name", "custom-service")
}

func TestSetup_MeterAndTracerAreUsable(t *testing.T) {
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")

	shutdown, err := telemetry.Setup(context.Background(), telemetry.Config{})
	require.NoError(t, err)
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = shutdown(ctx)
	}()

	// These must never be nil, disabled or not: callers unconditionally
	// call Tracer()/Meter() to create spans and instruments.
	assert.NotNil(t, telemetry.Tracer())
	assert.NotNil(t, telemetry.Meter())

	_, span := telemetry.Tracer().Start(context.Background(), "test-span")
	span.End()

	counter, err := telemetry.Meter().Int64Counter("test.counter")
	require.NoError(t, err)
	counter.Add(context.Background(), 1)
}
