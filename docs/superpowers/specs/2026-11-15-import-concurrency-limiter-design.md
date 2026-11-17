# Import concurrency limiter and shared progress hub: design

Status: **PR 1 built; defaults measured and shipped (rows 4, listings 8)**, run and open decisions recorded in [the capacity register](../../../.docs/CAPACITY_REGISTER.md) (section 3, "Import capacity run, 2026-11-17") · 2026-11-15 · two PRs (limiter first, hub second)

## Intent and why

Imports (YouTube channels, TMDB filmographies) run in background goroutines. Today only part of that work is bounded, so a busy moment can slow every page or push the server over. The goal is a **measured, configurable cap** on import work, set at **half the measured maximum** by the method in [.docs/CAPACITY_TESTING.md](../../../.docs/CAPACITY_TESTING.md), built so the next bounded feature can reuse it. The half-of-max value is only the **initial default**: it can change later as the code default or as a per-environment value (an env var), and [the capacity register](../../../.docs/CAPACITY_REGISTER.md) records both.

## What was bounded before this change (verified in code at the time)

| Work | Bound then | Where |
| --- | --- | --- |
| Row import | 4 workers **per batch** (`importWorkers`); any number of batches at once | `import_service.go`, `importWorkers` and `runImports` |
| Source listing | **None**: one goroutine pair per source (≤10 per job, admin-approved) | `import_service.go`, `listSource` |
| TMDB film lookups | 4 per person listing (channel semaphore) | `adapters/tmdb/person_lister.go`, `PersonEnrichConcurrency` |
| Progress and subscriptions | One ticker per running job; 2 goroutines per subscriber | `import_progress.go`, `import_listing_progress.go`, the `ImportProgress` and `ImportListingProgress` subscription resolvers in `import.resolvers.go` |

Imports share the DB pool with user GraphQL requests. The pool is 25 in code (`DefaultPoolConfig`), `DB_MAX_OPEN_CONNS=10` in `.env.example`, and whatever the deployed environment sets. Each row import is one source API call plus a few statements, so it mostly waits on the network.

**The deployed process has CPU and memory limits that differ from this sandbox's, so nothing measured here is proven under them** (the figures and observed usage are kept out of git, see the register). I said earlier that CPU and memory probably wouldn't be the first limits. That may be wrong: a memory limit is a hard kill, and a CPU limit throttles everything on the box. The harness therefore has to measure them against that envelope.

## Goals

- One service-wide cap on concurrent row imports, and a separate one on concurrent source listings.
- Both caps are settings, **initially** defaulting to half of the measured max (changeable later as a default or per environment), with the measurement recorded in the register.
- A reusable limiter with built-in metrics, plus a repeatable load harness.
- PR 2: remove the duplicated tracker and resolver-forwarder code.

## Non-goals

- No change to import behaviour, statuses, the GraphQL schema or the database. **No migration.**
- No cross-instance limiting: the server assumes a single instance (the "Assumes one server instance" comment above the import background context in `main.go`), so in-process is enough.
- No new "queued" source status (it would need a `CHECK` constraint migration).
- No registry replacing `importOne`'s content-type switch (noted, deferred).

## Anti-goals (a failure even if it technically works)

- The limit makes imports so slow that the 30-minute batch timeout starts failing normal imports.
- A cap that is only a guess: shipped without its row updated in the capacity register.
- Write load (the import harness inserts rows) run against the shared Neon database, or any load run against real third-party APIs. The existing read-only k6 ramp against the shared database is unaffected.

## Constraints

- Hexagonal: `core/services` defines the interface it needs. The implementation lives in `pkg/`. `main.go` wires them. Core imports no OpenTelemetry.
- Backend rules: config via `internal/config` (`getEnvInt` pattern) and `.env.example`. Metric attributes must have fixed values (no request-derived attributes). The DB-backed perf harness sits behind `//go:build perf` and CI vets it; its pure logic (max-finder, half rule, table row) and the Neon guard are untagged, so `go test ./...` runs them.
- Query budget: the limiter issues no SQL, so no statement count changes.
- On shutdown (`bg` cancelled), waiters must unblock and unsent rows stay queued, where `RecoverInterrupted` already fails them at next start.

## Approaches considered

