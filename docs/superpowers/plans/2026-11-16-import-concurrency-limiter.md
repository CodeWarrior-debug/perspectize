# Import Concurrency Limiter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a measured, configurable global cap on import row work and source listing, with half the measured max as the initial default, then remove the duplicated progress-tracker code in a second PR.

**Architecture:** A reusable `backend/pkg/limiter` (channel semaphore plus OTel metrics) satisfies a small `slotLimiter` interface that `core/services` defines. `ImportService` takes one limiter for rows and one for listings, and `main.go` wires them from two env settings. A `perf`-tagged harness on a throwaway local Postgres finds the max and fills in the defaults. PR 2 replaces the two near-identical trackers with one generic `latestHub` and the two resolver forwarders with one generic `forward`.

**Tech Stack:** Go (hexagonal, gqlgen, GORM + pgx), OpenTelemetry metrics (`go.opentelemetry.io/otel/metric`), testify, local Postgres for the harness.

**Spec:** `docs/superpowers/specs/2026-11-15-import-concurrency-limiter-design.md` (read it first). Method: `.docs/CAPACITY_TESTING.md`. Results go in `.docs/CAPACITY_REGISTER.md`.

## Global Constraints

- Hexagonal: `core/services` defines the interface it needs; the implementation lives in `pkg/`; `main.go` wires them. Core imports no OpenTelemetry.
- Config via `internal/config` (`getEnvInt` pattern: positive integers only, invalid or empty falls back to the default) and named in `backend/.env.example` (values blank on purpose).
- Metric attributes have fixed values (limiter names are constants in code, never request-derived).
- No migration, no GraphQL schema change, no new "queued" source status, no cross-instance limiting (single server instance, see the "Assumes one server instance" comment above the import background context in `cmd/server/main.go`).
- The limiter issues no SQL, so no statement count changes.
- On shutdown (`bg` cancelled) waiters unblock and unsent rows stay queued; `RecoverInterrupted` already fails them at the next start.
- The DB-backed harness sits behind `//go:build perf`; CI vets it with `go vet -tags perf ./internal/perf/...`. The pure checks file and the Neon guard are untagged, so `go test ./...` runs them. It fails only on hard errors, never on a number.
- Write load (the harness inserts rows) never touches the shared Neon database, and no load runs against real third-party APIs.
- **No deployed-environment figures** (CPU or memory limits, DB compute, observed traffic, which variables are overridden) and no statement about which environment is "dev" in any committed file. Say "the deployed environment" and point to the private notes.
- Repo rules: each shell command is its own Bash call (never `&&`); never run `make migrate-up/down`; commit messages are Conventional Commits; commands below run from `backend/` unless noted.
- Half of the measured max is the **initial default**, changeable later as a code default or per environment; the register records the code default and the measurement.

## Review Focus

Behaviours the spec implies but does not spell out (each is pinned by a test named `RFn` in the owning task):

1. **RF1, shutdown while waiting:** rows or a source waiting for a slot when `bg` is cancelled stop without leaking a slot; unsent rows stay queued; a waiting source ends `failed` ("the server stopped"), never stuck `listing`.
2. **RF2, absurd cap:** `IMPORT_ROW_CONCURRENCY=100000` must not start 100,000 goroutines per batch (workers are bounded by batch size).
3. **RF3, timeout clock:** the 30-minute listing timeout starts after the slot is acquired, so queueing doesn't eat it.
4. **RF4, batch timeout while queued:** a batch whose context expires while its rows wait for slots returns, leaks nothing, and leaves unsent rows queued.
5. **RF5, Neon variants:** the harness refuses every Neon DSN form (URL, `postgresql://`, pooler host, key=value).

## File Structure

| File | Responsibility |
| --- | --- |
| `backend/pkg/limiter/limiter.go` (+ `_test.go`) | `Limiter`: `New`, `Acquire`, `Capacity`, `Stats`, `WithMeter` |
| `backend/internal/core/services/import_service.go` | `slotLimiter`, options, per-row and per-source slots |
| `backend/internal/adapters/tmdb/person_lister.go` | optional shared enrichment limiter |
| `backend/internal/config/import_limits.go` | `ImportLimits`, `LoadImportLimits`, `ImportPoolWarning` |
| `backend/cmd/server/main.go`, `backend/.env.example` | wiring and documentation of the two settings |
| `backend/internal/perf/import_capacity_checks_perf_test.go` | pure harness logic: max finder, Neon guard, table row |
| `backend/internal/perf/import_capacity_perf_test.go` | the DB-backed ramp |
| `backend/test/services/import_limiter_test.go` | service-level limiter tests (external package, like `import_service_test.go`) |
| PR 2: `core/services/latest_hub.go`, `import_progress.go`, `import_listing_progress.go`, `adapters/graphql/resolvers/helpers.go`, `import.resolvers.go` | generic hub and forwarder |

