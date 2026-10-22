package telemetry

import (
	"context"
	"net/url"

	"go.opentelemetry.io/otel/attribute"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.30.0"
)

// redactedValue replaces every query-string value in a recorded URL.
const redactedValue = "REDACTED"

// RedactURLs wraps a span exporter so every exported span has the values in
// its url.full query string replaced with "REDACTED".
//
// otelhttp records the whole request URL on outbound client spans, query
// string included. The YouTube client authenticates with ?key=<API key> and
// TMDB search sends the user's search text as ?query=, so without this the
// API key and search input would be exported to the tracing backend. Keys
// are kept (they say which parameters were sent); only values are replaced.
//
// It wraps the exporter rather than being a span processor because otelhttp
// sets url.full with SetAttributes after the span starts (too late for
// OnStart) and a span is read-only by OnEnd.
func RedactURLs(next sdktrace.SpanExporter) sdktrace.SpanExporter {
	return redactingExporter{next: next}
}

type redactingExporter struct {
	next sdktrace.SpanExporter
}

func (e redactingExporter) ExportSpans(ctx context.Context, spans []sdktrace.ReadOnlySpan) error {
	out := make([]sdktrace.ReadOnlySpan, len(spans))
	for i, s := range spans {
		out[i] = redactSpan(s)
	}
	return e.next.ExportSpans(ctx, out)
}

func (e redactingExporter) Shutdown(ctx context.Context) error { return e.next.Shutdown(ctx) }

// redactSpan returns s unchanged unless its url.full carries a query string.
func redactSpan(s sdktrace.ReadOnlySpan) sdktrace.ReadOnlySpan {
	attrs := s.Attributes()
	for i, kv := range attrs {
		if kv.Key != semconv.URLFullKey || kv.Value.Type() != attribute.STRING {
			continue
		}
		redacted, changed := redactQueryValues(kv.Value.AsString())
		if !changed {
			return s
		}
		copied := make([]attribute.KeyValue, len(attrs))
		copy(copied, attrs)
		copied[i] = semconv.URLFull(redacted)
		return redactedSpan{ReadOnlySpan: s, attrs: copied}
	}
	return s
}

// redactedSpan is s with its attributes replaced. Embedding the interface
// keeps every other method (and its unexported marker) delegating to s.
type redactedSpan struct {
	sdktrace.ReadOnlySpan
	attrs []attribute.KeyValue
}

func (r redactedSpan) Attributes() []attribute.KeyValue { return r.attrs }

// redactQueryValues replaces every query value in raw with redactedValue.
// A URL that fails to parse is replaced entirely rather than recorded as-is.
func redactQueryValues(raw string) (string, bool) {
	u, err := url.Parse(raw)
	if err != nil {
		return redactedValue, true
	}
	if u.RawQuery == "" {
		return raw, false
	}
	q := u.Query()
	for k := range q {
		q[k] = []string{redactedValue}
	}
	u.RawQuery = q.Encode()
	return u.String(), true
}
