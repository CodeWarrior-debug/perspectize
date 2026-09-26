package middleware

import (
	"fmt"
	"log/slog"
	"net/http"
	"runtime/debug"

	chimw "github.com/go-chi/chi/v5/middleware"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

// Recoverer is a middleware that catches panics and logs them as structured JSON
// via slog, ensuring Sevalla can parse panic details in its log viewer.
// Replaces chi's middleware.Recoverer which uses its own text-based logger.
func Recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				slog.ErrorContext(r.Context(), "panic recovered",
					"error", fmt.Sprintf("%v", err),
					"stack", string(debug.Stack()),
					"method", r.Method,
					"path", r.URL.Path,
					"request_id", chimw.GetReqID(r.Context()),
				)

				span := trace.SpanFromContext(r.Context())
				span.RecordError(fmt.Errorf("panic: %v", err))
				span.SetStatus(codes.Error, "panic")

				http.Error(w, `{"error":"internal server error"}`, http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}
