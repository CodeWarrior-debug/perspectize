package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/cors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
)

func TestCorsOptions_PreflightAllowsTraceAndClientHeaders(t *testing.T) {
	handler := cors.Handler(corsOptions([]string{"https://app.example.com"}))(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}),
	)

	req := httptest.NewRequest(http.MethodOptions, "/graphql", nil)
	req.Header.Set("Origin", "https://app.example.com")
	req.Header.Set("Access-Control-Request-Method", "POST")
	req.Header.Set("Access-Control-Request-Headers", "traceparent,x-client-version,x-client-platform")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	assert.Equal(t, "https://app.example.com", rec.Header().Get("Access-Control-Allow-Origin"))
	allowedHeaders := strings.ToLower(rec.Header().Get("Access-Control-Allow-Headers"))
	assert.Contains(t, allowedHeaders, "traceparent")
	assert.Contains(t, allowedHeaders, "x-client-version")
	assert.Contains(t, allowedHeaders, "x-client-platform")
}

// withTestTracerProvider installs tp as the global TracerProvider for the
// duration of the test, restoring the previous one afterwards.
func withTestTracerProvider(t *testing.T, tp *sdktrace.TracerProvider) {
	t.Helper()
	previous := otel.GetTracerProvider()
	otel.SetTracerProvider(tp)
	t.Cleanup(func() {
		otel.SetTracerProvider(previous)
	})
}

func TestWithTracing_CreatesSpanForGraphQL(t *testing.T) {
	recorder := tracetest.NewSpanRecorder()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(recorder))
	withTestTracerProvider(t, tp)

	handler := withTracing(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodPost, "/graphql", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	require.NoError(t, tp.ForceFlush(req.Context()))

	spans := recorder.Ended()
	require.Len(t, spans, 1)
	assert.Equal(t, "POST /graphql", spans[0].Name())
}

func TestWithTracing_NoSpanForHealthCheck(t *testing.T) {
	recorder := tracetest.NewSpanRecorder()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(recorder))
	withTestTracerProvider(t, tp)

	handler := withTracing(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	require.NoError(t, tp.ForceFlush(req.Context()))

	assert.Empty(t, recorder.Ended())
}

func TestWithTracing_NoSpanForWebsocketHandshake(t *testing.T) {
	recorder := tracetest.NewSpanRecorder()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(recorder))
	withTestTracerProvider(t, tp)

	handler := withTracing(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/graphql", nil)
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ==")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	require.NoError(t, tp.ForceFlush(req.Context()))

	assert.Empty(t, recorder.Ended())
}

func TestWithTracing_NeverRecordsAuthorizationHeader(t *testing.T) {
	const secret = "supersecret"

	recorder := tracetest.NewSpanRecorder()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(recorder))
	withTestTracerProvider(t, tp)

	handler := withTracing(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodPost, "/graphql", nil)
	req.Header.Set("Authorization", "Bearer "+secret)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	require.NoError(t, tp.ForceFlush(req.Context()))

	spans := recorder.Ended()
	require.Len(t, spans, 1)

	for _, attr := range spans[0].Attributes() {
		assert.NotContains(t, attr.Value.Emit(), secret, "span attribute %s leaked the Authorization value", attr.Key)
	}
	for _, event := range spans[0].Events() {
		assert.NotContains(t, event.Name, secret)
		for _, attr := range event.Attributes {
			assert.NotContains(t, attr.Value.Emit(), secret, "span event attribute %s leaked the Authorization value", attr.Key)
		}
	}
}
