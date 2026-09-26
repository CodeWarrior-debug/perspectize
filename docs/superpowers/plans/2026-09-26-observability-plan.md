# Observability & Release Tagging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing (inert) OpenTelemetry setup into working traces, per-operation
performance metrics, trace-linked logs and frontend error/vitals monitoring, all sent to
Grafana Cloud. Also stamp every signal with the frontend and backend release versions,
produced automatically from conventional commits.

**Architecture:** A new `backend/pkg/telemetry` package owns the Tracer, Meter and Logger
providers and is a no-op without `OTEL_EXPORTER_OTLP_ENDPOINT`. Spans come from `otelhttp`
(router and outbound clients), `otelgqlgen` (operations and resolver fields) and the GORM
OpenTelemetry plugin. Metrics are app-owned histograms and gauges whose attribute values are
capped by a bounded normalizer. The frontend uses the Grafana Faro Web SDK, which sends W3C
`traceparent` to the API origin only. release-please writes versions into source files, so
Sevalla's git-driven builds pick them up without build args.

**Tech Stack:** Go 1.26, OpenTelemetry Go SDK v1.46 (+ contrib v0.71: `otelhttp`, `runtime`;
`otelslog` bridge v0.20; OTLP HTTP trace, metric and log exporters),
`github.com/ravilushqa/otelgqlgen` v0.19, `gorm.io/plugin/opentelemetry` v0.1.16,
`@grafana/faro-web-sdk` / `@grafana/faro-web-tracing` v2.12,
`@grafana/faro-rollup-plugin` v0.13, `googleapis/release-please-action` v4, Grafana Cloud.

**Spec:** `docs/superpowers/specs/2026-09-26-observability-design.md`

**Roadmap:** `.planning/ROADMAP.md` → Phase 25 (plans 25-01 … 25-04 map to the task groups
below).

## Global Constraints

- **No-op by default.** With no `OTEL_*` / `VITE_FARO_URL` env vars set, the backend and
  frontend behave exactly as they do today. CI and local dev need no Grafana account.
- **Keep the stdout JSON log format unchanged.** Sevalla's log viewer parses it (see
  `backend/pkg/logger/logger.go`). OTLP log export is added alongside it, never instead of it.
- **Never record** GraphQL variables, SQL bind values, request bodies or the `Authorization`
  header. User identity on spans is the numeric internal user ID only.
- **Every metric attribute value that comes from request input goes through
  `telemetry.BoundedSet`.** This currently means operation name, client version and client
  platform.
- Pin every new Go module and npm package to the versions above. Look up each library's
  current option names in its docs (context7-docs agent) before writing code. The snippets
  below are the intended shape, and option names can drift between minor versions.
- Follow repo conventions: no `&&`-chained shell commands, `gofmt` clean, conventional
  commits, one logical change per commit, `*TEMP*` for learning comments.
- Verification per `CLAUDE.md` Self-Verification: `go build ./...`, `gofmt -l .`,
  `go test ./...` in `backend/`; `pnpm run test:run` and `pnpm run check` in `frontend/`.
- **Don't attempt Grafana, Sevalla dashboard or secret steps from an agent session.** They
  are listed in the Manual checklist at the end.

---

## 25-01 — Backend tracing foundation

### Task 1: `buildinfo` package (version source of truth)

**Files:**
- Create: `backend/pkg/buildinfo/buildinfo.go`
- Test: `backend/pkg/buildinfo/buildinfo_test.go`

**Interfaces:**
- Produces: `buildinfo.Version` (string, rewritten by release-please),
  `buildinfo.Commit` (string, set by `-ldflags -X`), `buildinfo.Info() (version, commit string)`.
  Consumed by Task 2 (resource) and Task 7 (`app.build.info`).

- [ ] **Step 1: Write the failing test**

```go
package buildinfo_test

func TestInfo_DefaultsAreNonEmpty(t *testing.T) {
	v, c := buildinfo.Info()
	assert.NotEmpty(t, v)
	assert.Equal(t, "unknown", c) // no ldflags in `go test`
}
```

- [ ] **Step 2: Implement**

```go
package buildinfo

// Version is bumped by release-please on every backend release.
var Version = "0.1.0" // x-release-please-version

// Commit is injected at build time: -ldflags "-X .../pkg/buildinfo.Commit=$GIT_SHA".
// Empty when the builder (e.g. Sevalla) does not pass GIT_SHA.
var Commit = ""

func Info() (string, string) {
	c := Commit
	if c == "" {
		c = "unknown"
	}
	return Version, c
}
```

