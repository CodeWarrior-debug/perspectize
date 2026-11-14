# Observability

Phase 25 telemetry: how the signals flow, how to run the whole pipeline locally, and the
production settings. Design: `docs/superpowers/specs/2026-09-26-observability-design.md`.
Plan: `docs/superpowers/plans/2026-09-26-observability-plan.md`.

## Architecture in one line

The Go backend sends OTLP/HTTP (traces, metrics every 30s, logs) straight to Grafana
Cloud. The browser's Faro Web SDK sends errors, vitals and fetch spans to Grafana
Frontend Observability, and propagates `traceparent` to the GraphQL API only, so one
trace covers the click → `/graphql` → resolvers → SQL.

Everything is inert until env vars are set. With no `OTEL_EXPORTER_OTLP_ENDPOINT` and no
`VITE_FARO_URL`, nothing leaves the process.

## Local tracer stack (no Grafana Cloud account needed)

The demo stack ([DEMO_MODE.md](DEMO_MODE.md)) plus `docker-compose.observability.yml`
(an overlay in the same compose project):

| Service | Image | What it does | Host port (127.0.0.1) |
|---|---|---|---|
| `lgtm` | `grafana/otel-lgtm:0.34.0` | OTel Collector → Prometheus v3.14 / Tempo v3.0 / Loki v3.7, plus Grafana v13.2 | 3000 Grafana · 4317/4318 OTLP · 9090 Prometheus · 3200 Tempo · 3100 Loki |
| `alloy` | `grafana/alloy:v1.20.1` | `faro.receiver` for the browser. Traces go to lgtm's collector, logs to lgtm's Loki (`ops/observability/alloy/config.alloy`) | 12347 Faro · 12345 Alloy UI |
| `backend` | demo backend + `OTEL_EXPORTER_OTLP_ENDPOINT=http://lgtm:4318`, `OTEL_TRACES_SAMPLER=parentbased_always_on`, `SVL_DEPLOYMENT_COMMIT_SHA/BRANCH` from your checkout | | 8081 |
| `frontend` | demo image built with `VITE_FARO_URL=http://localhost:12347/collect`, `VITE_APP_ENV=demo` | | 4173 |

```bash
make obs-up      # build + start everything, wait for health; prints the URLs
make obs-smoke   # send GraphQL traffic, then assert every signal arrived (PASS/FAIL, exits non-zero on failure)
make obs-down    # stop demo + observability containers (demo DB volume kept; LGTM data is not persisted)
```

Use `obs-down`, not `demo-down`. `demo-down` only knows the demo file and would leave
`lgtm`/`alloy` running as orphans. The first `make obs-up` pulls about 900 MB for otel-lgtm.
It rebuilds the frontend image with Faro on, and the next plain `make demo-up` rebuilds
it without Faro.

`make obs-smoke` sends `ListComparableContent` anonymously and `Me` as `Bearer
demo.alice` (queries copied verbatim from `frontend/src/lib/queries`), with
`X-Client-Version: obs-smoke`. It checks the demo frontend's CSP allows the Faro origin and
POSTs a synthetic Faro log to Alloy. It then polls for up to 90s
(`OBS_SMOKE_TIMEOUT`) for:
the operation histogram, `app_build_info`, `app_client_requests_total`, the DB pool gauge,
a Tempo trace for `perspectize-backend`, a backend log line in Loki, and the Faro log line
in Loki.

### Where to click (Grafana at http://localhost:3000, anonymous admin)

- **Metrics:** the home dashboard is **Perspectize API** (folder *Perspectize*). You can
  also use Explore → Prometheus and query `app_build_info`.
- **A trace:** Explore → Tempo → Search, Service Name = `perspectize-backend`. Or use
  TraceQL: `{resource.service.name="perspectize-backend"}`. For a browser-to-DB trace,
  click around http://localhost:4173 first, then search
  `{resource.service.name="perspectize-web"}`. The fetch span's children are the
  backend's `POST /graphql` → operation → resolver → SQL spans (named
  `"<VERB> <table>"`, e.g. `SELECT content`, not `gorm.Query`; see
  `backend/CLAUDE.md`).
- **Logs:** Explore → Loki → `{service_name="perspectize-backend"}`. Each GraphQL request
  logs one `graphql` line with `operation`, `duration_ms`, `has_errors` and
  `client_version`. A span's "Logs for this span" button jumps from Tempo to its log
  lines. Frontend: `{service_name="perspectize-web"}` (logfmt lines from Faro, labelled
  with `app_name` and `kind`).
