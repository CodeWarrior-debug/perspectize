package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"

	"github.com/CodeWarrior-debug/perspectize/backend/pkg/middleware"
)

func TestRecoverer_Panic_RecordsErrorOnActiveSpan(t *testing.T) {
	recorder := tracetest.NewSpanRecorder()
	tp := trace.NewTracerProvider(trace.WithSpanProcessor(recorder))
	tracer := tp.Tracer("test")

	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		panic("boom")
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	ctx, span := tracer.Start(req.Context(), "test-span")
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	middleware.Recoverer(next).ServeHTTP(rec, req)
	span.End()

	assert.Equal(t, http.StatusInternalServerError, rec.Code)

	spans := recorder.Ended()
	require.Len(t, spans, 1)

	assert.Equal(t, codes.Error, spans[0].Status().Code)
	assert.Equal(t, "panic", spans[0].Status().Description)

	events := spans[0].Events()
	require.NotEmpty(t, events)

	var found bool
	for _, e := range events {
		if e.Name == "exception" {
			found = true
		}
	}
	assert.True(t, found, "expected an exception event on the span")
}

func TestRecoverer_NoPanic_Unaffected(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rec := httptest.NewRecorder()

	middleware.Recoverer(next).ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "ok", rec.Body.String())
}