Note: `Version` must be a `var` (not `const`) so `-X` could override it in an emergency, and
the `x-release-please-version` marker must stay on the same line as the literal.

- [ ] **Step 3:** `go test ./pkg/buildinfo/...` passes. Commit: `feat(backend): add buildinfo version package`.

### Task 2: `telemetry.Setup` — providers, resource, no-op fallback

**Files:**
- Create: `backend/pkg/telemetry/telemetry.go`
- Test: `backend/pkg/telemetry/telemetry_test.go`
- Modify: `backend/cmd/server/main.go` (replace the `initTracer` block at the top of `main()`
  and delete `initTracer`)
- Modify: `backend/go.mod` / `go.sum`

**Interfaces:**
- Produces:
  ```go
  type Config struct {
      ServiceName string // default "perspectize-backend"
      Environment string // APP_ENV
  }
  // Setup installs global Tracer/Meter/Logger providers + W3C propagator.
  // Enabled() is false (and all providers are no-op) when OTEL_EXPORTER_OTLP_ENDPOINT is unset.
  func Setup(ctx context.Context, cfg Config) (shutdown func(context.Context) error, err error)
  func Enabled() bool
  func Meter() metric.Meter   // otel.Meter("github.com/CodeWarrior-debug/perspectize/backend")
  func Tracer() trace.Tracer
  ```
- Consumed by every later backend task.

- [ ] **Step 1: Add modules**

```bash
go get go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp@v1.46.0
```
```bash
go get go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploghttp@v0.22.0
```
```bash
go get go.opentelemetry.io/otel/sdk/metric@v1.46.0
```
```bash
go get go.opentelemetry.io/otel/sdk/log@v0.22.0
```

(Keep all `go.opentelemetry.io/otel/*` stable modules on the **same** minor version as the
existing `otel v1.46.0`. Don't pull the `-rc` metric exporter.)

- [ ] **Step 2: Write failing tests**

```go
func TestSetup_NoEndpoint_IsNoop(t *testing.T) {
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")
	shutdown, err := telemetry.Setup(context.Background(), telemetry.Config{Environment: "test"})
	require.NoError(t, err)
	assert.False(t, telemetry.Enabled())
	assert.NoError(t, shutdown(context.Background()))
}

func TestSetup_WithEndpoint_SetsResourceAttrs(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer srv.Close()
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", srv.URL)
	shutdown, err := telemetry.Setup(context.Background(), telemetry.Config{Environment: "test"})
	require.NoError(t, err)
	defer shutdown(context.Background())
	assert.True(t, telemetry.Enabled())
	res := telemetry.Resource()
	assertAttr(t, res, "service.name", "perspectize-backend")
	assertAttr(t, res, "deployment.environment.name", "test")
	assertAttr(t, res, "service.version", buildinfo.Version)
}

func TestSetup_ResourceFromEnvOverrides(t *testing.T) {
	// OTEL_RESOURCE_ATTRIBUTES=service.version=9.9.9 must win (Sevalla dashboard escape hatch)
}
```

- [ ] **Step 3: Implement.** Resource merge order:
  `resource.Default()` → code attrs (`service.name`, `service.version`,
  `deployment.environment.name`, `vcs.ref.head.revision` if the commit is known) →
  `resource.WithFromEnv()` **last**. Tracer provider: `sdktrace.WithBatcher(otlptracehttp)`
  and the sampler from env (the SDK reads `OTEL_TRACES_SAMPLER` itself). Meter provider:
  `sdkmetric.NewPeriodicReader(otlpmetrichttp, 30s)`. Logger provider:
  `sdklog.NewBatchProcessor(otlploghttp)`. Propagator:
  `propagation.NewCompositeTextMapPropagator(TraceContext{}, Baggage{})`. `shutdown` joins
  all three providers' `Shutdown` errors with `errors.Join`. Use semconv `v1.26.0` (already
  imported in `main.go`), or the newest semconv package shipped in otel v1.46 if it has
  `DeploymentEnvironmentName`.
