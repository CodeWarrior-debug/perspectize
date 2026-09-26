# Observability, Performance Graphs & Release Tagging — Design Spec

**Date:** 2026-09-26
**Status:** Draft — awaiting approval for execution
**Required execution sub-skill:** `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`
**Plan:** `docs/superpowers/plans/2026-09-26-observability-plan.md`
**Roadmap:** `.planning/ROADMAP.md` → Phase 25: Observability & Release Tagging

## Overview

Perspectize has logging-based performance instrumentation from Phase 7.4 (request timing,
GraphQL operation timing, GORM slow-query log, Web Vitals to `console.debug`) and an
OpenTelemetry `TracerProvider` in `backend/cmd/server/main.go` (`initTracer`). But **nothing
creates spans**. No HTTP, gqlgen or GORM instrumentation is registered, so the exporter
sends nothing, and the `trace_id`/`span_id` enrichment in `backend/pkg/logger` never fires.
Timings exist only as log lines, so they can't be graphed, alerted on, or kept past log
retention. The frontend reports no errors, and neither side stamps a release version on
anything.

This spec keeps OpenTelemetry as the only instrumentation API and sends backend and
frontend telemetry to **Grafana Cloud**. It also adds a release-versioning pipeline so every
span, metric, log line and frontend event carries the frontend and backend versions that
produced it.

## Goals

1. **Tracing across frontend and backend.** A slow click in the browser can be followed
   through the HTTP request, the GraphQL operation, the resolvers, the SQL queries and any
   outgoing YouTube or Wikidata call, as one trace.
2. **Performance graphs per operation.** p50/p95/p99 latency, throughput and error rate for
   each GraphQL query, mutation and subscription, kept for 13 months.
3. **Error tracking.** Backend errors and panics, and frontend unhandled errors, are linked
   to their trace and to the release that produced them.
4. **Version on every signal.** `service.version` (backend) and `app.version` (frontend) are
   attached automatically, plus `client.version` on backend spans so version skew between
   an old cached PWA or Capacitor build and a newer API is visible.
5. **Cost:** $0/month at current traffic, with known limits before the first paid tier.
6. **Retention:** 13 months for metrics (trends), 14 days for traces and logs (debugging).

## Non-goals (explicitly out of scope)

- **Self-hosted stack** (SigNoz, LGTM on Sevalla). Running it costs more ops time and
  storage than the free tier.
