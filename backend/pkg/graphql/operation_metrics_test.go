package graphql_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/99designs/gqlgen/graphql"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/vektah/gqlparser/v2/ast"
	"github.com/vektah/gqlparser/v2/gqlerror"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"

	gqltiming "github.com/CodeWarrior-debug/perspectize/backend/pkg/graphql"
	apimw "github.com/CodeWarrior-debug/perspectize/backend/pkg/middleware"
	"github.com/CodeWarrior-debug/perspectize/backend/pkg/telemetry"
)

// newOperationContext builds a minimal *graphql.OperationContext suitable for
// driving OperationMetrics directly, without a full gqlgen server/schema.
func newOperationContext(name string, opType ast.Operation) context.Context {
	oc := &graphql.OperationContext{
		OperationName: name,
		Operation:     &ast.OperationDefinition{Operation: opType},
	}
	return graphql.WithOperationContext(context.Background(), oc)
}

// contextWithClientVersion runs apimw.ClientInfo for real (via an HTTP
// request carrying X-Client-Version) and layers a GraphQL operation context
// on top of the resulting request context, so OperationMetrics can read
// client_version through apimw.ClientInfoFrom exactly as it does in
// production, without reaching into middleware's unexported context key.
func contextWithClientVersion(t *testing.T, name string, opType ast.Operation, version string) context.Context {
	t.Helper()

	var captured context.Context
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		captured = r.Context()
	})

	req := httptest.NewRequest(http.MethodPost, "/graphql", nil)
	req.Header.Set("X-Client-Version", version)
	rec := httptest.NewRecorder()
	apimw.ClientInfo(next).ServeHTTP(rec, req)

	require.NotNil(t, captured)

	oc := &graphql.OperationContext{
		OperationName: name,
		Operation:     &ast.OperationDefinition{Operation: opType},
	}
	return graphql.WithOperationContext(captured, oc)
}

// nextHandler returns a graphql.OperationHandler whose ResponseHandler
// returns resp every time it's called, and counts how many times it's
// called. The counter is atomic because some callers (the concurrency test)
// invoke the returned ResponseHandler from multiple goroutines.
func nextHandler(resp *graphql.Response) (graphql.OperationHandler, *atomic.Int64) {
	var calls atomic.Int64
	return func(ctx context.Context) graphql.ResponseHandler {
			return func(ctx context.Context) *graphql.Response {
				calls.Add(1)
				return resp
			}
		},
		&calls
}

func collectHistogram(t *testing.T, reader sdkmetric.Reader) metricdata.Metrics {
	t.Helper()
	var rm metricdata.ResourceMetrics
	require.NoError(t, reader.Collect(context.Background(), &rm))
	require.Len(t, rm.ScopeMetrics, 1)
	require.Len(t, rm.ScopeMetrics[0].Metrics, 1)
	return rm.ScopeMetrics[0].Metrics[0]
}

func TestOperationMetrics_Success_RecordsOneDataPoint(t *testing.T) {
	reader := sdkmetric.NewManualReader()
	mp := sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader))
	meter := mp.Meter("test")
	names := telemetry.NewBoundedSet(200, telemetry.OperationNamePattern)

	mw := gqltiming.OperationMetrics(meter, names)

	next, calls := nextHandler(&graphql.Response{})
	ctx := newOperationContext("ListContent", ast.Query)
	rh := mw(ctx, next)
	resp := rh(ctx)

	require.NotNil(t, resp)
	assert.Equal(t, int64(1), calls.Load())

	m := collectHistogram(t, reader)
	assert.Equal(t, "graphql.server.operation.duration", m.Name)

	hist, ok := m.Data.(metricdata.Histogram[float64])
	require.True(t, ok)
	require.Len(t, hist.DataPoints, 1)
	dp := hist.DataPoints[0]

	name, ok := dp.Attributes.Value("graphql.operation.name")
	require.True(t, ok)
	assert.Equal(t, "ListContent", name.AsString())

	opType, ok := dp.Attributes.Value("graphql.operation.type")
	require.True(t, ok)
	assert.Equal(t, "query", opType.AsString())

	hasErrors, ok := dp.Attributes.Value("has_errors")
	require.True(t, ok)
	assert.False(t, hasErrors.AsBool())
}