- [ ] **Step 4: Wire into `main.go`.** Replace the existing
  `if os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT") != ""` block with
  `telemetry.Setup(ctx, telemetry.Config{Environment: os.Getenv("APP_ENV")})`. Move it
  **after** `godotenv.Load()` so a local `.env` can enable it. Keep the warn-and-continue
  behaviour on error. Delete `initTracer` and its now-unused imports.
- [ ] **Step 5:** build, gofmt, tests. Commit: `feat(backend): centralise OpenTelemetry setup in pkg/telemetry`.

### Task 3: Bounded attribute normalizer (cardinality guard)

**Files:**
- Create: `backend/pkg/telemetry/bounded.go`
- Test: `backend/pkg/telemetry/bounded_test.go`

**Interfaces:**
- Produces: `NewBoundedSet(max int, pattern *regexp.Regexp) *BoundedSet`;
  `(*BoundedSet).Normalize(s string) string`, which returns `s` if it matches the pattern and
  is already known, or is new while fewer than `max` values are known. Otherwise it returns
  `"other"`. Empty input returns `"anonymous"`. Safe for concurrent use.
- Consumed by Task 4 (client version/platform) and Task 6 (operation name).

- [ ] **Step 1: Failing table-driven tests** covering: valid new name accepted; the same
  name after the cap is still accepted; a new name after the cap becomes `"other"`; a
  regex-invalid name becomes `"other"`; empty becomes `"anonymous"`; 100 goroutines
  normalising concurrently (`-race`).
- [ ] **Step 2: Implement** with `sync.RWMutex` + `map[string]struct{}`. Read-lock the fast
  path.
- [ ] **Step 3: Declare the shared patterns here:**
  `OperationNamePattern = ^[A-Za-z_][A-Za-z0-9_]{0,63}$`,
  `ClientVersionPattern = ^[0-9A-Za-z.+-]{1,32}$`, `ClientPlatformPattern = ^(web|ios|android)$`.
- [ ] **Step 4:** tests with `-race`. Commit: `feat(backend): add bounded-cardinality attribute normalizer`.

### Task 4: HTTP server spans, CORS headers, client-version context, panic → span

**Files:**
- Create: `backend/pkg/middleware/clientinfo.go` + `clientinfo_test.go`
- Modify: `backend/cmd/server/main.go` (CORS `AllowedHeaders`, wrap the router, add the
  `ClientInfo` middleware)
- Modify: `backend/pkg/middleware/recovery.go` (+ a test)

**Interfaces:**
- Produces: `middleware.ClientInfo(next http.Handler) http.Handler`. It reads
  `X-Client-Version` / `X-Client-Platform`, normalizes both through `BoundedSet`, stores them
  in the context (`middleware.ClientInfoFrom(ctx) (version, platform string)`), sets span
  attributes `client.version` and `client.platform`, and increments
  `app.client.requests{client.version, client.platform}` (counter via `telemetry.Meter()`).
- Consumed by Task 6 (operation span/log enrichment).

- [ ] **Step 1: Add dependency**

```bash
go get go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp@v0.71.0
```

- [ ] **Step 2: Failing tests for `ClientInfo`:** headers are propagated to the context;
  missing headers become `"unknown"`; a garbage version becomes `"other"`; a 10k-char header
  doesn't crash and becomes `"other"`.
- [ ] **Step 3: Failing test for `Recoverer`:** use an in-memory span recorder
  (`sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(tracetest.NewSpanRecorder()))`)
  and have a handler panic inside a started span. Assert that the span has status `Error`
  and an `exception` event. Then implement: in the `recover()` branch call
  `trace.SpanFromContext(r.Context())` → `RecordError(fmt.Errorf("panic: %v", err))`, then
  `SetStatus(codes.Error, "panic")`.
- [ ] **Step 4: CORS.** In `main.go`, extend `AllowedHeaders` to
  `{"Content-Type", "Authorization", "traceparent", "tracestate", "X-Client-Version", "X-Client-Platform"}`.
  Add a test (or extend the existing security/CORS test, if there is one; grep
  `AllowedHeaders` under `backend/test`) that sends an `OPTIONS` preflight with
  `Access-Control-Request-Headers: traceparent,x-client-version` and asserts it is allowed.
- [ ] **Step 5: Wrap the router.** Keep chi's `r` as is and wrap it where it is handed to
  `http.Server`:

