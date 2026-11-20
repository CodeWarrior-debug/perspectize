# Double request logging in Sevalla logs — Research Spike

**Status:** spike, not a superpowers plan
**Date:** 2026-11-18
**Issue:** #558 — "double logging (graqphql + request) in sevalla logs - research"

## Question

Every GraphQL call appears in the Sevalla log viewer as two lines, a `request` line and a `graphql` line. Are both needed, is one redundant, and what would it take to merge or drop one?

**Scope limit:** this is a code-only investigation. The production log shape on Sevalla was not inspected (no access to production logs). Everything below describes what the backend *emits*, not what Sevalla *shows*.

## Short answer

The two lines are **intentional, not accidental**: the Phase 7.4 performance baseline asked for a per-HTTP-request line and a per-GraphQL-operation line as separate signals. They carry disjoint fields, and neither is a subset of the other. Keep both. If the goal is lower log volume, the change with the best payoff is to stop `RequestTimer` logging `/health`, `/ready` and `/version` probes (section 5), not to merge the two GraphQL lines.

## 1. What emits what

| Line | Emitted by | When | Level | Where |
|---|---|---|---|---|
| `request` | `backend/pkg/middleware/timing.go:20-27` (`RequestTimer`) | After the wrapped handler returns, for every request that reaches it | Info | `api.go:181`, registered via `r.Use` in `cmd/server/main.go:331-333` |
| `graphql` | `backend/pkg/graphql/operation_metrics.go:84-90` (`OperationMetrics`) | Once per operation, on the first response (`sync.Once`, line 68) | Info | `api.go:150` via `srv.AroundOperations` |

Both go through the same `slog` default. `logger.Setup` (`pkg/logger/logger.go:29-32`) writes JSON to stdout, and `EnableOTLP` (`logger.go:59-75`) adds an OTLP branch at Info and above. So each line reaches Sevalla's stdout and, when `OTEL_EXPORTER_OTLP_ENDPOINT` is set, Grafana Loki. Those are two sinks, not two copies in one sink.

### Fields

`request` (`timing.go:20-27`): `method`, `path`, `status`, `duration_ms`, `bytes`, `request_id`, plus `trace_id`/`span_id` added by `traceHandler` when the context carries a valid span.

`graphql` (`operation_metrics.go:84-90`): `operation` (normalized through `telemetry.BoundedSet`, so unknown names log as `other`), `operation_type`, `duration_ms`, `has_errors`, `client_version`, plus `trace_id`/`span_id`.

The two lines share **no** field except `trace_id`/`span_id`, and only when OTel is on. `request_id` is on the request line only. `operation`/`has_errors` are on the graphql line only. Status and bytes are on the request line only.

## 2. One HTTP GraphQL POST

For a normal single-operation `POST /graphql`, the middleware chain is (`internal/server/api.go:161-183`):

`RequestID` → `RealIP` → `ClientInfo` → `cors` → `GlobalRateLimit` → `SecureHeaders` → `ContentTypeValidation` → `auth.Middleware` → `graphqldl` → **`RequestTimer`** → `Recoverer` → `/graphql` handler.

gqlgen then runs:

1. `CreateOperationContext` (`gqlgen .../graphql/executor/executor.go:54-117`): parse, validate, variables, and the `operationContextMutators` (which include `FixedComplexityLimit`, `executor.go:109`).
2. `DispatchOperation` (`executor.go:118-124`): calls the operation middleware chain, which includes `OperationMetrics`, and produces the `graphql` line on the first response.
3. The HTTP handler writes the JSON response (`transport/http_post.go:127-128`).
4. Back in `RequestTimer`, after `next.ServeHTTP` returns, the `request` line is written.

So for a successful POST the order in the log is `graphql` then `request`, with the same `trace_id`. The `graphql` line's `duration_ms` is no greater than the `request` line's (both truncate to whole milliseconds), because it stops at the first response and excludes JSON encoding.