func TestOperationMetrics_ResolverErrors_HasErrorsTrue(t *testing.T) {
	reader := sdkmetric.NewManualReader()
	mp := sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader))
	meter := mp.Meter("test")
	names := telemetry.NewBoundedSet(200, telemetry.OperationNamePattern)

	mw := gqltiming.OperationMetrics(meter, names)

	next, _ := nextHandler(&graphql.Response{Errors: gqlerror.List{{Message: "boom"}}})
	ctx := newOperationContext("ListContent", ast.Query)
	rh := mw(ctx, next)
	rh(ctx)

	m := collectHistogram(t, reader)
	hist, ok := m.Data.(metricdata.Histogram[float64])
	require.True(t, ok)
	require.Len(t, hist.DataPoints, 1)

	hasErrors, ok := hist.DataPoints[0].Attributes.Value("has_errors")
	require.True(t, ok)
	assert.True(t, hasErrors.AsBool())
}

func TestOperationMetrics_NilResponse_HasErrorsFalse(t *testing.T) {
	reader := sdkmetric.NewManualReader()
	mp := sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader))
	meter := mp.Meter("test")
	names := telemetry.NewBoundedSet(200, telemetry.OperationNamePattern)

	mw := gqltiming.OperationMetrics(meter, names)

	next, _ := nextHandler(nil)
	ctx := newOperationContext("ListContent", ast.Query)
	rh := mw(ctx, next)

	assert.NotPanics(t, func() { rh(ctx) })

	m := collectHistogram(t, reader)
	hist, ok := m.Data.(metricdata.Histogram[float64])
	require.True(t, ok)
	require.Len(t, hist.DataPoints, 1)

	hasErrors, ok := hist.DataPoints[0].Attributes.Value("has_errors")
	require.True(t, ok)
	assert.False(t, hasErrors.AsBool())
}

func TestOperationMetrics_AnonymousOperation_NameIsAnonymous(t *testing.T) {
	reader := sdkmetric.NewManualReader()
	mp := sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader))
	meter := mp.Meter("test")
	names := telemetry.NewBoundedSet(200, telemetry.OperationNamePattern)

	mw := gqltiming.OperationMetrics(meter, names)

	next, _ := nextHandler(&graphql.Response{})
	ctx := newOperationContext("", ast.Query)
	rh := mw(ctx, next)
	rh(ctx)

	m := collectHistogram(t, reader)
	hist, ok := m.Data.(metricdata.Histogram[float64])
	require.True(t, ok)
	require.Len(t, hist.DataPoints, 1)

	name, ok := hist.DataPoints[0].Attributes.Value("graphql.operation.name")
	require.True(t, ok)
	assert.Equal(t, "anonymous", name.AsString())
}

func TestOperationMetrics_MutationType(t *testing.T) {
	reader := sdkmetric.NewManualReader()
	mp := sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader))
	meter := mp.Meter("test")
	names := telemetry.NewBoundedSet(200, telemetry.OperationNamePattern)

	mw := gqltiming.OperationMetrics(meter, names)

	next, _ := nextHandler(&graphql.Response{})
	ctx := newOperationContext("CreateUser", ast.Mutation)
	rh := mw(ctx, next)
	rh(ctx)

	m := collectHistogram(t, reader)
	hist, ok := m.Data.(metricdata.Histogram[float64])
	require.True(t, ok)
	require.Len(t, hist.DataPoints, 1)

	opType, ok := hist.DataPoints[0].Attributes.Value("graphql.operation.type")
	require.True(t, ok)
	assert.Equal(t, "mutation", opType.AsString())
}