- **Alert:** Alerting → Alert rules → Perspectize → *GraphQL operation p95 latency above
  1s*. It normally stays Normal. To see it fire, add latency locally. Nothing in the
  repo does that on purpose.

Dashboard/alert files and how to import them into Grafana Cloud:
[ops/grafana/README.md](../ops/grafana/README.md).

In the demo image `app.version` / `X-Client-Version` are `unknown`, because the frontend
Docker build context has no `.git` and `vite.config.ts` falls back. The backend's
`service.version` is the short SHA of your checkout, which `make obs-up` passes as
`SVL_DEPLOYMENT_COMMIT_SHA`.

## Production environment variables

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
| Sevalla app (backend, runtime) — provided by Sevalla | `SVL_DEPLOYMENT_COMMIT_SHA`, `SVL_DEPLOYMENT_BRANCH` | read by `pkg/buildinfo`; nothing to set |
| Sevalla app (backend, runtime) — optional | `BUILD_TAG` | full `v<date>-<sha7>` tag; without it `service.version` falls back to the short SHA |
| GitHub Actions | none required | `tag-main.yml` (#495) pushes tags with the default `GITHUB_TOKEN` |

`OTEL_RESOURCE_ATTRIBUTES` is applied last, so it can override any resource attribute
(`service.version`, `deployment.environment.name`, …) from the Sevalla dashboard.

## Versioning

- **One tag scheme:** `v<YYYY.MM.DD>-<sha7>`, from the committer date in UTC.
  `tag-main.yml` pushes it after CI passes on `main`. `ComputeTag` (Go),
  `computeTag` (TS) and the workflow all compute it, and they're checked against
  `testdata/version-tag-fixture.json`.
- **Frontend:** `vite.config.ts` resolves the tag from the local `.git` at build time. It
  becomes Faro's `app.version` and the `X-Client-Version` header. Confirmed 2026-09-28:
  Sevalla's static-site build **has** `.git`. The preview bundle for commit `003538a`
  inlined the tag `v2026.09.28-003538a`.
- **Backend:** `pkg/buildinfo` reads the commit from `SVL_DEPLOYMENT_COMMIT_SHA`. Sevalla
  exposes no committer date, so the version is `BUILD_TAG` if set, otherwise the short
  SHA. The short SHA matches the suffix of the frontend tag, so the two can be joined.
- **What's deployed right now:** type `zzzv` anywhere in the app (console hotkey), or
  `GET /version` on the API (#495). In Grafana, use the "Running build" table and the
  "Deploys" annotation on the API dashboard (`app_build_info`).

## Cardinality rule

Any metric attribute whose value comes from request input must go through
`telemetry.BoundedSet` (`backend/pkg/telemetry/bounded.go`). That covers
`graphql.operation.name` (≤200 values), `client.version` (≤50) and `client.platform`.
Values that fail the regex, or that arrive after the cap is reached, are reported as
`other`, and an empty value is reported as `anonymous`. Never put IDs, usernames, URLs or
free text on a metric. They belong on spans, if anywhere. Budget: < 3,500 active series
against Grafana Cloud free tier's 10k.

## What spans never carry

- **GraphQL variables:** `otelgqlgen` runs `WithoutVariables`.
- **SQL bind values:** GORM spans record the parameterized statement only.
- **Outbound query-string values:** otelhttp records the full request URL as
  `url.full` on client spans, and the YouTube client sends its API key as `?key=`
  (TMDB search sends the user's text as `?query=`). `telemetry.Setup` wraps the trace
  exporter in `telemetry.RedactURLs`, which replaces every query value with
  `REDACTED` on export (`…/videos?id=REDACTED&key=REDACTED`). Any new
  `TracerProvider` that exports real spans must wrap its exporter the same way.
  Wrap new outbound HTTP clients in `otelhttp.NewTransport`, and send credentials
  in headers where the API allows it.

## Sampling

The sampler is configured only through env vars (the standard OTel SDK variables, no
code change):

- Production default: `OTEL_TRACES_SAMPLER=parentbased_traceidratio`,
  `OTEL_TRACES_SAMPLER_ARG=1.0` (keep everything).
- To cut trace volume, lower `OTEL_TRACES_SAMPLER_ARG` (e.g. `0.25`) in the Sevalla
  backend env and redeploy. `parentbased_*` keeps the browser's decision for propagated
  traces, so frontend and backend spans stay together.
- Locally: `parentbased_always_on`.

Metrics aren't sampled. Latency graphs and alerts stay exact at any trace ratio.

## Metric name mapping (OTel → Prometheus)

In the local stack, the collector forwards OTLP metrics to Prometheus's native OTLP
receiver (`/api/v1/otlp`). otel-lgtm 0.34.0's `prometheus.yaml` sets no
`translation_strategy`, so it runs with Prometheus v3.14.0's default,
`UnderscoreEscapingWithSuffixes`
([configuration docs at v3.14.0](https://github.com/prometheus/prometheus/blob/v3.14.0/docs/configuration/configuration.md)).
The rules come from `prometheus/otlptranslator` v1.0.0 (`metric_namer.go`):

- dots become `_`
- unit `s` adds `_seconds`
- monotonic counters add `_total`
- unit `1` on a gauge adds `_ratio`
- `{…}` annotation units are dropped
- attribute keys have dots replaced by `_`
- `convert_histograms_to_nhcb` is off by default, so explicit-bucket histograms stay
  classic `_bucket`/`_sum`/`_count` series

| OTel instrument | Kind / unit | Prometheus series | Labels |
|---|---|---|---|
| `graphql.server.operation.duration` | histogram, `s` | `graphql_server_operation_duration_seconds_bucket` / `_sum` / `_count` | `graphql_operation_name`, `graphql_operation_type`, `has_errors` (`"true"`/`"false"`) |
| `http.server.request.duration` (otelhttp v0.71) | histogram, `s` | `http_server_request_duration_seconds_bucket` / `_sum` / `_count` | `http_request_method`, `http_response_status_code`, … |
| `db.client.connection.count` | up-down counter (non-monotonic → gauge) | `db_client_connection_count` | `state` (`idle`/`used`) |
| `db.client.connection.max` | gauge | `db_client_connection_max` | |
| `db.client.connection.wait_count` | counter | `db_client_connection_wait_count_total` | |
| `db.client.connection.wait_duration` | counter, `s` | `db_client_connection_wait_duration_seconds_total` | |
| `app.build.info` | gauge (=1) | `app_build_info` | `service_version`, `vcs_ref_head_revision` |
| `app.client.requests` | counter | `app_client_requests_total` | `client_version`, `client_platform` |
| Go runtime (`contrib/instrumentation/runtime` v0.71) | e.g. `go.goroutine.count` `{goroutine}`, `go.memory.used` `By` | `go_goroutine_count`, `go_memory_used_bytes` | |

Every series also gets:

- `job` = `service.name` (`perspectize-backend`; `namespace/name` if `service.namespace`
  is ever set)
- `instance` = `service.instance.id` (unset by the Go SDK today)
- promoted resource attributes: `service_name`, `service_version`,
  `deployment_environment_name`

A datapoint attribute beats a promoted resource attribute with the same name
(Prometheus `otlptranslator/prometheusremotewrite/helper.go`). So `app_build_info`'s
`service_version` is the datapoint value, not a `;`-joined pair. Dashboards and alerts
filter on **`job`**, because Grafana Cloud's OTLP gateway also sets it from
`service.name`.

**Verified from source, not yet from a live stack:** the names above come from the
pinned images' configs and the translator code. `make obs-smoke` is the live check. It
queries these exact names and fails if any is missing. The `go_*` names are also used by
otel-lgtm's own Go example test (`examples/go/oats-case.yaml`: `go_goroutine_count`).
Grafana Cloud's OTLP gateway uses the same `_seconds`/`_total` suffix conventions, but
check the names in Cloud's Explore after the first deploy (Manual step M5).

## Caveats

- **Subscription latency isn't real latency.** `graphql.server.operation.duration` is
  recorded once, at the first response. For a subscription that means "time to first
  event", so the p95 panels and the alert exclude `graphql_operation_type="subscription"`.
  WebSocket handshakes get no HTTP span either, since one would stay open for the whole
  subscription.
- **CSP.** `frontend/src/app.html` allows `https://*.grafana.net` in `connect-src`, which
  covers Grafana Cloud's Faro collector in production. The demo image
  (`frontend/Dockerfile.demo`) adds the local collector origin (`http://localhost:12347`)
  only when it's built with `VITE_FARO_URL`. Without that build arg the demo image is
  unchanged. The shipped `app.html` is never modified.
- **Local only.** The tracer stack runs anonymous-admin Grafana and unauthenticated
  receivers, bound to 127.0.0.1. Don't expose it.
- **Faro in production** goes to Grafana Cloud Frontend Observability, not Alloy.
  Alloy's `faro.receiver` doesn't work with the Cloud app. It's only here so the SDK can
  be exercised locally.