---

# PR 1: limiter, caps, harness

### Task 1: `pkg/limiter`

**Files:**
- Create: `backend/pkg/limiter/limiter.go`, `backend/pkg/limiter/limiter_test.go`

**Interfaces:**
- Produces:
  ```go
  type Option func(*Limiter)
  type Stats struct{ InFlight, Waiting int }
  func New(name string, capacity int, opts ...Option) *Limiter // capacity < 1 is treated as 1
  func WithMeter(m metric.Meter) Option
  func (l *Limiter) Acquire(ctx context.Context) (release func(), err error)
  func (l *Limiter) Capacity() int
  func (l *Limiter) Stats() Stats
  ```

- [ ] **Step 1: Write failing tests** in `limiter_test.go` (run with `-race`):
  - `TestAcquire_NeverExceedsCapacity`: capacity 3, 50 goroutines each hold the slot ~2 ms; peak `Stats().InFlight` observed by a counter inside the critical section is ≤ 3 and all 50 complete.
  - `TestAcquire_CancelledContextFailsEvenWhenSlotFree`: already-cancelled ctx returns an error with a free slot, and `InFlight` stays 0 (select picks randomly among ready cases, so check `ctx.Err()` first).
  - `TestAcquire_CancelWhileWaitingLeaksNoSlot`: fill capacity 1, a waiter's ctx is cancelled, it returns `context.Canceled`; after the holder releases, a fresh `Acquire` succeeds immediately; `Waiting` returns to 0.
  - `TestRelease_IsIdempotent`: calling `release()` twice frees one slot, not two (a third goroutine still blocks at capacity 1).
  - `TestAcquire_BlockedWaitersAreServedInOrder`: capacity 1, waiters queued one by one are served in arrival order.
  - `TestNew_NonPositiveCapacityIsOne`: `New("x", 0).Capacity() == 1`, and `-5` too.
  - `TestMetrics_ReportInFlightWaitingAndWait` (using `sdkmetric.NewManualReader`, as `pkg/database/metrics_test.go` does): with the meter set, collected data has in-flight and waiting gauges carrying only the attribute `limiter=<name>` and a wait-time histogram with one sample per `Acquire`; after everything releases, both gauges read 0. `New` with no meter must not panic or require OTel.
- [ ] **Step 2: Run to verify failure:** `go test -race ./pkg/limiter/ -count=1`. Expected: FAIL, package has no non-test files.
- [ ] **Step 3: Implement** `limiter.go`: a buffered `chan struct{}` semaphore plus atomic counters; `Acquire` does a `ctx.Err()` check, then a blocking send in a `select` with `ctx.Done()` (blocked senders queue FIFO). `release` is a `sync.Once`. Instruments are created in `WithMeter` (observable gauges for in-flight and waiting, a float64 histogram in seconds for wait time); names are fixed strings of your choice, attribute `limiter` only. If instrument creation errors, `slog.Warn` and carry on without metrics (a limiter must never fail to build over telemetry).
- [ ] **Step 4: Run to verify pass:** same command. Expected: PASS, no race reports.
- [ ] **Step 5: Commit:** `feat(limiter): add reusable concurrency limiter with metrics`

### Task 2: Row slots in `ImportService`

**Files:**
- Modify: `backend/internal/core/services/import_service.go` (the `importWorkers` const, the `workers` field, `NewImportService`, `runImports`)
- Create: `backend/test/services/import_limiter_test.go`; internal test `backend/internal/core/services/import_workers_test.go`
- Modify (test helper): `newImportService` in `backend/test/services/import_service_test.go` gains `opts ...services.ImportServiceOption` appended to its existing options.

