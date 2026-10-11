package telemetry

import (
	"context"
	"fmt"

	"go.opentelemetry.io/otel/metric"
	semconv "go.opentelemetry.io/otel/semconv/v1.30.0"

	"github.com/CodeWarrior-debug/perspectize/backend/pkg/buildinfo"
)

// RegisterBuildInfo registers an observable gauge, app.build.info, that
// always reports 1 with service.version and vcs.ref.head.revision
// attributes. Grafana can then chart `count by (service_version)
// (app_build_info)`, which changes exactly at deploy time.
func RegisterBuildInfo(m metric.Meter) (metric.Registration, error) {
	gauge, err := m.Int64ObservableGauge(
		"app.build.info",
		metric.WithDescription("Always 1; attributes identify the running build. A deploy marker for dashboards."),
	)
	if err != nil {
		return nil, fmt.Errorf("telemetry: creating app.build.info instrument: %w", err)
	}

	reg, err := m.RegisterCallback(func(_ context.Context, o metric.Observer) error {
		version, commit := buildinfo.Info()
		o.ObserveInt64(gauge, 1, metric.WithAttributes(
			semconv.ServiceVersionKey.String(version),
			semconv.VCSRefHeadRevisionKey.String(commit),
		))
		return nil
	}, gauge)
	if err != nil {
		return nil, fmt.Errorf("telemetry: registering app.build.info callback: %w", err)
	}

	return reg, nil
}