- **OpenTelemetry Collector / tail sampling** ("keep 100% of error traces, 10% of the
  rest"). Not needed at current volume. Revisit when traces approach 50 GB/mo.
- **Session replay, continuous profiling (Pyroscope), `pg_stat_statements` dashboards.**
  Database query analysis belongs to the Neon tuning plan
  (`docs/superpowers/plans/2026-09-03-neon-performance-tuning-plan.md`).
- **Recording GraphQL variables or request bodies.** They contain user-authored content.

## Vendor decision

| Option | Verdict | Why |
|---|---|---|
| **Grafana Cloud (free)** | **Chosen** | One account covers Tempo (traces), Mimir (metrics), Loki (logs), Faro (frontend monitoring), dashboards and alerting. Accepts OTLP natively, so switching vendors later is an env-var change. |
| Honeycomb (free 20M events/mo, 60d) | Runner-up | Best for exploring high-cardinality traces, but weaker frontend monitoring and no long-term metric store. |
| Sentry (free 5k errors/mo) | Optional add-on | Best error grouping and release health. Add only if Faro's error view is not enough. The versioning in this spec (Goal 4) works for Sentry unchanged. |
| Axiom, Datadog, New Relic | Rejected | Datadog/New Relic cost too much for a small project. Axiom has no frontend monitoring. |

**Grafana Cloud free-tier limits (verify current values at signup; they change):**
10k active metric series · 50 GB logs · 50 GB traces · 14-day log/trace retention ·
13-month metric retention · ~50k frontend sessions/mo · 3 users. Pro is ~$19/mo plus usage.

### Retention strategy

Traces and logs expire after 14 days, so **long-term trends must come from metrics that
the app records itself**, not from traces:

- `graphql.server.operation.duration` is a histogram, and the plan bounds the number of
  distinct values of every attribute on it (see Cardinality below).
- Traces are used to answer "why was *this* request slow", not "is it slower than last
  quarter".

### Cardinality budget (keeps the free 10k-series limit safe)

| Metric source | Estimated series |
|---|---|
| Go runtime (`contrib/instrumentation/runtime`) | ~40 |
| `http.server.request.duration` (otelhttp: route × method × status) | ~150 |
| `graphql.server.operation.duration` (≤200 names × 3 types × error bool × ~12 buckets) | ≤ ~2,500 worst case, ~600 real |
| DB pool gauges | ~8 |
| `app.client.requests` (version × platform, capped at 50 values each) | ≤ ~150 |
| `app.build.info` | ~2 |
| **Total** | **< 3,500**, well under 10k |

Operation names and client versions come from **untrusted request input**, so both go
through a shared bounded normalizer: a regex check plus a first-seen set capped at N
entries, after which values are reported as `"other"`. Without this, anyone could create
unlimited metric series just by sending made-up operation names.

## Architecture

```
Browser / Capacitor app                              Grafana Cloud
┌───────────────────────────────┐   Faro (HTTPS)    ┌───────────────────┐
│ Faro Web SDK                  │──────────────────▶│ Frontend Obs.     │
│  errors, web vitals, sessions │                   │ (Loki + Tempo)    │
│  fetch spans + traceparent ───┼──┐                └───────────────────┘
│ graphql-request               │  │ traceparent,             ▲
│  + X-Client-Version/Platform  │  │ X-Client-Version         │ OTLP/HTTP
└───────────────────────────────┘  ▼                          │
                      ┌────────────────────────────────────────┴──┐
                      │ Go backend (Sevalla)                      │
                      │ otelhttp → chi → gqlgen(otelgqlgen) →     │
                      │ resolvers → GORM(otel plugin) → Postgres  │
                      │ outbound otelhttp.Transport (YouTube,     │
                      │ Wikidata)                                 │
                      │ Meter: op histogram, pool, runtime, build │
                      │ slog → stdout JSON (Sevalla) + otelslog   │
                      └───────────────────────────────────────────┘
```

### Backend

- **New package `backend/pkg/telemetry`** owns all OpenTelemetry setup (Tracer, Meter and
  Logger providers, resource, shutdown). `main.go` calls `telemetry.Setup` once and
  `initTracer` is deleted. When `OTEL_EXPORTER_OTLP_ENDPOINT` is unset, `Setup` returns
  no-op providers, so local dev and CI need no configuration.
- **Resource attributes:** `service.name`, `service.version` (from `pkg/buildinfo`),
  `deployment.environment.name` (from `APP_ENV`), and `vcs.ref.head.revision` when a commit
  is known. `resource.WithFromEnv()` stays last so `OTEL_RESOURCE_ATTRIBUTES` can override
  any of them from the Sevalla dashboard.
- **Spans:**
  - `otelhttp` wraps the chi router. It skips `/health` and `/ready`, and skips the
    WebSocket handshake (reusing `isWebsocketHandshake`), because a span that stays open
    for a whole subscription is useless.
  - `otelgqlgen` creates one span per operation, plus one per field **only when the field
    has a real resolver** (`fc.IsResolver`), with variables disabled.
  - The GORM `tracing` plugin creates one span per SQL statement, with query variables
    disabled and the plugin's own metrics off.
  - `otelhttp.NewTransport` on the YouTube and Wikidata clients.
- **Metrics:** the existing `OperationTimer` becomes `OperationMetrics`. It still writes the
  log line, and also records the histogram. It also adds DB pool observable gauges from
  `sql.DB.Stats()`, the runtime instrumentation, `app.client.requests`, and
  `app.build.info` (a gauge with value 1 and version/commit attributes). Grafana graphs of
  `app.build.info` show exactly when a deploy happened, with no CI step needed.
- **Logs:** `logger.Setup` becomes
  `slog.NewMultiHandler(stdoutJSON, otelslog)` (Go 1.26). The stdout JSON stays exactly as
  it is today, so Sevalla's log viewer is unaffected. The `trace_id` enrichment starts
  working once spans exist.
- **Errors:** GraphQL errors set span status `Error` (otelgqlgen does this). The
  `Recoverer` middleware records the panic on the active span
  (`span.RecordError` + `SetStatus`) before writing the 500.
- **CORS:** `AllowedHeaders` gains `traceparent`, `tracestate`, `X-Client-Version` and
  `X-Client-Platform`. Without this, browser preflight rejects every propagated request.

### Frontend

- **Faro Web SDK** (`@grafana/faro-web-sdk` + `@grafana/faro-web-tracing`) is initialised in
  `src/lib/telemetry.ts` from `+layout.svelte`. It is a no-op when `VITE_FARO_URL` is unset.
  It replaces `src/lib/vitals.ts`, since Faro's web instrumentations already collect CLS,
  INP, LCP, FCP and TTFB.
- **Trace propagation:** `propagateTraceHeaderCorsUrls` lists **only** the GraphQL origin
  (derived from `VITE_GRAPHQL_URL`). Headers are never sent to Clerk, YouTube or other
  third parties.
- **Version headers:** `graphqlRequest` sends `X-Client-Version` and `X-Client-Platform`
  (`web` | `ios` | `android` via `Capacitor.getPlatform()`). The graphql-ws
  `connectionParams` carry the same values, so subscriptions are tagged too.
- **Source maps:** Vite emits source maps only when a Faro upload key is present. The
  `@grafana/faro-rollup-plugin` uploads them, and a post-build step deletes `build/**/*.map`
  so they are never served publicly.

### Versioning & CI auto-tagging

- **release-please (manifest mode)**, with two components tagged `backend-vX.Y.Z` and
  `frontend-vX.Y.Z`, driven by the repo's existing conventional commits. Each merge to
  `main` updates a release PR. Merging that PR creates the tag, the GitHub Release and the
  changelog.
- **The version lives in source, not in build args.** release-please rewrites
  `frontend/package.json` `version` and `backend/pkg/buildinfo/buildinfo.go` (marked with
  `x-release-please-version`). This matters because **Sevalla builds both services directly
  from git, not in GitHub Actions**, and `backend/.dockerignore` excludes `.git`, so
  `debug.ReadBuildInfo()` has no VCS data. A version in source works no matter who runs the
  build.
- **Commit SHA is best effort:**
  - Backend: `Dockerfile` `ARG GIT_SHA` → `-ldflags -X`.
  - Frontend: `process.env.GIT_SHA` or `git rev-parse` at build time.
  - Either one falls back to empty/`unknown`. Plan Task 12 confirms whether Sevalla exposes
    a commit variable to builds.

## Security & privacy

- GraphQL variables, SQL bind parameters and request bodies are never recorded.
- The `Authorization` header is never recorded (otelhttp does not record headers by
  default; this is asserted in a test).
- User identity on spans is the internal numeric user ID (`enduser.id`) only. No email or
  username.
- The Grafana OTLP token is a **backend-only** Sevalla env var. The Faro collector URL is
  public by design (it can only write, not read). Rate-limit it in the Grafana app settings.
- Faro's `beforeSend` removes query strings from URLs so share tokens and search terms
  don't leave the browser.

## Environment variables

| Where | Variable | Example / note |
|---|---|---|
| Sevalla app (backend, runtime) | `OTEL_EXPORTER_OTLP_ENDPOINT` | `https://otlp-gateway-prod-<region>.grafana.net/otlp` |
| | `OTEL_EXPORTER_OTLP_HEADERS` | `Authorization=Basic <base64(instanceId:token)>` — **secret, human-entered** |
| | `OTEL_SERVICE_NAME` | `perspectize-backend` |
| | `OTEL_TRACES_SAMPLER` / `_ARG` | `parentbased_traceidratio` / `1.0` (lower later) |
| | `APP_ENV` | already set (`production`) |
| Sevalla static site (build time) | `VITE_FARO_URL` | Faro collector URL from the Grafana Frontend Observability app |
| | `VITE_APP_ENV` | `production` |
| | `FARO_SOURCEMAP_API_KEY`, `FARO_APP_ID`, `FARO_STACK_ID`, `FARO_API_ENDPOINT` | source-map upload; secret key is human-entered |
| GitHub Actions | none required | release-please uses the default `GITHUB_TOKEN` |

## Alerts (initial set)

| Alert | Condition | Window |
|---|---|---|
| Operation latency | p95 `graphql.server.operation.duration` > 1s for any operation | 10 min |
| GraphQL error rate | `has_errors=true` share > 2% | 10 min |
| HTTP 5xx | any 5xx rate > 0.5 req/min | 5 min |
| DB pool saturation | `db.client.connection.wait_count` increasing | 5 min |
| Frontend error spike | Faro exceptions > 3× 1-day baseline after a new `app.version` appears | 15 min |
| Telemetry silent | no `app.build.info` samples | 15 min |

## Risks

| Risk | Mitigation |
|---|---|
| Free-tier limits change | Cardinality budget has 3× headroom; the sampler ratio is an env var. |
| `otelgqlgen` field spans overwhelm Tempo on list queries | `IsResolver` filter; dataloaders already batch hot fields. Measure trace size in Task 5. |
| Sevalla can't pass `GIT_SHA` build arg | The version in source is authoritative; the SHA is optional. |
| PWA/Capacitor users stay on an old frontend for a long time | This is exactly what `client.version` on backend spans and `app.client.requests` make visible. |
| Neon cutover changes DB host mid-rollout | Instrumentation doesn't depend on the host; the pool gauges carry on unchanged. |

## Roadmap placement

A new GSD roadmap entry, **Phase 25: Observability & Release Tagging**, with four plans
(25-01 … 25-04) that point to sections of the single superpowers plan. Phase 7.4
(Performance Monitoring, complete) is the predecessor. This phase builds on its log lines
rather than replacing them.