**Interfaces:**
- Consumes: `*limiter.Limiter` from Task 1 (the service sees only the interface).
- Produces:
  ```go
  type slotLimiter interface {
      Acquire(ctx context.Context) (release func(), err error)
      Capacity() int
  }
  func WithImportRowLimiter(l slotLimiter) ImportServiceOption
  func workersFor(capacity, rows int) int // min(capacity, rows); 0 when rows == 0
  ```
  `Capacity()` is on the interface because the per-batch worker count follows it (a deliberate addition to the spec's one-method sketch). The default limiter is an unlimited no-op whose `Capacity()` is `importWorkers` (4), so no-option behaviour and every existing test are unchanged.

- [ ] **Step 1: Write failing tests.** Concurrent batches need a spawn that runs each `f` in its own goroutine under a `WaitGroup` (add a `goSpawn(wg)` helper beside `inline`); the fake creator gains an in-flight counter and an optional gate.
  - `TestImportService_RowLimiter_CapsRowsAcrossBatches`: cap 2, three concurrent batches of 4 rows: peak in-flight creator calls ≤ 2 and all 12 rows get outcomes.
  - `TestImportService_RowLimiter_InterleavesBatches`: cap 1, batch A of 6 rows then batch B of 1: B's row completes before A's last row.
  - `TestImportService_NoLimiter_KeepsFourWorkersPerBatch`: no option, 8 rows, each creator call waits until 4 callers are present (2 s timeout): reaches exactly 4 and never 5.
  - **RF1** `TestImportService_RowLimiter_ShutdownLeavesWaitingRowsQueued`: cap 1; batch A's row holds the slot (gated creator); batch B waits; cancel the `bg` context passed via `WithImportBackground`; B's `runImports` returns within 2 s, the creator never saw B's rows, and `RecordOutcome` was never called for them. Release the gate afterwards.
  - **RF4** `TestImportService_RowLimiter_BatchTimeoutWhileQueued`: same setup but expire the batch context (use a limiter stub whose `Acquire` returns `context.DeadlineExceeded` after the batch ctx is done) and assert return plus no outcome for unsent rows.
  - **RF2** (internal package) `TestWorkersFor`: `(1000, 3) == 3`, `(4, 100) == 4`, `(4, 0) == 0`, `(1, 5) == 1`.
- [ ] **Step 2: Run to verify failure:** `go test ./test/services/ ./internal/core/services/ -run 'RowLimiter|NoLimiter|WorkersFor' -count=1`. Expected: FAIL (undefined `WithImportRowLimiter`, `workersFor`).
- [ ] **Step 3: Implement.** Add the interface, option and `workersFor`. In `NewImportService`, after options run, set `s.workers = s.rows.Capacity()`. In `runImports`, start `workersFor(s.workers, len(items))` workers; each worker, per row: `Acquire(ctx)` (on error stop; the row stays queued), `importOne`, `release()`, **then** send the outcome (never hold a slot while blocked on `outcomes`). Remove nothing else; the feeder and collector stay as they are.
- [ ] **Step 4: Run to verify pass:** same command plus `go test ./test/services/ -count=1` (existing import tests unchanged). Expected: PASS.
- [ ] **Step 5: Commit:** `feat(import): cap concurrent row imports with a shared limiter`

### Task 3: Listing slots in `ImportService`

**Files:**
- Modify: `backend/internal/core/services/import_service.go` (`listSource`)
- Test: `backend/test/services/import_limiter_test.go`

**Interfaces:**
- Consumes: `slotLimiter` from Task 2.
- Produces: `func WithImportListingLimiter(l slotLimiter) ImportServiceOption` (default: unlimited no-op).

- [ ] **Step 1: Write failing tests** (concurrent spawn from Task 2; a gated `fakeLister` counting in-flight `List` calls):
  - `TestImportService_ListingLimiter_CapsConcurrentListings`: cap 1, a job with 3 sources: peak concurrent `List` calls is 1, all 3 sources end `ready`.
  - **RF3** `TestImportService_ListingLimiter_TimeoutStartsAfterSlot`: cap 1; hold the slot ~300 ms before the second source can start; that source's `List` ctx has `time.Until(deadline) > 30*time.Minute - 150*time.Millisecond`.
  - **RF1** `TestImportService_ListingLimiter_ShutdownFailsWaitingSource`: the waiting source's status becomes `failed` with a detail containing "server stopped" after `bg` is cancelled, and `List` was never called for it.
  - `TestImportService_ListingLimiter_SheetShowsListingWhileWaiting`: while waiting, the listing tracker already reports the source as listing (no new status is introduced).
- [ ] **Step 2: Run to verify failure:** `go test ./test/services/ -run ListingLimiter -count=1`. Expected: FAIL (undefined option).
- [ ] **Step 3: Implement.** In `listSource`: call `s.listing.begin` first, then `Acquire(s.bg)`; on error fall into the existing final-write path with that error so the source is written `failed` ("the server stopped"); on success `defer release()` and only then create `context.WithTimeout(s.bg, listingTimeout)`. Keep the rest of the pipeline untouched.
- [ ] **Step 4: Run to verify pass:** same command, then `go test ./test/services/ -count=1`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(import): cap concurrent source listings with a shared limiter`

### Task 4: Shared TMDB enrichment limiter

**Files:**
- Modify: `backend/internal/adapters/tmdb/person_lister.go` (the `personEnrichWorkers` const, `NewPersonLister`, `enrich`)
- Test: `backend/internal/adapters/tmdb/person_lister_test.go` (the existing `httptest` setup)

**Interfaces:**
- Produces:
  ```go
  const PersonEnrichConcurrency = 4 // renamed from personEnrichWorkers; TMDB's rate limit, not our hardware
  type EnrichLimiter interface{ Acquire(ctx context.Context) (release func(), err error) }
  type PersonListerOption func(*PersonLister)
  func WithEnrichLimiter(l EnrichLimiter) PersonListerOption
  func NewPersonLister(c *Client, opts ...PersonListerOption) *PersonLister // existing callers unchanged
  ```

- [ ] **Step 1: Write failing tests:** `TestPersonLister_SharedEnrichLimiter_CapsAcrossListings` (cap 1 limiter shared by two listers' concurrent `List` calls; the fake TMDB server's peak concurrent `/movie/{id}` requests is 1) and `TestPersonLister_EnrichLimiterCancelledLeavesExtrasEmpty` (a limiter whose `Acquire` errors: the batch still returns every film, extras empty, no error). Keep the existing tests as the "no limiter, per-call cap of 4" regression.
- [ ] **Step 2: Run to verify failure:** `go test ./internal/adapters/tmdb/ -run 'EnrichLimiter' -count=1`. Expected: FAIL.
- [ ] **Step 3: Implement.** In `enrich`, replace the local `sem` with the injected limiter; when none was injected, build a **call-local** `limiter.New("tmdb_enrich_local", PersonEnrichConcurrency)` per `enrich` call (exactly the old per-call behaviour; not a per-lister one). A failed `Acquire` returns from that film's goroutine, leaving its extras empty. Update the one comment that cites the old name.
- [ ] **Step 4: Run to verify pass:** `go test ./internal/adapters/tmdb/ -count=1`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(tmdb): allow one enrichment limiter shared across person listings`

### Task 5: Settings, pool warning, wiring

**Files:**
- Create: `backend/internal/config/import_limits.go`, `backend/test/config/import_limits_test.go`
- Modify: `backend/cmd/server/main.go` (where the TMDB lister is built, and the import wiring after `importCtx, stopImports := context.WithCancel(...)`), `backend/.env.example`

**Interfaces:**
- Produces:
  ```go
  const DefaultImportRowConcurrency = 4     // PLACEHOLDER until Task 8 replaces it with floor(max/2)
  const DefaultImportListingConcurrency = 2 // PLACEHOLDER until Task 8
  type ImportLimits struct{ RowConcurrency, ListingConcurrency int }
  func LoadImportLimits() ImportLimits // IMPORT_ROW_CONCURRENCY, IMPORT_LISTING_CONCURRENCY via getEnvInt
  func ImportPoolWarning(l ImportLimits, poolMax int) (msg string, warn bool) // warn when 2*(row+listing) >= poolMax
  ```

- [ ] **Step 1: Write failing tests** (clear env with `t.Setenv`, as `clearConfigEnvVars` in `test/config/config_test.go` does): defaults when unset; override; `"0"`, `"-3"`, `"abc"`, `""` fall back to the default; `ImportPoolWarning` table: (row 4, listing 2, pool 10) warns, (4, 2, 25) does not, (4, 2, 12) warns (boundary: exactly half), and the message names all three numbers.
- [ ] **Step 2: Run to verify failure:** `go test ./test/config/ -run ImportLimits -count=1`. Expected: FAIL.
- [ ] **Step 3: Implement** the config file (reuse `getEnvInt` from `security.go`). In `main.go`: build `limiter.New("import_rows", …)` and `limiter.New("import_listings", …)` with `limiter.WithMeter(telemetry.Meter())`, pass them as `WithImportRowLimiter` / `WithImportListingLimiter`, and build one shared `limiter.New("tmdb_enrich", tmdb.PersonEnrichConcurrency, WithMeter(...))` before `tmdb.NewPersonLister(tmdbClient, tmdb.WithEnrichLimiter(...))`. Log `slog.Info("import concurrency", "rows", …, "listings", …)` and `slog.Warn` the `ImportPoolWarning` message using `poolCfg.MaxOpenConns` (`poolCfg := database.PoolConfigFromEnv()` in `main.go`); never refuse to start. Add both variables, with their default and a one-line explanation, to `.env.example` after the pool block.
- [ ] **Step 4: Run to verify pass:** `go test ./test/config/ -count=1`, then `go build ./...` (main.go has no unit test; a clean build is the check).
- [ ] **Step 5: Commit:** `feat(import): configure import concurrency caps and warn on pool pressure`

### Task 6: Harness, pure logic

**Files:**
- Create: `backend/internal/perf/import_capacity_checks_perf_test.go` (no build tag, so `go test ./...` runs the max-finder and the Neon guard)

**Interfaces:**
- Produces (same package, test-only):
  ```go
  type stepResult struct {
      Concurrency int; ItemsPerSec float64; ItemP50, ItemP95 time.Duration
      CPUSecPerItem float64; PeakRSSBytes uint64; Goroutines int
      PoolInUse int; PoolWaitDelta int64; ProbeP95 time.Duration; ProbeErrors, Errors int; FirstError string
  }
  func findMax(steps []stepResult, probeBaseline time.Duration) (maxConcurrency int, failedChecks []string)
  func halfOf(max int) int            // max(1, max/2)
  func refuseIfNeon(dsn string) error
  func (s stepResult) markdownRow() string
  ```
  `findMax` implements `.docs/CAPACITY_TESTING.md`: step passes when (1) its items/s is at least 1.10× the previous step's (not applied to the first step), (2) `ProbeP95 <= 2*probeBaseline` and `ProbeErrors == 0`, (3) `Errors == 0` and `PoolWaitDelta == 0`. Max is the last step before the first failing one; `failedChecks` lists every check that tripped at that step.

- [ ] **Step 1: Write failing tests** (`go test -tags perf ./internal/perf/ -run 'TestFindMax|TestHalfOf|TestRefuseIfNeon|TestMarkdownRow'`): `findMax` table: throughput gains 5% at the third step → max is the second step's concurrency, reason mentions throughput; probe p95 at 3× baseline → max is the previous step; an error at the fourth step; all steps pass → max is the last and `failedChecks` is empty (caller prints "extend the ramp"); first step fails → max 0; two checks trip at once → both listed. `halfOf`: 1→1, 2→1, 9→4, 16→8, 0→1. **RF5** `refuseIfNeon` returns an error for `postgres://u:p@ep-cool-123.us-east-1.aws.neon.tech/db`, the same with `-pooler` in the host, `postgresql://…neon.tech…`, `host=ep-x.us-east-2.aws.neon.tech user=u dbname=d`, and an upper-case host; returns nil for `postgres://u:p@localhost:5432/db`, `127.0.0.1`, and `host=/var/run/postgresql dbname=d`.
- [ ] **Step 2: Run to verify failure:** same command. Expected: FAIL (undefined identifiers).
- [ ] **Step 3: Implement** the four functions in that file; `markdownRow` prints one pipe-delimited row matching the header the Task 7 runner prints.
- [ ] **Step 4: Run to verify pass:** same command, then `go vet -tags perf ./internal/perf/...`. Expected: PASS and silent vet.
- [ ] **Step 5: Commit:** `test(perf): add import capacity max-finder and Neon guard`

### Task 7: Harness, DB-backed ramp

**Files:**
- Create: `backend/internal/perf/import_capacity_perf_test.go` (`//go:build perf`)

**Interfaces:**
- Consumes: `findMax`, `halfOf`, `refuseIfNeon`, `stepResult` (Task 6); `limiter.New`; the real `ImportService`, `ContentService` and GORM repositories (wire them as `dataloader_perf_test.go` does); `ports/services.YouTubeClient` and `ImportSourceLister` for the stubs.
- Produces: `TestImportCapacityPerf` (skips without `DATABASE_URL`; calls `refuseIfNeon` before any write).

- [ ] **Step 1: Write the runner** with these decisions fixed: stubs sleep a latency whose mean is fixed (`PERF_STUB_LATENCY`, default 150 ms, printed in the header) and whose per-call value is spread deterministically (uniform +/-50% from a hash of a stable key) so concurrent workers do not run in lockstep; items are staged through the real listing path then imported through `ImportItems`; per step the row cap is the ramp value (1, 2, 4, … up to `PERF_MAX_CONC`, default 64) and each step imports `PERF_ITEMS_PER_STEP` rows (default 500, minimum for the procedure), 3 runs, warm-up discarded, median reported; a `ListContent` probe (same query as `dataloader_perf_test.go`) runs throughout at `PERF_PROBE_RATE` (default 5 per second) after a 10 s idle baseline. Per step record: items/s, per-item p50/p95, process CPU-seconds per item (`syscall.Getrusage` delta), peak RSS (`/proc/self/status`, sampled), whole-machine CPU (`/proc/stat`), goroutines, `sql.DB.Stats()` deltas, probe p95, errors. After the row ramp run the listing ramp the same way (sources listed concurrently, stub emits fixed-size batches with latency). Then re-run at `halfOf(max)` and print both. Print the header (cores, RAM, Postgres `SHOW server_version`, Go version, stub latency, `GOMAXPROCS`), the markdown table, the found max and half, and the envelope lines (`sustainable items/s ≈ CPU limit ÷ CPU-seconds per item`, `peak memory ≈ idle RSS + cap × RSS per in-flight item`) using `PERF_CPU_LIMIT` and `PERF_MEM_LIMIT_MB` when given, else the bare formula. `t.Fatal` only on hard errors.
- [ ] **Step 2: Vet:** `go vet -tags perf ./internal/perf/...`. Expected: silent.
- [ ] **Step 3: Smoke run on a local throwaway database** (see Task 8 step 1 for setup; `DATABASE_URL` must point at it): `PERF_ITEMS_PER_STEP=40 PERF_MAX_CONC=4 PERF_STUB_LATENCY=20ms go test -tags perf ./internal/perf/ -run TestImportCapacityPerf -v -count=1`. Expected: PASS, a table with steps 1, 2, 4, a max, and a half. Then run with `DATABASE_URL` set to a Neon-looking string and confirm it refuses before writing.
- [ ] **Step 4: Compile for a container:** `go test -c -tags perf -o /tmp/import-capacity.test ./internal/perf/` succeeds (so the same binary can run under `docker run --cpus <cpu> --memory <mem>` elsewhere).
- [ ] **Step 5: Commit:** `test(perf): add import capacity ramp harness`

### Task 8: Measure, set defaults, record

**Files:**
- Modify: `backend/internal/config/import_limits.go`, `backend/.env.example`, `.docs/CAPACITY_REGISTER.md`, `.docs/CAPACITY_TESTING.md` (one line pointing at this harness and the `go test -c` command), `docs/superpowers/specs/2026-11-15-import-concurrency-limiter-design.md` (status line)

- [ ] **Step 1: Prepare the local throwaway DB:** `pg_ctlcluster 16 main start`, create a database `perf_import`, apply the repo migrations to it with the `migrate` binary against that **local** DSN only, as `backend/CLAUDE.md` → Testing describes (never `make migrate-up`; check the host in the DSN before each call). Seed the admin user the harness needs.
- [ ] **Step 2: Run the full ramp** with defaults (command from Task 7 step 3 without the smoke overrides). Expected: a max and a half for rows and for listings, with the three checks reported.
- [ ] **Step 3: Check the half against the max:** the resource that set max (CPU, DB connections in use, or API call rate) is clearly lower at half, roughly half and at most about 60% of its at-max level. If not, find the real bottleneck before shipping a default (CAPACITY_TESTING.md → Ship at half).
- [ ] **Step 4: Check the timeout anti-goal:** at the shipped row default, `rows/s × 1800 s` must cover `MaxAdminImportItemsPerRequest` (5,000, i.e. at least 2.8 rows/s with margin). If it does not, make the batch timeout scale with batch size in `runImports`, with a test, and say so in the register row.
- [ ] **Step 5: Replace the placeholders** in `import_limits.go` with the measured halves (remove the `PLACEHOLDER` comments), and put the same numbers in the `.env.example` comments.
- [ ] **Step 6: Update the register** (no deployed figures): rewrite the Import rows (global caps, defaults, per-batch workers = min(cap, rows)), the TMDB row (one shared limiter across listings, `provider`), the batch-timeout row, section 5, and add the run as a dated subsection with its environment (cores, RAM, Postgres version, Go version, stub latency, probe rate, thresholds used), the table, the max and half, the computed envelope bound, and "not yet confirmed under the deployed process's limits (no Docker daemon in this sandbox); run the compiled binary under `--cpus`/`--memory` before changing a deployed value". Add a change-log line.
- [ ] **Step 7: Verify:** `go test ./test/config/ -count=1` and grep `PLACEHOLDER` across `backend/` (must find nothing).
- [ ] **Step 8: Commit:** `feat(import): ship measured initial caps and record the capacity run`

> **Outcome (2026-11-17):** shipped rows 4 and listings 8, not `floor(max/2)` for both. Rows are half of the max at the smallest pool measured (8 at a pool of 10). Listings are held to 8 by the pool-reserve rule at the code-default pool (2 x (4 + 8) = 24 < 25), below half of the measured max. The `PLACEHOLDER` values (4, 2) earlier in this plan are superseded; the run, the open decisions and the owed confirmation under real CPU and memory limits are in `.docs/CAPACITY_REGISTER.md` section 3.

### Task 9: Verify, review, open PR 1

- [ ] **Step 1: Ask the owner how the already-pushed commits `7b3f298`, `528be8b`, `4e9054d`, `7babb40` are to be handled** (rewrite and force-push, a new clean branch, or leave). **Do not open the PR before they answer**: a PR publishes the branch's commit list. Do not force-push without an explicit go-ahead.
- [ ] **Step 2: Self-verification (report the output summary):** `go build ./...`; `gofmt -l .` (empty); `go vet -tags perf ./internal/perf/...`; `go test -race ./pkg/limiter/ -count=1`; with `DATABASE_URL` pointing at the local `testdb`, `go test -p 1 ./...` and confirm with `-v` that DB tests PASS rather than SKIP. Frontend untouched, so no frontend run.
- [ ] **Step 3: Stale references:** grep the repo for `personEnrichWorkers`, `importWorkers` comments that say "per batch", and the old register wording.
- [ ] **Step 4: Run the `code-reviewer` agent** on `git diff origin/main...HEAD`; fix findings.
- [ ] **Step 5: Open PR 1** (cloud session: open it yourself, per CLAUDE.md) using the repo's PR template for its type via `mcp__github__create_pull_request`. The body states: no migration; `graphify update` skipped (CLI not installed); the Docker confirming run is still owed; the pool-warning behaviour; session learnings. No `needs-demo-video` (nothing user-visible). Then run `/revise-claude-md`.

---

# PR 2: progress hub and forwarder

Start after PR 1 merges, on a fresh branch from `origin/main` (needs the owner's go-ahead to push a second branch; follow `.docs/PR_WORKFLOW.md` → Stacked PRs if PR 1 is still open). **Existing tracker tests (`import_progress_test.go`, `import_listing_progress_test.go`) must pass without edits.**

### Task 10: `latestHub`

**Files:**
- Create: `backend/internal/core/services/latest_hub.go`, `backend/internal/core/services/latest_hub_test.go` (internal package, like the tracker tests)

**Interfaces:**
- Produces (sketch; adjust the generics if the two trackers need it, the contract below is fixed):
  ```go
  type publishMode int // keep, markDirty, publishNow
  type latestHub[K comparable, V any, S any] struct{ /* mu, interval, now, per-key {state V, dirty, ticking, subs} */ }
  func newLatestHub[K comparable, V any, S any](interval time.Duration, now func() time.Time,
      newState func(K) *V, snapshot func(K, *V, time.Time) S, active func(*V) bool) *latestHub[K, V, S]
  func (h *latestHub[K, V, S]) update(key K, fn func(*V) publishMode)
  func (h *latestHub[K, V, S]) subscribe(ctx context.Context, key K) <-chan S
  func sendLatest[T any](ch chan T, s T) // moved from import_progress.go
  ```
- Contract: `publishNow` publishes at once; `markDirty` waits for the ticker; one ticker per key, started once, publishing at most once per interval and stopping when `active` is false; `subscribe` sends the current snapshot first and closes the channel when `ctx` ends; a slow subscriber never blocks the publisher.

- [ ] **Step 1: Write failing tests:** `TestHub_SubscribeSendsCurrentSnapshotFirst`; `TestHub_LatestWinsForSlowSubscriber` (three publishes, one unread channel slot: only the last is received); `TestHub_MarkDirtyWaitsForTick` (interval 50 ms: nothing within 10 ms, delivered within 500 ms); `TestHub_PublishNowIsImmediate`; `TestHub_TickerStopsWhenInactive` (test-only accessor for the ticking flag); `TestHub_ContextEndClosesChannelAndRemovesSubscriber`; `TestHub_NoGoroutineLeakAfterManySubscribers` (`runtime.NumGoroutine` back to baseline via `require.Eventually`); `TestHub_SlowSubscriberNeverBlocksPublisher` (1,000 publishes, no reader, completes quickly).
- [ ] **Step 2: Run to verify failure:** `go test ./internal/core/services/ -run TestHub -count=1 -race`. Expected: FAIL.
- [ ] **Step 3: Implement** the hub from the contract; keep `sendLatest`'s drain-then-send under the hub lock.
- [ ] **Step 4: Run to verify pass:** same command. Expected: PASS.
- [ ] **Step 5: Commit:** `refactor(import): add a generic latest-wins progress hub`

### Task 11: Import progress tracker on the hub

**Files:**
- Modify: `backend/internal/core/services/import_progress.go`

**Interfaces:** `importProgressTracker.begin/record/end/subscribe` and `newImportProgressTracker(interval, now)` keep their signatures.

- [ ] **Step 1: Baseline:** `go test ./internal/core/services/ ./test/services/ -count=1 -race`. Expected: PASS.
- [ ] **Step 2: Rewrite** the tracker as a thin wrapper: `begin` and the last `end` return `publishNow`, `record` returns `markDirty`, `end` with batches remaining returns `keep`; `active` is `batches > 0`; delete the local `tick`, `publishLocked`, `sendLatest` and subscriber bookkeeping.
- [ ] **Step 3: Re-run** the step 1 command with **no test edits** (`git diff --stat -- '*_test.go'` shows none). Expected: PASS.
- [ ] **Step 4: Commit:** `refactor(import): build the import progress tracker on the hub`

### Task 12: Listing tracker on the hub

**Files:**
- Modify: `backend/internal/core/services/import_listing_progress.go`

**Interfaces:** `listingTracker.begin/staged/finish/subscribe` and `newListingTracker(interval, now)` keep their signatures.

- [ ] **Step 1: Baseline:** `go test ./internal/core/services/ ./test/services/ -count=1 -race`. Expected: PASS.
- [ ] **Step 2: Rewrite** as a thin wrapper: `begin` and `finish` return `publishNow`, `staged` returns `markDirty`; `active` is the existing `listingLocked`; `snapshot` is the existing `jobListing.snapshot`.
- [ ] **Step 3: Re-run** with no test edits. Expected: PASS.
- [ ] **Step 4: Commit:** `refactor(import): build the listing tracker on the hub`

### Task 13: `forward` resolver helper

**Files:**
- Modify: `backend/internal/adapters/graphql/resolvers/helpers.go`, `backend/internal/adapters/graphql/resolvers/import.resolvers.go` (the `ImportProgress` and `ImportListingProgress` subscription resolvers)
- Test: next to the resolvers' existing tests (find them with a Grep for `helpers` tests; follow the nearest convention)

**Interfaces:**
- Produces: `func forward[In, Out any](ctx context.Context, in <-chan In, mapFn func(In) Out) <-chan Out` (buffer 1; closes the output when `in` closes or `ctx` ends; never blocks forever on a gone reader).

- [ ] **Step 1: Write failing tests:** `TestForward_MapsEveryValue`; `TestForward_ClosesWhenInputCloses`; `TestForward_StopsWhenContextEndsEvenIfReaderGone` (no goroutine left, via `require.Eventually` on `runtime.NumGoroutine`).
- [ ] **Step 2: Run to verify failure:** `go test ./internal/adapters/graphql/resolvers/... -run TestForward -count=1`. Expected: FAIL.
- [ ] **Step 3: Implement** `forward`, and use it in `ImportProgress` and `ImportListingProgress` (`forward(ctx, in, importProgressToModel)` and the listing equivalent). Read `messaging.resolvers.go` `ThreadEvents` and `InboxEvents`; adopt `forward` there only if the loop is identical (they also call an `unsub`, so expect to leave them).
- [ ] **Step 4: Run to verify pass:** the Task 13 command plus `go build ./...`. Expected: PASS.
- [ ] **Step 5: Commit:** `refactor(graphql): share one subscription forwarder`

### Task 14: Verify and open PR 2

- [ ] **Step 1:** Run the Task 9 self-verification list. Add `git diff --stat origin/main...HEAD -- backend/internal/core/services/import_progress.go backend/internal/core/services/import_listing_progress.go backend/internal/adapters/graphql/resolvers/import.resolvers.go` and report the net line change (the spec expects about 100 duplicated lines gone; say plainly if it is fewer).
- [ ] **Step 2:** Run the `code-reviewer` agent on the diff; fix findings; open PR 2 with the repo's template (no migration, no schema change, existing tracker tests untouched); run `/revise-claude-md`.