```go
handler := otelhttp.NewHandler(r, "http.server",
	otelhttp.WithFilter(func(req *http.Request) bool {
		if isWebsocketHandshake(req) {
			return false // subscription lifetimes would produce hour-long spans
		}
		return req.URL.Path != "/health" && req.URL.Path != "/ready"
	}),
	otelhttp.WithSpanNameFormatter(func(_ string, req *http.Request) string {
		return req.Method + " " + req.URL.Path // routes are few and static (/graphql, /webhooks/clerk)
	}),
)
server := &http.Server{Handler: handler, /* timeouts unchanged */}
```

  Put `r.Use(apimw.ClientInfo)` right after `middleware.RealIP`, so rate-limited and
  unauthenticated requests are tagged too.
- [ ] **Step 6: Assert that no `Authorization` header is recorded.** Add a test that sends a
  request with `Authorization: Bearer secret` through the wrapped handler with a span
  recorder, and asserts that no attribute value contains `secret`.
- [ ] **Step 7:** build, gofmt, tests. Commit: `feat(backend): HTTP tracing, client version tagging, CORS trace headers`.

### Task 5: GraphQL, GORM and outbound HTTP spans

**Files:**
- Modify: `backend/cmd/server/main.go` (gqlgen `srv.Use`, GORM `db.Use`)
- Modify: `backend/internal/adapters/youtube/client.go`, `backend/internal/adapters/wikidata/client.go`
- Test: `backend/test/telemetry/tracing_integration_test.go` (new; uses the existing CI
  Postgres service)

- [ ] **Step 1: Add dependencies**

```bash
go get github.com/ravilushqa/otelgqlgen@v0.19.0
```
```bash
go get gorm.io/plugin/opentelemetry@v0.1.16
```

- [ ] **Step 2: gqlgen.** Register **before** `AroundOperations(...)` so the operation span
  is already in the context when `OperationMetrics` (Task 6) runs:

```go
srv.Use(otelgqlgen.Middleware(
	otelgqlgen.WithoutVariables(),
	otelgqlgen.WithCreateSpanFromFields(func(fc *graphql.FieldContext) bool {
		return fc.IsResolver // skip trivial struct-field reads
	}),
))
```

- [ ] **Step 3: GORM.** After `database.ConnectGORM`, and next to `RegisterSlowQueryLogger`:

```go
if err := db.Use(tracing.NewPlugin(tracing.WithoutMetrics(), tracing.WithoutQueryVariables())); err != nil {
	slog.Warn("gorm otel plugin not registered", "error", err)
}
```

  Keep `RegisterSlowQueryLogger`. The log line is still useful in Sevalla, and the plan's
  trace-linked logs make it clickable.
- [ ] **Step 4: Outbound clients.** YouTube:
  `&http.Client{Transport: otelhttp.NewTransport(http.DefaultTransport)}`. Wikidata: the
  same, keeping the 10s timeout. Existing tests that swap in `httptest` servers through
  `baseURL` should be unaffected. Run them to confirm.
- [ ] **Step 5: Integration test.** Install a span recorder as the global provider, execute
  a `ListContent`-style GraphQL POST through the fully wired router (reuse the
  `backend/test` harness pattern), and assert that one trace contains:
  - an `http.server` root span
  - a child GraphQL operation span named after the operation
  - at least one `gorm.Query` span

  Also assert that no span attribute contains the literal variable values that were sent.
- [ ] **Step 6: Measure trace size.** Log span count for `ListContent` with page size 25.
  If it exceeds ~150 spans, narrow `WithCreateSpanFromFields` (e.g. skip
  `Content.primaryCategory`, which dataloaders already batch) and record the decision in the
  commit message.
- [ ] **Step 7:** build, gofmt, `go test -p 1 ./...`. Commit: `feat(backend): trace GraphQL resolvers, SQL, and outbound HTTP`.

---

## 25-02 — Metrics & trace-linked logs

### Task 6: Per-operation histogram (`OperationTimer` → `OperationMetrics`)

**Files:**
- Modify: `backend/pkg/graphql/timing.go` → rename to `backend/pkg/graphql/operation_metrics.go`
- Modify: `backend/pkg/graphql/timing_test.go` → `operation_metrics_test.go`
- Modify: `backend/cmd/server/main.go` (`srv.AroundOperations(gqltiming.OperationMetrics(...))`)

