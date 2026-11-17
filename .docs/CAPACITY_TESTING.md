# Capacity Testing

How to pick a safe number for anything that bounds work: a worker count, a concurrency cap, a batch size, a queue depth, a pool size, a rate limit. Don't guess it. **Measure the maximum, ship half, record both.**

Not for statement counts per request (that is [QUERY_BUDGET.md](QUERY_BUDGET.md)). Use this when a feature can run *many things at once* and a wrong number means slow pages for everyone else, or a crashed/restarted server.

## The rule

1. **Make the number a setting**, not a constant (env var, validated `> 0`, invalid value falls back to the default).
2. **Measure max** with the ramp below.
3. **Ship half** (`floor(max / 2)`, at least 1) as the **initial default**.
4. **Re-run at the shipped value** and record what it costs.
5. **Update the feature's row in [CAPACITY_REGISTER.md](CAPACITY_REGISTER.md)** in the same PR.

## What "max" means

Ramp the setting in doubling steps (1, 2, 4, 8, 16, …) while a probe measures normal user traffic. **Max is the last step that still passes all three checks.** The step after it fails the first one that trips.

| # | Check | Fails when |
| --- | --- | --- |
| 1 | Throughput still grows | The step adds less than 10% items/s over the step before it |
| 2 | Everyone else is still fast | The probe's p95 is more than 2× its idle baseline, or the probe errors |
| 3 | Nothing breaks (hard stop) | Any error or timeout, DB pool waiting climbs (`WaitDuration`), the process is OOM-killed, restarts or panics |

The 10% and 2× figures are starting points, our call rather than law. Change them for a feature that needs it, and write the change in its register row.

## Ship at half, then confirm

At the shipped value, record the same metrics as at max. Look at **the resource that set max** (CPU, memory, DB connections in use, or API calls per second) and expect it clearly lower, roughly half and no more than about 60% of its at-max level.

If it is not clearly lower, the setting isn't what limits that resource. Find the real bottleneck before shipping. Work that mostly waits on a network call can leave CPU low even at max, so the limiting resource is often DB connections or an API quota rather than CPU or memory. Report all of them either way.

## Half is a starting point

The shipped value is the *initial* default. It can change later, in either of two places:

- **The code default**, when a new measurement, new hardware or observed usage says the starting point was wrong.
- **The value in one environment** (an env var such as `IMPORT_ROW_CONCURRENCY`), with no code deploy, for example to tune one deployed environment on its own.

The register keeps the code default and the measurements. Any value deployed in an environment is kept in the private notes (`CLAUDE.local.md`, git-ignored), not in git. When either changes, update the register row and add a change-log line saying why.

## What to record at each step

| Metric | How |
| --- | --- |
| Throughput (items/s) | Counter in the harness |
| Per-item latency, p50 / p95 | Harness |
| Process CPU % | Process CPU time over the step (`getrusage`, or `ps`) |
| Memory | `runtime.ReadMemStats` (heap) and process RSS |
| Goroutines | `runtime.NumGoroutine()` |
| DB pool | `sql.DB.Stats()`: `InUse`, `WaitCount`, `WaitDuration` |
| Probe p95 | A representative GraphQL read at a fixed low rate, running throughout |
| Errors | Count and first message |

## Procedure

1. **Baseline:** the probe alone, nothing else running.
2. **Fixed work per step:** the same number of items each time, long enough to pass warm-up (start with at least 30 s or 500 items). Discard the warm-up and take the median of 3 runs.
3. **Ramp** until a check fails, and run one step past it to confirm. Optionally bisect between the last pass and the first fail.
4. **Ship half**, re-run, compare to at-max (above).
5. **Record** it in the register.

## Where to run

