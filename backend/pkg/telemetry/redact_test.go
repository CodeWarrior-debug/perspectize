package telemetry_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"

	"github.com/CodeWarrior-debug/perspectize/backend/pkg/telemetry"
)

// urlFull returns the url.full attribute of the only exported span.
func urlFull(t *testing.T, exp *tracetest.InMemoryExporter) string {
	t.Helper()
	spans := exp.GetSpans()
	require.Len(t, spans, 1)
	for _, kv := range spans[0].Attributes {
		if kv.Key == "url.full" {
			return kv.Value.AsString()
		}
	}
	t.Fatalf("span has no url.full (attrs: %v)", spans[0].Attributes)
	return ""
}

// doGet sends one GET through an otelhttp transport traced by a provider
// whose exporter is wrapped in RedactURLs, and returns the recorded url.full.
func doGet(t *testing.T, target string) string {
	t.Helper()
	exp := tracetest.NewInMemoryExporter()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSyncer(telemetry.RedactURLs(exp)))
	client := &http.Client{Transport: otelhttp.NewTransport(http.DefaultTransport, otelhttp.WithTracerProvider(tp))}

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, target, nil)
	require.NoError(t, err)
	resp, err := client.Do(req)
	require.NoError(t, err)
	_ = resp.Body.Close()
	require.NoError(t, tp.ForceFlush(context.Background()))
	return urlFull(t, exp)
}

func TestRedactURLs_RedactsQueryValuesOnClientSpans(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {}))
	t.Cleanup(srv.Close)

	got := doGet(t, srv.URL+"/youtube/v3/videos?part=snippet&id=abc123&key=sekrit-api-key")

	assert.NotContains(t, got, "sekrit-api-key", "API key leaked into url.full")
	assert.NotContains(t, got, "abc123")
	assert.True(t, strings.HasPrefix(got, srv.URL+"/youtube/v3/videos?"), "path must be kept: %s", got)
	for _, k := range []string{"part=REDACTED", "id=REDACTED", "key=REDACTED"} {
		assert.Contains(t, got, k)
	}
}

func TestRedactURLs_LeavesURLWithoutQueryUnchanged(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {}))
	t.Cleanup(srv.Close)

	assert.Equal(t, srv.URL+"/3/movie/550", doGet(t, srv.URL+"/3/movie/550"))
}