**Interfaces:**
- Produces: `OperationMetrics(m metric.Meter, names *telemetry.BoundedSet) graphql.OperationMiddleware`.
  It records the histogram `graphql.server.operation.duration` (unit `s`, explicit buckets
  `.005,.01,.025,.05,.1,.25,.5,1,2.5,5,10`) with the attributes:
  - `graphql.operation.name` (normalized)
  - `graphql.operation.type` (`query`|`mutation`|`subscription`)
  - `has_errors` (bool)

  It keeps the existing `slog.InfoContext(ctx, "graphql", ...)` line and adds the
  `operation_type`, `client_version` and `has_errors` fields to it.

- [ ] **Step 1: Failing tests** using `sdkmetric.NewManualReader()`:
  - a successful query records one data point with the expected attributes
  - a resolver error gives `has_errors=true`. Wrap the `ResponseHandler`, because gqlgen
    errors are only known after `rh(ctx)` returns. For subscriptions, record once on the
    first response only, so a long-lived subscription doesn't emit endless durations.
  - an anonymous operation gives `graphql.operation.name="anonymous"`
  - 300 distinct names give at most 200 distinct names plus `"other"`
- [ ] **Step 2: Implement.** Operation type comes from `oc.Operation.Operation`. The
  duration is measured to the **first** response (for queries and mutations that is the
  whole operation). Keep the function signature change to `main.go` only.
- [ ] **Step 3: Fix the anonymous query** in `frontend/src/lib/queries/` (the one
  `query(` with no name; find it with `grep -rn "query(" frontend/src/lib/queries`). Give it
  a PascalCase name that matches its hook.
- [ ] **Step 4:** tests with `-race`. Commit: `feat(backend): per-operation GraphQL latency/error histogram`.

### Task 7: DB pool gauges, Go runtime metrics, `app.build.info`

**Files:**
- Create: `backend/pkg/database/metrics.go` + `metrics_test.go`
- Create: `backend/pkg/telemetry/buildinfo_metric.go` + test
- Modify: `backend/cmd/server/main.go`

- [ ] **Step 1: Add dependency**

```bash
go get go.opentelemetry.io/contrib/instrumentation/runtime@v0.71.0
```

- [ ] **Step 2: Pool gauges (TDD with `ManualReader` + `sqlmock`).**
  `RegisterPoolMetrics(m metric.Meter, db *sql.DB) error` registers observable gauges from
  `db.Stats()`:
  - `db.client.connection.count{state=idle|used}`
  - `db.client.connection.max`
  - `db.client.connection.wait_count` (counter)
  - `db.client.connection.wait_duration` (counter, s)

  This reuses the numbers the existing `/debug/db-stats` handler already reads.
- [ ] **Step 3: `app.build.info`.** Add an observable gauge that always reports `1` with
  attributes `service.version` and `vcs.ref.head.revision`. The test asserts the value and
  attributes. This one series is the deploy marker: in Grafana,
  `count by (service_version)(app_build_info)` changes exactly at deploy time.
- [ ] **Step 4:** In `main.go`, call
  `runtime.Start(runtime.WithMeterProvider(otel.GetMeterProvider()))` right after
  `telemetry.Setup`. Call `RegisterPoolMetrics` right after `sqlDB` is obtained. Log and
  continue on errors.
- [ ] **Step 5:** Commit: `feat(backend): DB pool, runtime, and build-info metrics`.

### Task 8: Trace-linked logs to OTLP (stdout unchanged)

**Files:**
- Modify: `backend/pkg/logger/logger.go`
- Create: `backend/pkg/logger/logger_test.go`
- Modify: `backend/cmd/server/main.go` (call a second setup step after `telemetry.Setup`)

- [ ] **Step 1: Add dependency**

```bash
go get go.opentelemetry.io/contrib/bridges/otelslog@v0.20.1
```

- [ ] **Step 2: Failing tests:**
  - `Setup()` alone writes the same JSON keys as today (`time`, `level`, `msg`, `source`)
  - with a span in the context, `trace_id` and `span_id` are present
  - after `EnableOTLP()`, records reach both the stdout buffer and an in-memory
    `sdklog` exporter
- [ ] **Step 3: Implement.** Keep `Setup()` as is: it must run before anything else logs,
  and before telemetry has been configured. Add `EnableOTLP()`, which (only when
  `telemetry.Enabled()`) replaces the default logger with
  `slog.New(slog.NewMultiHandler(existingTraceHandler, otelslog.NewHandler("perspectize-backend")))`.
  `slog.NewMultiHandler` is Go 1.26 stdlib, verified available. Use `Info` as the minimum
  level for the OTLP branch, so debug noise doesn't count against the 50 GB log budget.