## 3. Requests that get only one line, or none

This matters more than the duplication does, because it decides whether either line can replace the other.

| Case | `request` line | `graphql` line | Why |
|---|---|---|---|
| Normal POST, operation runs | yes | yes | — |
| Parse error, validation error, complexity limit (`FixedComplexityLimit`), bad variables | **yes** (status 4xx) | **no** | Fails in `CreateOperationContext` before `DispatchOperation` (`http_post.go:115-125` writes the error and returns) |
| Rate-limited (429) | no | no | `GlobalRateLimit` writes 429 (`internal/adapters/web/middleware/ratelimit.go:23`) before `RequestTimer` is reached (`api.go:166` vs `181`) |
| Wrong Content-Type | no | no | `ContentTypeValidation` returns 415 (`contenttype.go:18-20`) before `RequestTimer` |
| CORS preflight (OPTIONS) | no | no | Answered by the `cors` middleware (`api.go:165`) |
| Unauthenticated GraphQL call | yes | yes | `auth.Middleware` passes unauthenticated requests through (`clerk_middleware.go:44`) |
| WebSocket subscription | yes, **emitted at socket close** | yes, once per operation's first response | `RequestTimer` wraps the whole upgrade; its `duration_ms` is the connection lifetime (inferred from the handler structure, not run) |
| `/health`, `/ready`, `/version` | **yes** | no | `r.Use` applies to every route registered after it (chi `mux.go:100-105`); `main.go:347`, `353`, `366` are registered after `r.Use` at `331-333` |

Consequences:

- **The `request` line is the only record of a GraphQL call that fails before an operation runs.** Dropping it loses those rows entirely.
- **The `graphql` line is the only record of operation name and `has_errors`.** Dropping it loses the per-operation view that the Phase 25 histogram (`graphql.server.operation.duration`) is built from, although the histogram itself is unaffected.
- **Health probes are logged.** `otelhttp` already excludes `/health` and `/ready` from tracing (`cmd/server/main.go:415-421`), but `RequestTimer` does not, so each probe writes a `request` line. The log-side equivalent of that filter has not been applied.
- **Rate-limited traffic is invisible in both lines.** A flood of 429s produces no log at all from these two middlewares.

## 4. Was the duplication intended?

Yes, from the start:

