# Phase 25: Observability & Release Tagging - Context

**Gathered:** 2026-09-26
**Status:** Planned — execution via superpowers (not GSD `execute-phase`)

> New-work convention: this phase is planned and executed with **superpowers**. The GSD
> roadmap entry exists only for milestone tracking. Source of truth:
> - Spec: `docs/superpowers/specs/2026-09-26-observability-design.md`
> - Plan: `docs/superpowers/plans/2026-09-26-observability-plan.md`

## Starting state (measured 2026-09-26)

- `backend/cmd/server/main.go` `initTracer` installs a TracerProvider + OTLP HTTP exporter when
  `OTEL_EXPORTER_OTLP_ENDPOINT` is set, **but no instrumentation creates spans**: no
  otelhttp, no gqlgen tracer, no GORM plugin. The export pipeline is inert.
- `backend/pkg/logger` adds `trace_id`/`span_id` to slog records when a span is in context.
  Because no spans exist, this never fires today.
- Phase 7.4 log lines exist: `RequestTimer` (HTTP), `OperationTimer` (GraphQL op name +
  duration), `RegisterSlowQueryLogger` (GORM ≥100ms), `/debug/db-stats` (non-prod only).
  None of them produce metrics.
- `frontend/src/lib/vitals.ts` sends Web Vitals to `console.debug` only. There is no frontend
  error reporting.
- No version is stamped on anything. `backend/.dockerignore` excludes `.git`, so
  `debug.ReadBuildInfo()` has no VCS info. Sevalla builds both services from git (not in
  GitHub Actions), so build-args may not be available. That is why versions live in source,
  rewritten by release-please.
- CORS `AllowedHeaders` is `Content-Type, Authorization` only. Browser trace propagation
  needs `traceparent`/`tracestate` added.
- The CSP `connect-src` in `frontend/src/app.html` must gain the Faro collector host.
- One anonymous GraphQL `query(` exists in `frontend/src/lib/queries`. Name it so it gets its
  own per-operation metrics.

## Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Instrumentation API | OpenTelemetry only | Already a dependency; changing vendor later is an env-var change |
| Backend | Grafana Cloud free tier (Tempo/Mimir/Loki) | One account for traces, metrics, logs, dashboards and alerts; $0 at current volume |
| Frontend | Grafana Faro Web SDK | Same stack; links browser sessions to backend traces |
| Error tracking | Faro + span status; Sentry deferred | Add Sentry only if Faro grouping is not enough |
| Long-term trends | App-owned metrics (13-month retention), not traces (14 days) | Stay within free-tier retention |
| Cardinality | `BoundedSet` normalizer on every attribute from request input | Keeps under the 10k series limit; resists spoofed operation names |
| Versioning | release-please manifest mode, tags `backend-vX.Y.Z` / `frontend-vX.Y.Z` | Reuses existing conventional commits; version-in-source works whoever builds |
| Sampling | 100% head sampling via env (`parentbased_traceidratio`) | Low volume; no Collector yet |

## Deferred ideas

- OpenTelemetry Collector with tail sampling (keep all error traces) once traces approach 50 GB/mo
- Sentry release health / session replay
- Continuous profiling (Grafana Pyroscope)
- `pg_stat_statements` dashboards (belongs with the Neon tuning plan)
- Grafana deploy annotations posted from CI (the `app.build.info` series already marks deploys)
