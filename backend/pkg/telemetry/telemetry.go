package telemetry

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploghttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	logglobal "go.opentelemetry.io/otel/log/global"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/propagation"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.30.0"
	"go.opentelemetry.io/otel/trace"

	"github.com/CodeWarrior-debug/perspectize/backend/pkg/buildinfo"
)

// instrumentationName identifies this module's own tracer/meter instrumentation
// scope, as opposed to the service name reported on the resource.
const instrumentationName = "github.com/CodeWarrior-debug/perspectize/backend"

// defaultServiceName is used when Config.ServiceName is empty.
const defaultServiceName = "perspectize-backend"

// metricExportInterval is how often the periodic metric reader exports.
const metricExportInterval = 30 * time.Second

// Config configures Setup.
type Config struct {
	// ServiceName reported on the OpenTelemetry resource. Defaults to
	// "perspectize-backend" when empty.
	ServiceName string
	// Environment reported as the resource's deployment.environment.name,
	// typically sourced from APP_ENV. Omitted from the resource when empty.
	Environment string
}

// state guards the package-level fields mutated by Setup, so repeated calls
// (as in tests using t.Setenv) are safe and Enabled/Resource always reflect
// the most recent call.
var (
	mu              sync.Mutex
	enabled         bool
	currentResource *resource.Resource
)

// Setup installs the global OpenTelemetry Tracer, Meter and Logger providers,
// plus a W3C TraceContext+Baggage propagator, and returns a shutdown function
// that flushes and releases any exporters it created.
//
// When OTEL_EXPORTER_OTLP_ENDPOINT is unset, Setup is a no-op: no exporters
// are created, the default (no-op) global providers are left in place, and
// the returned shutdown function does nothing. Enabled() reports false in
// this case.
func Setup(ctx context.Context, cfg Config) (shutdown func(context.Context) error, err error) {
	// Installing the propagator is harmless even when telemetry is disabled,
	// and keeps context propagation behaviour consistent regardless of
	// whether an OTLP endpoint is configured.
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	if os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT") == "" {
		mu.Lock()
		enabled = false
		currentResource = nil
		mu.Unlock()
		return func(context.Context) error { return nil }, nil
	}

	res, err := buildResource(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("telemetry: building resource: %w", err)
	}

	var shutdownFuncs []func(context.Context) error
	cleanup := func(ctx context.Context) error {
		var errs error
		for _, fn := range shutdownFuncs {
			errs = errors.Join(errs, fn(ctx))
		}
		return errs
	}

	traceExporter, err := otlptracehttp.New(ctx)
	if err != nil {
		return nil, fmt.Errorf("telemetry: creating OTLP trace exporter: %w", err)
	}
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(traceExporter),
		sdktrace.WithResource(res),
	)
	shutdownFuncs = append(shutdownFuncs, tp.Shutdown)

	metricExporter, err := otlpmetrichttp.New(ctx)
	if err != nil {
		_ = cleanup(context.Background())
		return nil, fmt.Errorf("telemetry: creating OTLP metric exporter: %w", err)
	}
	mp := sdkmetric.NewMeterProvider(
		sdkmetric.WithResource(res),
		sdkmetric.WithReader(sdkmetric.NewPeriodicReader(
			metricExporter,
			sdkmetric.WithInterval(metricExportInterval),
		)),
	)
	shutdownFuncs = append(shutdownFuncs, mp.Shutdown)

	logExporter, err := otlploghttp.New(ctx)
	if err != nil {
		_ = cleanup(context.Background())
		return nil, fmt.Errorf("telemetry: creating OTLP log exporter: %w", err)
	}
	lp := sdklog.NewLoggerProvider(
		sdklog.WithResource(res),
		sdklog.WithProcessor(sdklog.NewBatchProcessor(logExporter)),
	)
	shutdownFuncs = append(shutdownFuncs, lp.Shutdown)

	otel.SetTracerProvider(tp)
	otel.SetMeterProvider(mp)
	logglobal.SetLoggerProvider(lp)

	mu.Lock()
	enabled = true
	currentResource = res
	mu.Unlock()

	return func(ctx context.Context) error {
		mu.Lock()
		enabled = false
		mu.Unlock()
		return cleanup(ctx)
	}, nil
}

// buildResource merges, in order: resource.Default() (SDK language/process
// attributes), code-supplied attributes (service name/version, environment,
// commit), then OTEL_RESOURCE_ATTRIBUTES from the environment, applied last
// so the Sevalla dashboard can always override anything above it.
//
// The code-supplied and env-derived attributes are built schemaless
// (resource.WithAttributes / resource.WithFromEnv both produce a resource
// with an empty schema URL), so merging them into resource.Default() (which
// carries the semconv schema URL baked into the SDK) never trips
// resource.ErrSchemaURLConflict.
func buildResource(ctx context.Context, cfg Config) (*resource.Resource, error) {
	serviceName := cfg.ServiceName
	if serviceName == "" {
		serviceName = defaultServiceName
	}

	attrs := []attribute.KeyValue{
		semconv.ServiceNameKey.String(serviceName),
		semconv.ServiceVersionKey.String(buildinfo.Version),
	}
	if cfg.Environment != "" {
		attrs = append(attrs, semconv.DeploymentEnvironmentNameKey.String(cfg.Environment))
	}
	if _, commit := buildinfo.Info(); commit != "unknown" && commit != "" {
		attrs = append(attrs, semconv.VCSRefHeadRevisionKey.String(commit))
	}

	codeAndEnvResource, err := resource.New(ctx,
		resource.WithAttributes(attrs...),
		resource.WithFromEnv(),
	)
	if err != nil {
		return nil, err
	}

	merged, err := resource.Merge(resource.Default(), codeAndEnvResource)
	if err != nil {
		return nil, err
	}
	return merged, nil
}

// Enabled reports whether the most recent Setup call installed real OTLP
// exporters (true) or left the default no-op providers in place (false).
func Enabled() bool {
	mu.Lock()
	defer mu.Unlock()
	return enabled
}

// Resource returns the resource built by the most recent Setup call, or nil
// when telemetry is disabled.
func Resource() *resource.Resource {
	mu.Lock()
	defer mu.Unlock()
	return currentResource
}

// Meter returns this module's Meter, bound to whatever MeterProvider is
// currently registered globally (a no-op provider until Setup enables one).
func Meter() metric.Meter {
	return otel.GetMeterProvider().Meter(instrumentationName)
}

// Tracer returns this module's Tracer, bound to whatever TracerProvider is
// currently registered globally (a no-op provider until Setup enables one).
func Tracer() trace.Tracer {
	return otel.GetTracerProvider().Tracer(instrumentationName)
}
