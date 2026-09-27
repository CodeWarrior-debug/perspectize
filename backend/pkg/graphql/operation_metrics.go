package graphql

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/99designs/gqlgen/graphql"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"

	"github.com/vektah/gqlparser/v2/ast"

	"github.com/CodeWarrior-debug/perspectize/backend/pkg/middleware"
	"github.com/CodeWarrior-debug/perspectize/backend/pkg/telemetry"
)

// operationDurationBuckets are the explicit histogram bucket boundaries (in
// seconds) for graphql.server.operation.duration, per the observability
// spec's cardinality budget.
var operationDurationBuckets = []float64{.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10}

// unknownOperationType is reported when the operation context (or its
// Operation) is unavailable, which should not happen in practice but is
// guarded against rather than risking a nil dereference.
const unknownOperationType = "unknown"

// OperationMetrics returns a gqlgen OperationMiddleware that records the
// graphql.server.operation.duration histogram and keeps logging the
// operation name and duration for every GraphQL request, on the histogram's
// same "operation, operation_type, has_errors" fields (plus client_version).
//
// names bounds the cardinality of the graphql.operation.name attribute,
// since operation names come from untrusted client request input (see
// backend/CLAUDE.md's "Metric cardinality" gotcha).
//
// Duration is measured to the first response only, so a long-lived
// subscription's later responses don't keep recording (and inflating) a
// duration measured from connection start.
func OperationMetrics(m metric.Meter, names *telemetry.BoundedSet) graphql.OperationMiddleware {
	histogram, err := m.Float64Histogram(
		"graphql.server.operation.duration",
		metric.WithDescription("Duration of GraphQL operations, recorded once per operation on the first response."),
		metric.WithUnit("s"),
		metric.WithExplicitBucketBoundaries(operationDurationBuckets...),
	)
	if err != nil {
		// A nil histogram is handled as a no-op below; this should only
		// happen for a malformed instrument name/config, a programming
		// error rather than a runtime condition.
		histogram = nil
	}

	return func(ctx context.Context, next graphql.OperationHandler) graphql.ResponseHandler {
		start := time.Now()
		oc := graphql.GetOperationContext(ctx)

		operationName := names.Normalize(operationNameOf(oc))
		operationType := operationTypeOf(oc)

		rh := next(ctx)

		var once sync.Once
		return func(ctx context.Context) *graphql.Response {
			resp := rh(ctx)

			once.Do(func() {
				hasErrors := resp != nil && len(resp.Errors) > 0
				duration := time.Since(start)

				attrs := []attribute.KeyValue{
					attribute.String("graphql.operation.name", operationName),
					attribute.String("graphql.operation.type", operationType),
					attribute.Bool("has_errors", hasErrors),
				}

				if histogram != nil {
					histogram.Record(ctx, duration.Seconds(), metric.WithAttributes(attrs...))
				}

				clientVersion, _ := middleware.ClientInfoFrom(ctx)

				slog.InfoContext(ctx, "graphql",
					"operation", operationName,
					"operation_type", operationType,
					"duration_ms", duration.Milliseconds(),
					"has_errors", hasErrors,
					"client_version", clientVersion,
				)
			})

			return resp
		}
	}
}

// operationNameOf returns the raw (not-yet-normalized) operation name from
// oc, or "" when unavailable. An empty string is what telemetry.BoundedSet
// normalizes to telemetry.ValueAnonymous.
func operationNameOf(oc *graphql.OperationContext) string {
	if oc == nil {
		return ""
	}
	return oc.OperationName
}

// operationTypeOf returns "query", "mutation" or "subscription" from oc's
// parsed operation, or unknownOperationType when oc or its Operation is nil.
func operationTypeOf(oc *graphql.OperationContext) string {
	if oc == nil || oc.Operation == nil {
		return unknownOperationType
	}
	switch oc.Operation.Operation {
	case ast.Query:
		return "query"
	case ast.Mutation:
		return "mutation"
	case ast.Subscription:
		return "subscription"
	default:
		return unknownOperationType
	}
}

// OperationTimer is retained for the current main.go call site.
//
// Deprecated: use OperationMetrics with an explicit Meter and BoundedSet.
func OperationTimer() graphql.OperationMiddleware {
	return OperationMetrics(
		otel.GetMeterProvider().Meter("github.com/CodeWarrior-debug/perspectize/backend"),
		telemetry.NewBoundedSet(200, telemetry.OperationNamePattern),
	)
}
