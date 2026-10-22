package logger

import (
	"context"
	"io"
	"log/slog"
	"os"

	"go.opentelemetry.io/contrib/bridges/otelslog"
	"go.opentelemetry.io/otel/log"
	"go.opentelemetry.io/otel/log/global"
	"go.opentelemetry.io/otel/trace"
)

// otelInstrumentationName identifies this package's log records to the
// OTel LoggerProvider (shows up as the instrumentation scope in Grafana/Loki).
const otelInstrumentationName = "perspectize-backend"

// stdoutHandler is the trace-enriched JSON handler installed by Setup. It is
// kept so EnableOTLP can rebuild the multi-handler without ever nesting one
// multi-handler inside another (idempotent on repeated calls).
var stdoutHandler slog.Handler

// Setup configures the default slog logger to output structured JSON to stdout.
// Sevalla parses each JSON line for its log viewer, populating severity from the
// "level" field and attributes from all other keys.
// Log records are enriched with trace_id and span_id when OTel context is present.
// Must be called early in main() before any slog calls.
func Setup() {
	stdoutHandler = newStdoutHandler(os.Stdout)
	slog.SetDefault(slog.New(stdoutHandler))
}

// newStdoutHandler builds the trace-enriched JSON handler used by Setup,
// writing to w instead of os.Stdout. Exists so tests can inject a buffer.
func newStdoutHandler(w io.Writer) slog.Handler {
	json := slog.NewJSONHandler(w, &slog.HandlerOptions{
		Level:     slog.LevelDebug,
		AddSource: true,
	})
	return &traceHandler{Handler: json}
}

// EnableOTLP adds an OTLP log export branch alongside the existing stdout JSON
// handler, without changing stdout's format. Callers decide whether to call
// this at all (main.go calls it only when telemetry.Enabled() is true, i.e.
// only when OTEL_EXPORTER_OTLP_ENDPOINT is set); Setup() alone remains fully
// functional and must still be called first, before telemetry and OTLP are
// configured, since it is the earliest thing that can log.
//
// If lp is nil, the current global LoggerProvider (go.opentelemetry.io/otel/log/global)
// is used. The OTLP branch only emits records at slog.LevelInfo or above, so
// Debug-level noise never counts against the log export budget; stdout keeps
// receiving every level unchanged.
//
// EnableOTLP is idempotent: calling it more than once always rebuilds the
// multi-handler from the original stdout handler, so handlers are never
// nested and a record is never exported more than once.
func EnableOTLP(lp log.LoggerProvider) {
	if lp == nil {
		lp = global.GetLoggerProvider()
	}

	base := stdoutHandler
	if base == nil {
		base = newStdoutHandler(os.Stdout)
	}

	otelHandler := &minLevelHandler{
		min:     slog.LevelInfo,
		Handler: otelslog.NewHandler(otelInstrumentationName, otelslog.WithLoggerProvider(lp)),
	}

	slog.SetDefault(slog.New(slog.NewMultiHandler(base, otelHandler)))
}

// traceHandler wraps an slog.Handler and adds OTel trace context fields
// (trace_id, span_id) to every log record that carries a valid span context.
type traceHandler struct {
	slog.Handler
}

func (h *traceHandler) Handle(ctx context.Context, r slog.Record) error {
	if sc := trace.SpanContextFromContext(ctx); sc.IsValid() {
		r.AddAttrs(
			slog.String("trace_id", sc.TraceID().String()),
			slog.String("span_id", sc.SpanID().String()),
		)
	}
	return h.Handler.Handle(ctx, r)
}

func (h *traceHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &traceHandler{Handler: h.Handler.WithAttrs(attrs)}
}

func (h *traceHandler) WithGroup(name string) slog.Handler {
	return &traceHandler{Handler: h.Handler.WithGroup(name)}
}

// minLevelHandler wraps an slog.Handler and refuses records below a minimum
// level, regardless of what the wrapped handler itself would report.
type minLevelHandler struct {
	slog.Handler
	min slog.Level
}

func (h *minLevelHandler) Enabled(ctx context.Context, level slog.Level) bool {
	if level < h.min {
		return false
	}
	return h.Handler.Enabled(ctx, level)
}

func (h *minLevelHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &minLevelHandler{Handler: h.Handler.WithAttrs(attrs), min: h.min}
}

func (h *minLevelHandler) WithGroup(name string) slog.Handler {
	return &minLevelHandler{Handler: h.Handler.WithGroup(name), min: h.min}
}
