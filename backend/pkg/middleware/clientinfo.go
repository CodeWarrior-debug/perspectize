package middleware

import (
	"context"
	"net/http"
	"sync"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/trace"

	"github.com/CodeWarrior-debug/perspectize/backend/pkg/telemetry"
)

// unknownClientValue is reported for client.version/client.platform when the
// corresponding header is entirely absent. This is deliberately distinct
// from telemetry.ValueAnonymous (which BoundedSet.Normalize returns for an
// empty string): "the client sent no header at all" and "the client sent an
// empty header value" are different situations, and only the latter should
// ever reach BoundedSet.Normalize.
const unknownClientValue = "unknown"

// maxClientPlatformValues bounds the cardinality of the client.platform
// attribute. The known platforms (web/ios/android) plus a little headroom
// for future additions, well short of anything that could threaten metric
// cardinality.
const maxClientPlatformValues = 5

// maxClientVersionValues bounds the cardinality of the client.version
// attribute, per the observability plan's Global Constraints.
const maxClientVersionValues = 50

// clientVersions and clientPlatforms are package-level so the cardinality
// cap is shared across every request the process handles, not reset per
// middleware instance.
var (
	clientVersions  = telemetry.NewBoundedSet(maxClientVersionValues, telemetry.ClientVersionPattern)
	clientPlatforms = telemetry.NewBoundedSet(maxClientPlatformValues, telemetry.ClientPlatformPattern)
)

type clientInfoContextKey struct{}

// clientInfo holds the normalized, request-scoped client identity.
type clientInfo struct {
	version  string
	platform string
}

// ClientInfoFrom returns the normalized client version and platform stored
// in ctx by ClientInfo (or NewClientInfo). Both values are "unknown" when
// ClientInfo has not run, or when the request carried neither header.
func ClientInfoFrom(ctx context.Context) (version, platform string) {
	ci, ok := ctx.Value(clientInfoContextKey{}).(clientInfo)
	if !ok {
		return unknownClientValue, unknownClientValue
	}
	return ci.version, ci.platform
}

// clientRequestsCounterOnce/clientRequestsCounterVal lazily create the
// app.client.requests counter from telemetry.Meter() the first time
// ClientInfo handles a request, rather than at package init time.
//
// This is deliberate, not merely lazy for laziness's sake: package-level var
// initializers run before main() calls telemetry.Setup, so an instrument
// created eagerly at init time would be bound to whatever MeterProvider is
// registered globally at that moment (the SDK's default no-op provider).
// That's still safe — go.opentelemetry.io/otel's global package hands out a
// *delegating* Meter/instrument until a real MeterProvider is installed via
// otel.SetMeterProvider, at which point previously-created instruments are
// backfilled to delegate to the real implementation (see
// go.opentelemetry.io/otel/internal/global — sdk-forward.go /
// meter.go's delegation logic) — but deferring instrument creation to first
// request keeps ClientInfo simple to reason about without relying on that
// guarantee, and matches NewClientInfo's non-lazy, explicit-meter shape.
var (
	clientRequestsCounterOnce sync.Once
	clientRequestsCounterVal  metric.Int64Counter
)

func globalClientRequestsCounter() metric.Int64Counter {
	clientRequestsCounterOnce.Do(func() {
		clientRequestsCounterVal = newClientRequestsCounter(telemetry.Meter())
	})
	return clientRequestsCounterVal
}

func newClientRequestsCounter(meter metric.Meter) metric.Int64Counter {
	counter, err := meter.Int64Counter(
		"app.client.requests",
		metric.WithDescription("Count of HTTP requests tagged by normalized client version and platform."),
	)
	if err != nil {
		// A nil counter is handled as a no-op by recordClientRequest below;
		// this should only happen for a malformed instrument name, which
		// would be a programming error, not a runtime condition.
		return nil
	}
	return counter
}

// ClientInfo reads X-Client-Version and X-Client-Platform from the request,
// normalizes them through bounded-cardinality sets (falling back to
// "unknown" when a header is entirely absent), stores them in the request
// context (retrievable via ClientInfoFrom), sets them as attributes on the
// active span, and increments app.client.requests. It uses the global
// telemetry.Meter().
func ClientInfo(next http.Handler) http.Handler {
	return withClientInfo(next, globalClientRequestsCounter)
}

// NewClientInfo builds the ClientInfo middleware bound to an explicit Meter
// rather than the global one, for tests (and any future caller) that need a
// specific MeterProvider — e.g. one backed by an
// go.opentelemetry.io/otel/sdk/metric ManualReader.
func NewClientInfo(meter metric.Meter) func(http.Handler) http.Handler {
	counter := newClientRequestsCounter(meter)
	return func(next http.Handler) http.Handler {
		return withClientInfo(next, func() metric.Int64Counter { return counter })
	}
}

func withClientInfo(next http.Handler, counterFn func() metric.Int64Counter) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		version := normalizeClientHeader(r.Header.Get("X-Client-Version"), clientVersions)
		platform := normalizeClientHeader(r.Header.Get("X-Client-Platform"), clientPlatforms)

		ctx := context.WithValue(r.Context(), clientInfoContextKey{}, clientInfo{
			version:  version,
			platform: platform,
		})

		attrs := []attribute.KeyValue{
			attribute.String("client.version", version),
			attribute.String("client.platform", platform),
		}

		trace.SpanFromContext(ctx).SetAttributes(attrs...)

		if counter := counterFn(); counter != nil {
			counter.Add(ctx, 1, metric.WithAttributes(attrs...))
		}

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// normalizeClientHeader maps a raw header value to a cardinality-safe
// attribute value. A missing header (raw == "") is reported as "unknown",
// never routed through set.Normalize — an absent header and a header the
// caller deliberately sent empty are different situations, and only the
// bounded set's own definition of "empty" (telemetry.ValueAnonymous) should
// apply to the latter.
func normalizeClientHeader(raw string, set *telemetry.BoundedSet) string {
	if raw == "" {
		return unknownClientValue
	}
	return set.Normalize(raw)
}