| | Change | Trade-off |
| --- | --- | --- |
| A | Limiter private to `ImportService` | Smallest diff; the next feature writes its own |
| **B** | Shared `pkg/limiter`, used by row import, listing and TMDB enrichment | Reusable; metrics double as the measurement hook |
| **C** | B plus a generic latest-wins progress hub and resolver forwarder | Removes ~100 duplicated lines; refactors tested code |

**Chosen: B, then C as a separate PR** (picked by the user). Mixing C into B would make a regression hard to attribute.

## PR 1: limiter, caps, harness

**`backend/pkg/limiter`** (pure Go plus the OTel meter, no new dependency):

```go
l := limiter.New("import_rows", capacity, limiter.WithMeter(meter))
release, err := l.Acquire(ctx) // blocks FIFO-ish; ctx cancel → err, no slot leaked
defer release()                // idempotent
l.Capacity(); l.Stats()        // Stats: InFlight, Waiting (for the harness)
```

- A buffered-channel semaphore with atomic counters. `capacity < 1` is treated as 1.
- Metrics: in-flight, waiting, and a wait-time histogram, attribute `limiter=<name>` (names fixed in code).

**Service side:** `ImportService` declares `type slotLimiter interface { Acquire(ctx) (release func(), err error) }` and takes `WithImportRowLimiter` / `WithImportListingLimiter`. Without the option it uses an unlimited no-op, so existing tests are unchanged.

- **Row import:** per-batch workers stay (a 5,000-row batch must not create 5,000 goroutines), but each worker acquires a **row slot around `importOne`** and releases it after the outcome write. Per-batch worker count becomes the row cap (stays 4 when no limiter is configured, as in existing tests). Per-row acquisition makes batches interleave, so a small batch isn't stuck behind a big one.
- **Listing:** `listSource` acquires a **listing slot for the whole source**. The 30-minute listing timeout starts **after** the slot is acquired, so waiting doesn't eat the budget.
- **TMDB enrichment:** `PersonLister` takes an optional limiter, defaulting to a private cap of 4 (unchanged behaviour). `main.go` passes one shared instance so the cap applies across listings, not per call. That number comes from TMDB's rate limit, not our hardware: record it as an external limit in the register.

**Settings:** `IMPORT_ROW_CONCURRENCY`, `IMPORT_LISTING_CONCURRENCY` (`internal/config`, `getEnvInt`: positive only, invalid → default; named in `.env.example`). At startup, log a **warning** if `row + listing` is at least half of `DB_MAX_OPEN_CONNS`. It never refuses to start, and it leaves at least half the pool for users.

**Harness** `backend/internal/perf/import_capacity_perf_test.go` (`perf` tag):
- Real `ImportService`, `ContentService` and GORM repositories on a **local throwaway Postgres**. A stub `YouTubeClient` and stub `ImportSourceLister` add latency whose mean is fixed and printed in the output; each call's latency is spread deterministically (uniform +/-50% from a hash of a stable key) so concurrent workers do not run in lockstep.
- **Resource envelope:** the deployed process has far less CPU and memory than the cloud sandbox, which also has no Docker daemon or cgroup v2 to enforce limits. So the harness records CPU-seconds and peak RSS **per item** and computes the bound (rate ≈ CPU limit ÷ CPU-seconds per item; peak memory ≈ idle + concurrency × RSS per in-flight item). It is compiled with `go test -c -tags perf` so the same binary can run in a container started with `--cpus <cpu> --memory <mem>` set to the deployed limits (the demo stack, on a machine with Docker). That confirming run is part of the work, and must happen once before a deployed default changes.
- **Refuses to run if the DSN host looks like Neon.**
- Ramps row concurrency, then listing concurrency, in doubling steps. A probe issues the `ListContent` GraphQL query (as the existing perf harness does) at a fixed rate throughout.
- Per step it prints a markdown row: items/s, per-item p50/p95, server CPU and RSS, whole-machine CPU (so Postgres is visible), goroutines, `sql.DB.Stats()` (`InUse`, `WaitCount`, `WaitDuration`), probe p95, errors.
- Implements the three checks, finds max, re-runs at `floor(max/2)`, prints both.
- Fails only on hard errors, never on a number.

**Defaults** were filled in from the harness run (initial values, changeable later as a code default or per environment) and recorded in the register with the environment (cores, RAM, Postgres version, stub latency): **rows 4, listings 8**. Rows is half of the measured max at the smallest pool measured (8 at a pool of 10). Listings is held to 8 by the pool-reserve rule at the code-default pool of 25 (half of its measured max would be higher); that rule is stricter than the measured connection use, and whether to relax it is an open decision recorded in the register. The CPU and memory bounds were worked out privately from the measured per-item costs and the deployed limits and do not bind below these defaults; the run was not made under the deployed process's limits, so re-measure on the target before overriding a deployed value.