func TestOperationMetrics_Subscription_RecordsOnlyFirstResponse(t *testing.T) {
	reader := sdkmetric.NewManualReader()
	mp := sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader))
	meter := mp.Meter("test")
	names := telemetry.NewBoundedSet(200, telemetry.OperationNamePattern)

	mw := gqltiming.OperationMetrics(meter, names)

	next, calls := nextHandler(&graphql.Response{})
	ctx := newOperationContext("ThreadEvents", ast.Subscription)
	rh := mw(ctx, next)

	// Simulate three responses on a long-lived subscription.
	rh(ctx)
	rh(ctx)
	rh(ctx)

	assert.Equal(t, int64(3), calls.Load())

	m := collectHistogram(t, reader)
	hist, ok := m.Data.(metricdata.Histogram[float64])
	require.True(t, ok)
	require.Len(t, hist.DataPoints, 1, "expected exactly one data point for a repeatedly-called subscription response handler")

	opType, ok := hist.DataPoints[0].Attributes.Value("graphql.operation.type")
	require.True(t, ok)
	assert.Equal(t, "subscription", opType.AsString())
}

func TestOperationMetrics_BoundedNames_CapAtOther(t *testing.T) {
	reader := sdkmetric.NewManualReader()
	mp := sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader))
	meter := mp.Meter("test")
	names := telemetry.NewBoundedSet(200, telemetry.OperationNamePattern)

	mw := gqltiming.OperationMetrics(meter, names)

	for i := 0; i < 300; i++ {
		next, _ := nextHandler(&graphql.Response{})
		ctx := newOperationContext(fmt.Sprintf("Op%d", i), ast.Query)
		rh := mw(ctx, next)
		rh(ctx)
	}

	m := collectHistogram(t, reader)
	hist, ok := m.Data.(metricdata.Histogram[float64])
	require.True(t, ok)

	distinctNames := map[string]struct{}{}
	for _, dp := range hist.DataPoints {
		name, ok := dp.Attributes.Value("graphql.operation.name")
		require.True(t, ok)
		distinctNames[name.AsString()] = struct{}{}
	}

	assert.LessOrEqual(t, len(distinctNames), 201)
	_, hasOther := distinctNames["other"]
	assert.True(t, hasOther, "expected at least one operation to be normalized to \"other\" once the cap was reached")
}

func TestOperationMetrics_LogsClientVersion(t *testing.T) {
	reader := sdkmetric.NewManualReader()
	mp := sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader))
	meter := mp.Meter("test")
	names := telemetry.NewBoundedSet(200, telemetry.OperationNamePattern)

	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(prev) })

	mw := gqltiming.OperationMetrics(meter, names)

	next, _ := nextHandler(&graphql.Response{})
	ctx := contextWithClientVersion(t, "ListContent", ast.Query, "1.2.3")
	rh := mw(ctx, next)
	rh(ctx)

	var logLine map[string]any
	require.NoError(t, json.NewDecoder(strings.NewReader(buf.String())).Decode(&logLine))
	assert.Equal(t, "1.2.3", logLine["client_version"])
	assert.Equal(t, "ListContent", logLine["operation"])
	assert.Equal(t, "query", logLine["operation_type"])
	assert.Equal(t, false, logLine["has_errors"])
}

func TestOperationMetrics_HandlerRunsSafelyUnderConcurrentSubscriptionCalls(t *testing.T) {
	reader := sdkmetric.NewManualReader()
	mp := sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader))
	meter := mp.Meter("test")
	names := telemetry.NewBoundedSet(200, telemetry.OperationNamePattern)

	mw := gqltiming.OperationMetrics(meter, names)

	next, _ := nextHandler(&graphql.Response{})
	ctx := newOperationContext("InboxEvents", ast.Subscription)
	rh := mw(ctx, next)

	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			rh(ctx)
		}()
	}
	wg.Wait()

	m := collectHistogram(t, reader)
	hist, ok := m.Data.(metricdata.Histogram[float64])
	require.True(t, ok)
	assert.Len(t, hist.DataPoints, 1)
}
