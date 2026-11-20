package main

import (
	"context"
	"errors"
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

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/server"
)

// rejectingVerifier treats every request as unauthenticated (the auth
// middleware then passes it through).
type rejectingVerifier struct{}

func (rejectingVerifier) Verify(context.Context, string) (domain.Identity, error) {
	return domain.Identity{}, errors.New("unauthenticated")
}

func TestCORSOptions_PreflightAllowsTraceAndClientHeaders(t *testing.T) {
	handler := cors.Handler(server.CORSOptions([]string{"https://app.example.com"}))(
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

func chainMiddleware(h http.Handler, d server.Deps) http.Handler {
	mws := server.Middleware(d)
	for i := len(mws) - 1; i >= 0; i-- {
		h = mws[i](h)
	}
	return h
}

func TestMiddleware_RateLimited429CarriesCORSHeaders(t *testing.T) {
	const origin = "https://app.example.com"
	h := chainMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}), server.Deps{CORSOrigins: []string{origin}, RateLimitPerMin: 1, TokenVerifier: rejectingVerifier{}})

	var last *httptest.ResponseRecorder
	for i := 0; i < 3; i++ {
		req := httptest.NewRequest(http.MethodGet, "/health", nil)
		req.Header.Set("Origin", origin)
		req.RemoteAddr = "203.0.113.7:1234"
		last = httptest.NewRecorder()
		h.ServeHTTP(last, req)
	}

	assert.Equal(t, http.StatusTooManyRequests, last.Code)
	assert.Equal(t, origin, last.Header().Get("Access-Control-Allow-Origin"))
	assert.Equal(t, "true", last.Header().Get("Access-Control-Allow-Credentials"))
}

func TestMiddleware_PreflightStillAnsweredWhenRateLimited(t *testing.T) {
	const origin = "https://app.example.com"
	h := chainMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}), server.Deps{CORSOrigins: []string{origin}, RateLimitPerMin: 1, TokenVerifier: rejectingVerifier{}})

	for i := 0; i < 3; i++ {
		req := httptest.NewRequest(http.MethodOptions, "/graphql", nil)
		req.Header.Set("Origin", origin)
		req.Header.Set("Access-Control-Request-Method", "POST")
		req.Header.Set("Access-Control-Request-Headers", "content-type,authorization")
		req.RemoteAddr = "203.0.113.8:1234"
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)

		assert.Less(t, rec.Code, 300, "preflight %d", i)
		assert.Equal(t, origin, rec.Header().Get("Access-Control-Allow-Origin"))
		assert.Contains(t, strings.ToLower(rec.Header().Get("Access-Control-Allow-Headers")), "authorization")
	}
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