- `aeb87df7` (feat(07.4), performance monitoring baselines) added both lines. The plan (`.planning/phases/07.4-performance-monitoring/07.4-01-PLAN.md`) lists "Every HTTP request logs method, path, status code, and duration_ms" and, separately, "GraphQL operations log operation name and duration_ms" as distinct must-haves. The plan also says `RequestTimer` *replaces* chi's `middleware.Logger`. It does not say to fold the GraphQL timing into it.
- `20a07a83` (Phase 25 observability, #463) kept the `graphql` line and added the histogram beside it, on the same attributes (`operation_metrics.go:29-32` states this). The Phase 25 design spec (`docs/superpowers/specs/2026-09-26-observability-design.md`, lines 15-20, 141-143) keeps the stdout JSON "exactly as it is today" so Sevalla's log viewer is unaffected. So the duplicated shape was deliberately preserved.

**A bug in the original `graphql` line, now fixed:** in `aeb87df7` the line was logged right after `next(ctx)` returned its response handler, but before that handler ran (`pkg/graphql/timing.go`, the `slog.InfoContext` call precedes `return rh`), so `duration_ms` measured only middleware setup and was close to zero for every operation. `20a07a83` moved the log into the response handler, so the current value is time to first response. Any logs from before that commit show a meaningless `duration_ms` on the `graphql` line. Worth knowing when comparing older Sevalla history.

## 5. Options

| Option | What changes | Risk | Recommendation |
|---|---|---|---|
| **A. Keep both** | Nothing | None. Two lines per GraphQL call stay | **Default.** Both are doing distinct work |
| **B. Merge** (put operation fields on the request line) | `OperationMetrics` writes operation/has_errors into a mutable holder placed on the request context by `RequestTimer`; `RequestTimer` reads it after `ServeHTTP` | Medium. Needs a context holder that is safe under WebSocket concurrency (the `once` in `operation_metrics.go` exists because a subscription writes many responses). Still loses the rule that rejected calls get a line unless the holder is also written for them. Subscriptions would then have one line for the whole connection with an unbounded op list | Not recommended now. It trades two simple lines for one harder-to-reason-about line |
| **C. Drop the `request` line for `/graphql` POST** | Skip `RequestTimer` on `/graphql`, or skip it when the path is `/graphql` | High. Loses status and bytes for parse/validation failures, which are the only log of those (section 3) | Not recommended |
| **D. Stop logging probes** (`/health`, `/ready`, `/version`) | Make `RequestTimer` skip these paths, or mount the probes outside the middleware stack. The otelhttp filter at `cmd/server/main.go:421` is the precedent | Low. Removes a known source of noise. Probes can no longer be seen in logs (they remain visible as 200s in Sevalla's health view, which was not checked) | **Recommended if volume is the concern.** Smallest change: add the path check in `timing.go` next to the status write, mirroring `main.go:421` |

**Not a fix, but worth a follow-up:** `RequestTimer`'s `duration_ms` on a WebSocket upgrade measures the socket's lifetime, so a long-lived subscription can show a multi-hour `request` line that looks like a latency outlier. Either exclude the upgrade (`r.Header.Get("Upgrade") == "websocket"`) or document it in the Grafana panel that reads these lines.

## 6. Exact change list (for option D only; nothing was changed in this PR)

- `backend/pkg/middleware/timing.go` lines 13-28: skip the log for probe paths (or accept a path set). Add a test beside `timing_test.go` (`TestRequestTimer`) that a `/health` request logs nothing and a `/graphql` request still logs.
- Risk: one more branch on the hot path (negligible). Update `backend/CLAUDE.md` only if the probe rule becomes repo policy.

No code was changed by this PR. Option D needs a human decision on whether probe lines matter to the owner.

## What could not be verified

- **Production log shape on Sevalla.** Not inspected. In particular: whether Sevalla shows both lines per call as expected, whether `trace_id` appears in production (it depends on `OTEL_EXPORTER_OTLP_ENDPOINT` being set on the Sevalla app, which the observability runbook lists as a manual step), and whether Sevalla applies its own request logging on top of the app's (not checked; no Sevalla access used).
- **The WebSocket `request` line timing** (section 3) is inferred from the handler structure. It was not run.
- **The "rejected calls get no graphql line" rows** are from reading gqlgen v0.17.98's executor and the POST transport. Not run against the server.
- **Health probe volume in production** depends on the probe interval, which is configured in Sevalla and was not checked.
- **Whether the owner regards the duplicated pair as noise.** The code says it is intentional; the issue says "double logging". Whether that is a problem is a product decision.

## Sources (code, at `origin/main` 9a52c287)

- `backend/pkg/middleware/timing.go`, `backend/pkg/graphql/operation_metrics.go`, `backend/pkg/logger/logger.go`
- `backend/internal/server/api.go` (middleware order, `InstrumentGraphQL`, `OperationMetrics`)
- `backend/cmd/server/main.go` (`r.Use` at 331-333; probes at 347-366; otelhttp filter at 415-421)
- `backend/internal/adapters/web/middleware/ratelimit.go`, `contenttype.go`
- `backend/internal/adapters/auth/clerk_middleware.go`
- History: `aeb87df7` (07.4 baseline, `pkg/graphql/timing.go`), `20a07a83` (Phase 25, #463)
- gqlgen v0.17.98 `graphql/executor/executor.go`, `graphql/handler/transport/http_post.go`; chi v5.5.0 `mux.go`
