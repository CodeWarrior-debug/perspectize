package logger

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

// memExporter is a minimal in-memory sdklog.Exporter used to assert which
// records reach the OTLP branch without a network dependency.
type memExporter struct {
	mu      sync.Mutex
	records []sdklog.Record
}

func (e *memExporter) Export(_ context.Context, records []sdklog.Record) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	for _, r := range records {
		e.records = append(e.records, r.Clone())
	}
	return nil
}

func (e *memExporter) Shutdown(context.Context) error   { return nil }
func (e *memExporter) ForceFlush(context.Context) error { return nil }

func (e *memExporter) snapshot() []sdklog.Record {
	e.mu.Lock()
	defer e.mu.Unlock()
	out := make([]sdklog.Record, len(e.records))
	copy(out, e.records)
	return out
}

func TestNewStdoutHandler_WritesExpectedJSONKeys(t *testing.T) {
	var buf bytes.Buffer
	l := slog.New(newStdoutHandler(&buf))
	l.Info("hello", "foo", "bar")

	var line map[string]any
	require.NoError(t, json.Unmarshal(buf.Bytes(), &line))
	assert.Contains(t, line, "time")
	assert.Contains(t, line, "level")
	assert.Contains(t, line, "msg")
	assert.Contains(t, line, "source")
	assert.Equal(t, "hello", line["msg"])
	assert.Equal(t, "bar", line["foo"])
}

func TestNewStdoutHandler_AddsTraceAndSpanID(t *testing.T) {
	var buf bytes.Buffer
	l := slog.New(newStdoutHandler(&buf))

	tp := sdktrace.NewTracerProvider()
	t.Cleanup(func() { _ = tp.Shutdown(context.Background()) })
	tracer := tp.Tracer("logger-test")
	ctx, span := tracer.Start(context.Background(), "test-span")
	defer span.End()

	l.InfoContext(ctx, "with trace")

	var line map[string]any
	require.NoError(t, json.Unmarshal(buf.Bytes(), &line))

	sc := span.SpanContext()
	require.True(t, sc.IsValid())
	assert.Equal(t, sc.TraceID().String(), line["trace_id"])
	assert.Equal(t, sc.SpanID().String(), line["span_id"])
}

func TestEnableOTLP_InfoReachesStdoutAndExporter(t *testing.T) {
	t.Cleanup(func() { slog.SetDefault(slog.New(newStdoutHandler(io.Discard))) })

	var buf bytes.Buffer
	stdoutHandler = newStdoutHandler(&buf)
	slog.SetDefault(slog.New(stdoutHandler))

	exp := &memExporter{}
	lp := sdklog.NewLoggerProvider(sdklog.WithProcessor(sdklog.NewSimpleProcessor(exp)))
	t.Cleanup(func() { _ = lp.Shutdown(context.Background()) })

	EnableOTLP(lp)

	tp := sdktrace.NewTracerProvider()
	t.Cleanup(func() { _ = tp.Shutdown(context.Background()) })
	tracer := tp.Tracer("logger-test")
	ctx, span := tracer.Start(context.Background(), "otlp-span")
	defer span.End()

	slog.InfoContext(ctx, "info reaches both")

	// stdout branch
	var line map[string]any
	require.NoError(t, json.Unmarshal(buf.Bytes(), &line))
	assert.Equal(t, "info reaches both", line["msg"])

	// OTLP branch, with trace correlation preserved on the exported record.
	records := exp.snapshot()
	require.Len(t, records, 1)
	sc := span.SpanContext()
	assert.Equal(t, sc.TraceID(), records[0].TraceID())
	assert.Equal(t, sc.SpanID(), records[0].SpanID())
}

func TestEnableOTLP_DebugDoesNotReachExporter(t *testing.T) {
	t.Cleanup(func() { slog.SetDefault(slog.New(newStdoutHandler(io.Discard))) })

	var buf bytes.Buffer
	stdoutHandler = newStdoutHandler(&buf)
	slog.SetDefault(slog.New(stdoutHandler))

	exp := &memExporter{}
	lp := sdklog.NewLoggerProvider(sdklog.WithProcessor(sdklog.NewSimpleProcessor(exp)))
	t.Cleanup(func() { _ = lp.Shutdown(context.Background()) })

	EnableOTLP(lp)

	slog.Debug("debug should stay off OTLP")

	// stdout still gets the debug line.
	var line map[string]any
	require.NoError(t, json.Unmarshal(buf.Bytes(), &line))
	assert.Equal(t, "debug should stay off OTLP", line["msg"])

	assert.Empty(t, exp.snapshot())
}

func TestEnableOTLP_CalledTwice_DoesNotDuplicateExport(t *testing.T) {
	t.Cleanup(func() { slog.SetDefault(slog.New(newStdoutHandler(io.Discard))) })

	var buf bytes.Buffer
	stdoutHandler = newStdoutHandler(&buf)
	slog.SetDefault(slog.New(stdoutHandler))

	exp := &memExporter{}
	lp := sdklog.NewLoggerProvider(sdklog.WithProcessor(sdklog.NewSimpleProcessor(exp)))
	t.Cleanup(func() { _ = lp.Shutdown(context.Background()) })

	EnableOTLP(lp)
	EnableOTLP(lp)

	slog.Info("only once")

	records := exp.snapshot()
	require.Len(t, records, 1)
}
