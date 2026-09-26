package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
	"go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"

	"github.com/CodeWarrior-debug/perspectize/backend/pkg/middleware"
)

func TestClientInfo_HeadersPropagateToContext(t *testing.T) {
	var gotVersion, gotPlatform string
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotVersion, gotPlatform = middleware.ClientInfoFrom(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("X-Client-Version", "1.2.3")
	req.Header.Set("X-Client-Platform", "ios")
	rec := httptest.NewRecorder()

	middleware.ClientInfo(next).ServeHTTP(rec, req)

	assert.Equal(t, "1.2.3", gotVersion)
	assert.Equal(t, "ios", gotPlatform)
}

func TestClientInfo_MissingHeaders_BecomeUnknown(t *testing.T) {
	var gotVersion, gotPlatform string
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotVersion, gotPlatform = middleware.ClientInfoFrom(r.Context())
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rec := httptest.NewRecorder()

	middleware.ClientInfo(next).ServeHTTP(rec, req)

	assert.Equal(t, "unknown", gotVersion)
	assert.Equal(t, "unknown", gotPlatform)
}

func TestClientInfoFrom_NoMiddleware_ReturnsUnknown(t *testing.T) {
	version, platform := middleware.ClientInfoFrom(httptest.NewRequest(http.MethodGet, "/", nil).Context())
	assert.Equal(t, "unknown", version)
	assert.Equal(t, "unknown", platform)
}

func TestClientInfo_GarbageVersion_BecomesOther(t *testing.T) {
	var gotVersion string
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotVersion, _ = middleware.ClientInfoFrom(r.Context())
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("X-Client-Version", "not a version!! ??")
	rec := httptest.NewRecorder()

	middleware.ClientInfo(next).ServeHTTP(rec, req)

	assert.Equal(t, "other", gotVersion)
}

func TestClientInfo_HugeHeader_BecomesOtherWithoutPanic(t *testing.T) {
	var gotVersion string
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotVersion, _ = middleware.ClientInfoFrom(r.Context())
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("X-Client-Version", strings.Repeat("a", 10000))
	rec := httptest.NewRecorder()

	assert.NotPanics(t, func() {
		middleware.ClientInfo(next).ServeHTTP(rec, req)
	})
	assert.Equal(t, "other", gotVersion)
}

func TestClientInfo_SetsSpanAttributes(t *testing.T) {
	recorder := tracetest.NewSpanRecorder()
	tp := trace.NewTracerProvider(trace.WithSpanProcessor(recorder))
	tracer := tp.Tracer("test")

	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("X-Client-Version", "2.0.0")
	req.Header.Set("X-Client-Platform", "android")
	rec := httptest.NewRecorder()

	ctx, span := tracer.Start(req.Context(), "test-span")
	req = req.WithContext(ctx)

	middleware.ClientInfo(next).ServeHTTP(rec, req)
	span.End()

	spans := recorder.Ended()
	require.Len(t, spans, 1)

	attrs := spans[0].Attributes()
	var gotVersion, gotPlatform string
	for _, a := range attrs {
		switch a.Key {
		case "client.version":
			gotVersion = a.Value.AsString()
		case "client.platform":
			gotPlatform = a.Value.AsString()
		}
	}
	assert.Equal(t, "2.0.0", gotVersion)
	assert.Equal(t, "android", gotPlatform)
}

func TestNewClientInfo_RecordsCounterWithAttributes(t *testing.T) {
	reader := metric.NewManualReader()
	mp := metric.NewMeterProvider(metric.WithReader(reader))
	meter := mp.Meter("test")

	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("X-Client-Version", "3.1.4")
	req.Header.Set("X-Client-Platform", "web")
	rec := httptest.NewRecorder()

	middleware.NewClientInfo(meter)(next).ServeHTTP(rec, req)

	var rm metricdata.ResourceMetrics
	require.NoError(t, reader.Collect(req.Context(), &rm))

	require.Len(t, rm.ScopeMetrics, 1)
	require.Len(t, rm.ScopeMetrics[0].Metrics, 1)
	m := rm.ScopeMetrics[0].Metrics[0]
	assert.Equal(t, "app.client.requests", m.Name)

	sum, ok := m.Data.(metricdata.Sum[int64])
	require.True(t, ok)
	require.Len(t, sum.DataPoints, 1)
	dp := sum.DataPoints[0]
	assert.Equal(t, int64(1), dp.Value)

	attrSet := dp.Attributes
	version, ok := attrSet.Value("client.version")
	require.True(t, ok)
	assert.Equal(t, "3.1.4", version.AsString())
	platform, ok := attrSet.Value("client.platform")
	require.True(t, ok)
	assert.Equal(t, "web", platform.AsString())
}