- [ ] **Step 4:** Commit: `feat(backend): export trace-correlated slog records via OTLP`.

---

## 25-03 — Frontend monitoring (Faro) & version headers

### Task 9: Build info, `X-Client-Version` / `X-Client-Platform` headers (HTTP + WS)

**Files:**
- Modify: `frontend/vite.config.ts` (`define`)
- Create: `frontend/src/lib/buildInfo.ts`
- Modify: `frontend/src/app.d.ts` (declare `__APP_VERSION__`, `__GIT_SHA__`)
- Modify: `frontend/src/lib/queries/client.ts`, `frontend/src/lib/messaging/ws-client.svelte.ts`
- Test: `frontend/tests/unit/buildInfo.test.ts`, `frontend/tests/unit/graphqlClientHeaders.test.ts`

**Interfaces:**
- Produces: `APP_VERSION`, `GIT_SHA`, `clientPlatform(): 'web'|'ios'|'android'`,
  `clientInfoHeaders(): Record<string,string>`.

- [ ] **Step 1: vite `define`:**

```ts
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
function gitSha(): string {
	if (process.env.GIT_SHA) return process.env.GIT_SHA;
	try {
		return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
	} catch {
		return 'unknown'; // Sevalla build without .git
	}
}
// in defineConfig: define: { __APP_VERSION__: JSON.stringify(pkg.version), __GIT_SHA__: JSON.stringify(gitSha()) }
```

  Make sure the vitest `unit` project gets the same `define` (tests import `buildInfo.ts`).
- [ ] **Step 2: Failing tests:** `clientPlatform()` returns `'web'` when Capacitor reports
  `web`, and `'ios'` when mocked. `graphqlRequest` sends `X-Client-Version` and
  `X-Client-Platform`. Mock `GraphQLClient.request` and assert on the headers argument.
- [ ] **Step 3: Implement.** Add the headers in `graphqlRequest` next to `Authorization`.
  Change WS `connectionParams` to
  `{ authToken, clientVersion: APP_VERSION, clientPlatform: clientPlatform() }`. On the
  backend, read these in the websocket `InitFunc` in `main.go` and set them as span
  attributes on the connection-init path. That is a small follow-up inside this task: add
  a test in the existing WS init tests, if present.
- [ ] **Step 4:** `pnpm run test:run`, `pnpm run check`, prettier. Commit: `feat(frontend): stamp requests with client version and platform`.

### Task 10: Faro Web SDK (errors, web vitals, fetch tracing) + CSP

**Files:**
- Create: `frontend/src/lib/telemetry.ts`
- Delete: `frontend/src/lib/vitals.ts` (and its test, if any)
- Modify: `frontend/src/routes/+layout.svelte` (replace the `reportWebVitals()` call)
- Modify: `frontend/src/app.html` (CSP `connect-src`)
- Modify: `frontend/tests/unit/csp.test.ts`
- Test: `frontend/tests/unit/telemetry.test.ts`

- [ ] **Step 1: Install**

```bash
pnpm add --dir frontend @grafana/faro-web-sdk@2.12.1 @grafana/faro-web-tracing@2.12.1
```

- [ ] **Step 2: Failing tests** (mock `@grafana/faro-web-sdk`):
  - `initTelemetry()` does not call `initializeFaro` when `VITE_FARO_URL` is empty
  - it passes `app: { name: 'perspectize-web', version: APP_VERSION, environment }`
  - `propagateTraceHeaderCorsUrls` matches the `VITE_GRAPHQL_URL` origin and does **not**
    match `https://api.clerk.com` or `https://www.googleapis.com`
  - `beforeSend` removes query strings from `page.url`
  - calling it twice initialises once
- [ ] **Step 3: Implement `telemetry.ts`.** Load it with dynamic `import()`, so Faro never
  lands in the critical-path chunk (same reasoning as the tiptap `manualChunks` comment in
  `vite.config.ts`). Use `getWebInstrumentations({ captureConsole: false })`, which includes
  web vitals, plus `new TracingInstrumentation({ instrumentationOptions: { propagateTraceHeaderCorsUrls: [apiOriginRegex] } })`.
  Set the session attribute `platform` to `clientPlatform()`.