| OK | Never |
| --- | --- |
| A throwaway Postgres on the machine running the test (cloud: `pg_ctlcluster`, see backend/CLAUDE.md → Testing; local: the demo stack). **Read-only** load against the shared database from a dedicated instance is existing practice (the k6 ramp, PR #384): keep it short | **Write load** (imports, mutations) against the shared Neon database: the import harness inserts content rows. The existing Go `perf` examples source `.env`, which points at Neon, so for anything that writes **set `DATABASE_URL` to the throwaway DB explicitly** |
| External APIs replaced by stubs with a fixed, realistic mean latency, each call's latency spread deterministically (uniform +/-50% from a hash of a stable key) so concurrent workers do not run in lockstep (write the mean and the spread down) | Real third-party APIs (quota, terms of use) |
| An idle machine, one load run at a time | A live environment people are using |

**The number is specific to the hardware it was measured on.** Record cores, RAM, Postgres version and the stub/DB round-trip latency.

**Match the target's resource envelope, not just its software.** The deployed process has hard CPU and memory limits and a remote database (see [CAPACITY_REGISTER.md](CAPACITY_REGISTER.md) section 1 for what to look up; the figures themselves are kept out of git). A dev machine or the cloud sandbox has far more of both, so a max measured there says little about the failures that matter: CPU throttling, and an out-of-memory kill, which is how a server "shuts down". In order of preference:

1. **Run the server under the same limits** (`docker run --cpus <cpu> --memory <mem>`, for example on the demo stack).
2. **If limits can't be enforced** (the cloud sandbox has no Docker daemon and no cgroup v2), record CPU-seconds and peak RSS **per unit of work**, then work out the bound: sustainable rate ≈ CPU limit ÷ CPU-seconds per item, and peak memory ≈ idle RSS + concurrency × RSS per in-flight item. Confirm it once under option 1 before changing a deployed default.

Record which envelope was used. Don't scale a measured max by a CPU ratio: throttling, GC and latency don't scale linearly. Re-run on the target before changing a deployed value.

## Harness conventions

- Lives in `backend/internal/perf/`. The DB-backed ramp is behind `//go:build perf`, so `go test ./...` skips it. The pure logic (the max-finder, the half-of-max rule, the table row) and the Neon guard (`refuseIfNeon`, which refuses to run write load against the shared database) are untagged on purpose, so `go test ./...` runs them. CI runs `go vet -tags perf ./internal/perf/...`, which keeps the tagged part compiling. Run the vet after changing anything it imports.
- Prints a markdown table of the metrics above, one row per step, so it can be pasted into the register.
- Fails only on hard errors (check 3), never on a number: results depend on the machine.
- **Worked example, the import harness:** `backend/internal/perf/import_capacity_perf_test.go` (`TestImportCapacityPerf`) ramps the global row and listing caps against a local throwaway Postgres with stubbed APIs and applies the three checks. Its header comment lists the knobs and the run command. To run it in a container started with `--cpus`/`--memory`, build it from `backend/` with `go test -c -tags perf -o import-capacity.test ./internal/perf/`. Its first recorded run is in the register, section 3.

## Existing harness: the k6 ramp

`backend/perf/k6/ramp.js` (with `analyze-ramp.mjs`, run as in `backend/perf/k6/README.md`) already finds the ceiling of an HTTP **read** path: it steps concurrent VUs and reports throughput and p95 per step. Use it for read paths and reuse its conventions. Two gaps to close when it feeds a capacity decision:

- It records no server CPU or memory. Run the server under the deployed process's limits and record them.
- It doesn't apply the three checks. Apply them to its per-step table; the worked example is in [CAPACITY_REGISTER.md](CAPACITY_REGISTER.md) section 3.

Its scripts are read-only on purpose, so a write path such as import needs the Go harness above. The ramp's results so far are in the register, section 3.

## Checklist for a feature with a bound

- [ ] The setting is configurable and validated, with a default.
- [ ] It is observable: in-flight and waiting counts as metrics with **fixed** names. Attributes that come from request input go through `telemetry.BoundedSet`.
- [ ] The initial default is half the measured max, and its register row says so.
- [ ] The register row is updated in the PR (code default, measured max, the envelope the test ran in, date). A value deployed in an environment goes in the private notes (`CLAUDE.local.md`, git-ignored), not in the row.

## Where results go

[CAPACITY_REGISTER.md](CAPACITY_REGISTER.md) holds every limit with its code default and what the repo's own tests show about capacity, plus the envelope those tests ran in and a change log. Any deployed value, and the deployed process's own limits, are kept in the private notes (`CLAUDE.local.md`, git-ignored).