## PR 2: progress hub and forwarder

- **`latestHub[K, V, S]`** in `core/services` (unexported). It owns the mutex, per-key state `V`, subscribers, dirty flag and the throttled ticker, with a `snapshot` and an `active` callback. Both trackers become thin wrappers: their `begin`/`record`/`end` and `begin`/`staged`/`finish` stay as small closures over the hub. `sendLatest` moves in.
- **`forward[In, Out]`** in `resolvers/helpers.go` (the "pull mapping down" rule), used by `ImportProgress` and `ImportListingProgress`.
- **Behavioural contract (existing tests must pass unchanged):** `begin` and `finish` publish at once; `record` and `staged` only mark dirty; the ticker publishes at most once per interval and stops when idle; `subscribe` sends the current snapshot first and the channel closes when `ctx` ends; a slow subscriber never blocks the publisher.

## Testing

- **Limiter** (`-race`): in-flight never exceeds capacity under many goroutines; ctx cancel while waiting returns an error and leaks no slot; double `release` is safe; gauges return to 0.
- **ImportService:** with cap 2 and three concurrent batches, a counting stub creator never sees more than 2 in flight; the same for listing; cancelling `bg` unblocks waiters and leaves rows queued; batches interleave.
- **Harness:** `go vet -tags perf ./internal/perf/...` in CI as today, the untagged max-finder and Neon-guard tests in `go test ./...`, and one real run recorded in the register.
- **PR 2:** existing tracker tests untouched, plus hub tests (first snapshot, latest-wins, ticker stops, ctx close, no goroutine leak).
- Self-verification per CLAUDE.md: `go build ./...`, `gofmt -l .`, `go test ./...` (DB tests run against the local DB so they PASS, not SKIP), then the frontend suite only if touched (it isn't).

## Risks

- **Defaults measured in the sandbox may not fit the deployed environment** (it has far less CPU and memory, and a remote DB). Mitigation: the per-item cost method above, a confirming run under real limits, settings that are env-overridable without a code deploy, and a re-measure on the target.
- **No `GOMEMLIMIT` is set in the repo**, so near the memory limit the kernel kills the process instead of the GC tightening. Setting one (about 80% of the limit) is a likely separate change, not part of this design. The harness will show whether import memory gets near the limit.
- **The 30-minute batch timeout now includes slot waits.** A 5,000-row admin batch at a low cap may not finish. Checked against the measured run: at 4 rows and 0.15 s per item the cap moves about 26 rows/s, so 1,800 s covers about 47,000 rows (9.4x the admin limit), and 2.9x at 0.5 s per item, so the timeout was not scaled. Concurrent batches share the cap, so several 5,000-row batches at a slow API can still run out of time (register, batch timeout row). On a timeout (as opposed to a shutdown), rows that never started still stay `queued` until the next restart's `RecoverInterrupted`, and `ImportItems` refuses to queue them again (`AlreadyQueued`) in the meantime (existing behaviour, not changed here). The global row cap makes a timeout likelier when several large batches run at a slow item latency. Fixing it is a follow-up recorded in FEATURE_BACKLOG.md ("Fail unsent import rows when a batch times out").
- A huge channel listing can hold a listing slot for minutes and delay other sources. Accepted: the cap is small by design.

## Decisions I made (marked as my calls)

- **Two caps, not one:** a listing holds its slot for minutes while a row holds it for one call, so sharing would let listings starve row imports.
- **The limiter lives in `pkg/limiter` and takes the OTel meter directly**, like `database.RegisterPoolMetrics`. This replaces my earlier "metrics hook" idea. Core still imports no OTel because it only sees the small interface.
- **Pool-reserve rule:** warn when `row + listing` is at least half the pool.
- Per-row (not per-batch) slot acquisition, for interleaving.

## Left to the builder

Exact metric names and bucket boundaries; stub latency value and probe rate; the hub's generic signature; whether `messaging.resolvers.go` has the same forwarder (adopt `forward` only if it is identical); how to migrate the local throwaway DB (the `migrate` binary, or loading the SQL files directly, never pointing at Neon).