- [ ] **Step 4: CSP.** Add the Faro collector origin to `connect-src` in `app.html`, e.g.
  `https://faro-collector-prod-*.grafana.net`. Confirm the exact host from the Grafana app
  settings in Manual step M3. Update `csp.test.ts` to assert it.
- [ ] **Step 5:** Remove `vitals.ts` and its import. Leave the `web-vitals` dependency in
  place only if something else imports it (grep). Otherwise remove it from `package.json`.
- [ ] **Step 6:** tests, check, prettier. Commit: `feat(frontend): Grafana Faro RUM, error tracking, and trace propagation`.

### Task 11: Source-map upload (never served publicly)

**Files:**
- Modify: `frontend/vite.config.ts`, `frontend/package.json` (scripts)
- Create: `frontend/scripts/strip-sourcemaps.mjs`

- [ ] **Step 1:** `pnpm add -D --dir frontend @grafana/faro-rollup-plugin@0.13.0`
- [ ] **Step 2:** In `vite.config.ts`, when `process.env.FARO_SOURCEMAP_API_KEY` is set,
  turn on `build.sourcemap: 'hidden'` and push `faroUploader({ appName: 'perspectize-web', endpoint, appId, stackId, apiKey, gzipContents: true })`.
  Read the option names from the plugin README for v0.13. When the key is unset, the build
  is byte-identical to today.
- [ ] **Step 3:** `strip-sourcemaps.mjs` deletes `build/**/*.map`. Add it as the tail of the
  `build` script (`vite build && node scripts/strip-sourcemaps.mjs`). This is a
  package.json script, not a Bash chain, so the no-`&&` rule does not apply. Add a unit
  test that runs it against a temp dir.
- [ ] **Step 4:** Commit: `build(frontend): upload hidden source maps to Faro and strip from output`.

---

## 25-04 — Release tagging, rollout, dashboards & alerts

### Task 12: release-please (manifest, two components) + Docker `GIT_SHA`

**Files:**
- Create: `release-please-config.json`, `.release-please-manifest.json`
- Create: `.github/workflows/release-please.yml`
- Modify: `backend/Dockerfile`

- [ ] **Step 1: Config**

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "include-component-in-tag": true,
  "separate-pull-requests": false,
  "packages": {
    "backend":  { "release-type": "simple", "component": "backend",
                  "extra-files": ["pkg/buildinfo/buildinfo.go"] },
    "frontend": { "release-type": "node",   "component": "frontend" }
  }
}
```

  Manifest: `{ "backend": "0.1.0", "frontend": "0.0.1" }`, matching the current
  `package.json` and Task 1's literal.
- [ ] **Step 2: Workflow** on `push: branches: [main]` using
  `googleapis/release-please-action@v4` with `config-file` and `manifest-file`, and
  `permissions: contents: write, pull-requests: write`. Pin the action by SHA, following
  the repo's existing action-pinning style in `ci.yml`/`trivy.yml`.
- [ ] **Step 3: Dockerfile.** Add `ARG GIT_SHA=""` in the builder stage and extend ldflags:
  `-ldflags="-s -w -X github.com/CodeWarrior-debug/perspectize/backend/pkg/buildinfo.Commit=${GIT_SHA}"`.
  Leave `.dockerignore`'s `.git/` exclusion as is.
- [ ] **Step 4: Check Sevalla build context.** Using the `sevalla-mcp-ops` agent, check
  whether the backend app and the static site expose a commit SHA variable at build time.
  If they do, map it: Docker build arg `GIT_SHA` for the backend, env `GIT_SHA` for the
  static site. If they don't, record "commit = unknown in prod; version is authoritative"
  in `.docs/OBSERVABILITY.md`. Either way no code changes.
- [ ] **Step 5: Verify locally:** `docker build --build-arg GIT_SHA=abc123 backend`, if
  Docker is available. Otherwise `go build -ldflags "-X ...Commit=abc123" ./cmd/server`
  and a `buildinfo` test run with the same ldflags.
- [ ] **Step 6:** Commit: `ci: automate backend/frontend release tagging with release-please`.

### Task 13: Docs + CLAUDE.md pointer

**Files:**
- Create: `.docs/OBSERVABILITY.md`
- Modify: `CLAUDE.md` (Resources → Monorepo docs: one line)
- Modify: `backend/CLAUDE.md` (one line on the "all metric attrs from request input go
  through `BoundedSet`" rule)

- [ ] **Step 1:** Write `.docs/OBSERVABILITY.md`. Include:
  - the env var table from the spec
  - how to read a trace in Grafana (Explore → Tempo → `service.name=perspectize-backend`)
  - the cardinality rule
  - how to lower the sampling rate
  - the release-please flow (merge the release PR → tags → the next Sevalla deploy
    carries the version)
  - the Sevalla SHA finding from Task 12
- [ ] **Step 2:** Commit: `docs: observability runbook`.

### Task 14: Dashboards & alerts as code

**Files:**
- Create: `ops/grafana/dashboards/perspectize-api.json`, `ops/grafana/dashboards/perspectize-web.json`
- Create: `ops/grafana/alerts/perspectize-alerts.yaml`
- Create: `ops/grafana/README.md` (import/export steps)

- [ ] **Step 1: API dashboard panels:**
  - request rate and p95 by route
  - GraphQL p50/p95/p99 **per `graphql.operation.name`**: table plus a time series with a
    variable picker
  - error rate per operation
  - top 10 slowest operations (p95, last 24h)
  - DB pool in-use/idle/wait
  - Go heap and goroutines
  - `app.client.requests` by `client.version` (version-skew view)
  - a deploy-marker annotation driven by changes in `app_build_info`
- [ ] **Step 2: Web dashboard:** Faro's built-in Frontend Observability app covers vitals
  and errors. Add only one panel it doesn't have: errors per `app.version`.
- [ ] **Step 3: Alerts** from the spec's alert table, as Grafana-managed alert-rule YAML.
- [ ] **Step 4:** These JSON/YAML files are **exported from the UI after Manual step M5**,
  not hand-written blind. The agent drafts them, and the human imports, adjusts and
  re-exports. Commit: `feat(ops): Grafana dashboards and alert rules`.

---

## Manual checklist (human only — secrets, accounts, dashboards)

| # | Step | When |
|---|---|---|
| M1 | Create a Grafana Cloud stack (free). Note region, instance ID, OTLP endpoint. | any time before M2 |
| M2 | Create an access policy token with `metrics:write, logs:write, traces:write`. Put `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_SERVICE_NAME`, `OTEL_TRACES_SAMPLER(_ARG)` in the **Sevalla backend app** env. | after 25-01/25-02 merge |
| M3 | Create a Frontend Observability app. Copy the collector URL → `VITE_FARO_URL` (static site, build-time). Confirm the collector host for the CSP (Task 10 Step 4). Set allowed origins and rate limit in the app settings. | after 25-03 merge |
| M4 | Create a source-map API key → `FARO_SOURCEMAP_API_KEY`, `FARO_APP_ID`, `FARO_STACK_ID`, `FARO_API_ENDPOINT` on the static site. | after Task 11 merge |
| M5 | Redeploy both. Check that a trace appears end to end (browser fetch → `/graphql` → `gorm.Query`) and that a log line in Loki links to it. Then build and export dashboards and alerts (Task 14). | after M2–M4 |
| M6 | Set alert contact point (email/phone). | with M5 |
| M7 | Enable repo Settings → Actions → "Allow GitHub Actions to create and approve pull requests" (needed for release-please). | before Task 12 merge |

## Done when (maps to Phase 25 `must_haves.truths`)

- [ ] One trace in Grafana contains a browser fetch span, the `/graphql` server span, the
      GraphQL operation span, at least one resolver span and at least one `gorm.Query` span
- [ ] `graphql.server.operation.duration` p95 is graphable per operation name, and still
      queryable after 14 days (after traces have expired)
- [ ] Every backend span, metric and log carries `service.version`. Every Faro event
      carries `app.version`. Backend spans carry `client.version`
- [ ] Unset `OTEL_*`/`VITE_FARO_URL` → no network calls to Grafana, all tests green
- [ ] Merging a release-please PR creates `backend-vX.Y.Z` / `frontend-vX.Y.Z` tags, and the
      next deploy reports the new version in `app.build.info`
- [ ] Active metric series < 5k in Grafana's usage dashboard after 7 days
- [ ] No GraphQL variables, SQL parameters or `Authorization` values appear in any exported
      span (asserted in tests)
