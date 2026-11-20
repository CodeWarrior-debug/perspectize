# Capacity Register

Current limits and settings next to what we know about the capacity behind them. Update the row in the same PR as any change to a limit. How to measure a limit: [CAPACITY_TESTING.md](CAPACITY_TESTING.md).

Last updated: **2026-11-17**. **Environment-specific figures are not kept in git:** the deployed process's CPU and memory limits, database compute and storage, which variables are overridden and to what, and observed traffic and usage live in private notes (`CLAUDE.local.md`, git-ignored). This register holds code defaults, results from the repo's own tests, and estimates.

**A measured-and-halved value is an initial default, not a fixed rule.** It can change later in two ways: the **code default** (new measurement, new hardware, new deployed limits) or the **value in one environment** (an env var, no code deploy). The register records the code default; a deployed value that differs belongs in the private notes. Change either, then update the row and add a line to the change log.

**Status words:** `measured` (a recorded run), `derived` (worked out from code or provider docs, not run), `provider` (an external service's limit, unverified here), `unmeasured` (nothing recorded yet), `unknown` (not checked).

## 1. Deployed environment

Not recorded here. Before measuring anything, copy these from the private notes (or read them from the hosting dashboards) so the test can match them:

| What to know | Why it matters |
| --- | --- |
| Process CPU and memory limits, and the instance count | CPU throttling and an out-of-memory kill are the failures a capacity test is for. The in-process import progress and limiter assume **one** instance (the "Assumes one server instance" comment above the import background context in `cmd/server/main.go`) |
| Whether a Go memory limit (`GOMEMLIMIT`) is set | Without one, the kernel kills the process near the memory limit instead of the GC tightening. The repo and Dockerfile set none |
| Database compute range, connection limit and storage limit | The pool can't usefully exceed the connection limit, and import staging rows count against storage |
| Values of the DB pool variables | They override the code defaults in section 4 |
| Recent CPU, memory and traffic | The idle baseline the load probe is compared against |

## 2. Observed use

Not recorded here (observed usage is kept in the private notes). Every limit below is untested under real load, not proven safe.

## 3. Stress tests so far

Two tests are recorded: the k6 read-path ramp (first subsection) and the import capacity run of 2026-11-17 (second subsection). Neither ran under the deployed process's CPU and memory limits.

### k6 read-path ramp (PR #384)

The k6 capacity ramp (`backend/perf/k6/ramp.js`, method in `backend/perf/k6/README.md`), merged in PR #384 on 2026-09-24. **It ran from a laptop against the shared database, not under the deployed process's CPU and memory limits, and it recorded latency and throughput only, not server CPU or memory.**

Setup: the `contentList` query (10 rows, newest first), no think time, a dedicated instance with the rate limit raised, the DB pool at the 25-connection code default, 15 seconds per step. Every step had 100% success and zero errors.

| Concurrent VUs | Throughput (req/s) | Avg | p95 | p99 | Max |
| --- | --- | --- | --- | --- | --- |
| 50 | 683.8 | 43.9 ms | 94.2 ms | 241.6 ms | 507.7 ms |
| 60 | 908.5 | 60.9 ms | 127.8 ms | 182.6 ms | 462.0 ms |
| 70 | 920.8 | 71.0 ms | 160.1 ms | 238.1 ms | 488.4 ms |
| 80 | 908.4 | 83.0 ms | 190.9 ms | 280.6 ms | 578.3 ms |
| 90 | 905.4 | 94.2 ms | 230.0 ms | 349.8 ms | 646.3 ms |
| 100 | 887.2 | 107.4 ms | 269.1 ms | 401.6 ms | 1,015.4 ms |

What the PR concluded:
- Throughput plateaus at about 900–920 req/s from 60 VUs. More VUs only add queueing delay (avg ≈ VUs × 1.07 ms, p95 ≈ VUs × 2.6 ms).
- The ceiling was the 25-connection pool. In an earlier, wider sweep `/debug/db-stats` showed `WaitCount` past 46,000 and cumulative wait past 4,200 s. Derived here: 920 ÷ 25 ≈ **37 req/s per pooled connection** on this read path.
- Its Little's Law estimate was about 2,500–4,500 concurrent real users, assuming one request per user every 3–5 s. That interval is an assumption, not a measurement.

Per-operation baseline from the same PR (2 VUs, localhost, 20 iterations each, p95): `contentList` 247.2 ms, `perspectivesList` 90.7 ms, `users` 75.6 ms, `wikidataSearch` 286.3 ms (an external lookup).

**This repo's definition applied to that table (a worked example, not a new measurement):**
- Check 1, throughput still grows by at least 10%: 50→60 VUs gains 32.9%, 60→70 gains 1.4%. It fails at 70, so **max is 60 VUs, about 910 req/s**.
- Check 2, probe p95 within 2× its baseline: p95 only reaches 269 ms against a limit of about 494 ms (2 × 247 ms), so it never trips in this range.
- Check 3, nothing breaks: no errors.
- Half of that is about 455 req/s sustained for this read path, **with this pool on this hardware**.

**What it can't tell us:** whether CPU or memory is hit first on the deployed process (a laptop has far more CPU, and server CPU and memory weren't recorded); what the deployed pool value is; and anything about import, because the k6 scripts are read-only by design (import has its own run, next subsection). The next step for the read path is the same ramp against a container started with the deployed CPU and memory limits (`docker run --cpus <cpu> --memory <mem>`), recording server CPU and memory.

### Import capacity run, 2026-11-17

First run of the import harness (`backend/internal/perf/import_capacity_perf_test.go`, method in [CAPACITY_TESTING.md](CAPACITY_TESTING.md)). **It ran on the 4-core development sandbox, not under the deployed process's CPU and memory limits**, so it shows where the database pool and the stubs saturate, not what the deployed process can carry. Two runs, one per pool size.

**Environment (both runs)**

- Machine: 4 cores, 15.7 GiB RAM, GOMAXPROCS 4, go1.27.2. Postgres 16.15 on the same machine (loopback: no TLS, no network round trip).
- Real `ImportService`, `ContentService` and GORM repositories. Only the YouTube client and the source lister are stubs: mean latency 150 ms per call, each call's latency spread deterministically, uniform +/-50% (a listing batch of 50 rows makes 2 calls). No third-party API was called.
- Probe: `ListContent` first=50 at 5 per second over 100 resident content rows. Idle baseline p95: 5.1 ms (run 1), 6.3 ms (run 2).
- Thresholds: throughput must grow at least 10% over the step before; probe p95 at most 2x the idle baseline and no probe errors; no request errors and zero DB pool waits (one wait fails the check).
- Per step: 500 rows (listing: 512 sources of 50 rows each, because the source count follows `PERF_MAX_CONC`), one warm-up run discarded, three measured runs, median reported.
- DB pool max open: **25** in run 1 (the code default), **10** in run 2 (`DB_MAX_OPEN_CONNS=10`, the value in `.env.example`). `PERF_MAX_CONC=512`. No CPU or memory limit was given to the harness. Idle RSS 35.8 MiB (run 1), 34.1 MiB (run 2). A run took about 35 minutes.
- Command, from `backend/`, with `DATABASE_URL` set to a local throwaway database (never Neon) and `DB_MAX_OPEN_CONNS=10` added for run 2:

```
DATABASE_URL=<local throwaway database> PERF_MAX_CONC=512 \
  go test -tags perf ./internal/perf/ -run TestImportCapacityPerf -v -count=1 -timeout 3h
```

**Summary**

| Ramp | Pool | Max | Half | First failing check (step) | Confirm step | Floor? |
| --- | --- | --- | --- | --- | --- | --- |
| Rows | 25 | 16 | 8 | errors: 2 pool waits, 0.3 ms in total (c=32) | confirmed: c=64, errors | no |
| Rows | 10 | 8 | 4 | errors: 13 pool waits, 6.0 ms in total (c=16) | confirmed: c=32, errors | no |
| Listings | 25 | 64 | 32 | probe (26.0 ms against a 10.2 ms limit) and errors (546 waits, 3.45 s in total) (c=128) | confirmed: c=256, probe and errors | no |
| Listings | 10 | 32 | 16 | errors: 54 pool waits, 107 ms in total (c=64); probe 11.6 ms was under its 12.6 ms limit | confirmed: c=128, probe and errors | no |

Every ramp failed within its range (nothing reached 512), so no max is a floor. The two runs do not find the same max.

**What it found**

- **Max follows the DB pool in all four ramps.** Rows: the first pool waits appear once the worker count exceeds the pool (32 workers over 25 connections, 16 over 10). They are tiny at the first failing step and consistent with the start-up burst the harness header describes (all workers begin their first lookups together). Listings: waits start one step later, as pool-in-use reaches the pool size (25 at c=128, 10 at c=64), and there they are real: 3.45 s of waiting and a probe p95 five times its baseline in run 1.
- **CPU, RSS and probe were far from any limit at the failing steps.** Whole-machine CPU (it includes Postgres, the harness and the probe) at the highest passing step: rows 7% (run 1, c=16) and 5% (run 2, c=8); listings 35% (run 1, c=64) and 22% (run 2, c=32). Throughput always grew by far more than 10% per step. Row RSS stayed between 39 and 43 MiB at every step (idle 34 to 36), so no per-item slope is resolvable; listing RSS was 44 to 57 MiB up to c=64 (both runs); at c=128 and c=256 run 1 reached 85 and 160 MiB, and run 2 reached 68 MiB at c=128. The rise comes with the pool saturating, when sources queue holding their batches.
- **Per-item costs measured** (process only, printed to 4 decimals): 0.0010 to 0.0018 CPU-seconds per row import across the row ramp (0.0012 at the highest passing step of run 1), and 0.0001 CPU-seconds per staged listing row.
- **A max is a pool-wait boundary, not a measure of what the process can carry.** The checks count any pool wait, so the row max is the largest power-of-two worker count that does not exceed the pool.

**Half versus max (CAPACITY_TESTING.md, "Ship at half")**: yes, half is clearly lower. Items/s (also the API call rate) is 51% to 53% of at-max in all four ramps, process CPU is 52% to 60% (rows run 2 sits at the 60% edge because CPU per item prints to 4 decimals and is a little higher at low concurrency), and pool waits are 0 at half in three of the four re-runs. The exception is the run 1 listing re-run at c=32 (50 waits, 130 ms in total, probe p95 7.9 ms against a 10.2 ms limit), which is the noisy boundary described under the open decisions below. The "pool in use" column is a whole-number peak sampled every 25 ms (3 against 2, 5 against 3), too coarse to read a ratio from. The resource that set max is the DB pool, not CPU, memory or API rate.

**Shipped values and what they cost in this run**

- **Rows: 4** = half of the max at the smallest measured pool (8 at a pool of 10). At c=4: run 1 ramp step 25.7 items/s, pool in use 2, 0 waits, probe p95 5.7 ms; run 2 re-run 26.3 items/s, process CPU 0.0014 s/item, peak RSS 42.1 MiB, pool in use 2, 0 waits, probe p95 6.2 ms. That is 52% of the pool-10 max step (50.8 items/s) and 25% of the pool-25 max step (101.3 items/s).
- **Listings: 8**, set by the pool-reserve rule, not by half of the max. `ImportPoolWarning` warns when 2 x (rows + listings) >= pool. At the code-default pool of 25 with 4 rows, 2 x (4 + 8) = 24 stays quiet and 9 would warn (26 >= 25); `TestImportDefaults_StayInsideTheCodeDefaultPoolReserve` pins this. Half of the measured max would be 16 (pool 10) or 32 (pool 25), so 8 is lower than both, and the CPU and memory bounds below also hold at 8. At c=8: run 1 ramp step 1,292.5 items/s, pool in use 2, 0 waits, probe p95 6.0 ms; run 2 ramp step 1,287.3 items/s, pool in use 3, 0 waits, probe p95 6.4 ms. That is 14% of the pool-25 max step's throughput (9,402.5 items/s, pool in use 9) and 26% of the pool-10 max step's (4,973.7 items/s, pool in use 5). Whole-machine CPU at c=8 is 8% in both runs.
- At the `.env.example` pool of 10, these defaults warn at startup (24 >= 10); the earlier placeholders (4 rows, 2 listings) already did (12 >= 10). Accepted.

**Envelope (hand calculation, not run under a limit).** The sandbox cannot enforce CPU or memory limits (no Docker daemon, no cgroup v2), so the harness measures process CPU-seconds and RSS per item and the bound is worked out from them: sustainable rate = CPU limit / CPU-seconds per item, and peak memory = idle RSS + cap x RSS per in-flight item. CPU and memory bounds for the deployed process were computed privately from these per-item costs and the deployed limits (kept out of git); they do not bind below the shipped defaults. **Not yet confirmed under the deployed process's limits (no Docker daemon in this sandbox): run the compiled binary under `--cpus`/`--memory` before changing a deployed value.** Stub items cost less CPU than real YouTube calls (TLS, larger JSON, a remote database), so any CPU bound from these per-item costs is an upper bound.

**Open decisions and gaps**

- (a) **The pool-reserve rule is the binding limit on listings, and it is stricter than measured use.** Sampled peak pool use at max was 0.14 to 0.25 connections per in-flight slot (run 1: rows 3 for 16 workers, listings 9 for 64; run 2: rows 2 for 8, listings 5 for 32), each held for an estimated 1 to 2 ms of a 150 to 300 ms item (an estimate inferred from the item latency and the sampled pool use; the harness does not print hold time). The rule assumes one connection per slot. Whether to relax it is the owner's decision and means changing the design spec's pool-reserve lines; nothing in code was changed. If it is relaxed, re-derive the listing default from the CPU bound as well (computed privately; see the private notes), not from the pool data alone.
- (b) **Rows and listings were never run together**, so their combined pool and CPU demand is unmeasured.
- (c) **The confirmation under real `--cpus`/`--memory` limits is owed** (see the envelope paragraph).
- (d) **The deployed pool size is not recorded here**, so the row default uses the smallest measured pool (10). A deployed environment with a larger pool can raise the row cap through `IMPORT_ROW_CONCURRENCY` (this run: half of the max is 8 at a pool of 25); record such a value in the private notes, and add a change-log line if the code default changes.
- (e) **Listing CPU per row prints to 4 decimals** (0.0001 means anywhere from 0.00005 to 0.00015, a factor of 3). Print more decimals in the harness before tightening any listing bound.
- (f) **Real API quota is not modelled.** At the stub's speed, 8 listings in flight means about 53 YouTube API calls per second. Quota, not concurrency, will govern real import volume; the caps are the safety bound.
- (g) **The pool-wait check is noisy near listing c=32 to 64.** In run 1 the c=32 half re-run had 50 waits where the same step in the ramp had none, and run 2 had no waits at c=32 but 54 at c=64. The maxes are bracketed by clear failures (c=128 and c=256; c=64 and c=128), but a repeat could place a listing max one step lower. The idle probe baseline also differed between the runs (5.1 and 6.3 ms), which moves the probe limit.

**Tables.** The harness output, unedited, for each run: the step table (concurrency = rows, or sources, in flight at once), then the at-max against at-half re-run table. Columns: items/s counts rows (listing: staged rows); item p50/p95 is the time inside the stubbed call, excluding the wait for a slot; CPU is this process only, net of the idle probe; goroutines and pool in use are peaks; probe p95 is over every probe sample of the measured runs.

*Run 1, pool 25: row import ramp*

| Concurrency | Items/s | Item p50 (ms) | Item p95 (ms) | CPU s/item | Peak RSS (MiB) | Goroutines | Pool in use | Pool wait delta | Probe p95 (ms) | Probe errors | Errors | First error |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 6.6 | 147.1 | 219.0 | 0.0012 | 42.0 | 12 | 1 | 0 | 5.6 | 0 | 0 |  |
| 2 | 12.8 | 155.1 | 220.3 | 0.0018 | 41.4 | 13 | 2 | 0 | 5.8 | 0 | 0 |  |
| 4 | 25.7 | 151.6 | 219.1 | 0.0015 | 41.1 | 15 | 2 | 0 | 5.7 | 0 | 0 |  |
| 8 | 52.3 | 151.6 | 219.8 | 0.0013 | 40.4 | 19 | 2 | 0 | 5.6 | 0 | 0 |  |
| 16 | 101.3 | 152.8 | 220.8 | 0.0012 | 40.9 | 26 | 3 | 0 | 5.6 | 0 | 0 |  |
| 32 | 200.2 | 149.5 | 220.2 | 0.0011 | 42.4 | 43 | 3 | 2 | 7.0 | 0 | 0 |  |
| 64 | 376.9 | 151.5 | 219.7 | 0.0010 | 42.5 | 75 | 10 | 73 | 6.0 | 0 | 0 |  |

```
Max: 16. The next step (32) failed: errors.
Confirmed: the next step also failed (errors).
Half (proposed default): 8.
```

At max (16, from the ramp), then at half (8, re-run):

| Concurrency | Items/s | Item p50 (ms) | Item p95 (ms) | CPU s/item | Peak RSS (MiB) | Goroutines | Pool in use | Pool wait delta | Probe p95 (ms) | Probe errors | Errors | First error |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 16 | 101.3 | 152.8 | 220.8 | 0.0012 | 40.9 | 26 | 3 | 0 | 5.6 | 0 | 0 |  |
| 8 | 51.3 | 154.4 | 221.2 | 0.0013 | 43.2 | 19 | 2 | 0 | 6.0 | 0 | 0 |  |

*Run 1, pool 25: listing ramp*

| Concurrency | Items/s | Item p50 (ms) | Item p95 (ms) | CPU s/item | Peak RSS (MiB) | Goroutines | Pool in use | Pool wait delta | Probe p95 (ms) | Probe errors | Errors | First error |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 164.5 | 298.1 | 401.3 | 0.0001 | 48.7 | 573 | 1 | 0 | 5.9 | 0 | 0 |  |
| 2 | 325.1 | 301.8 | 407.6 | 0.0001 | 44.5 | 574 | 2 | 0 | 6.0 | 0 | 0 |  |
| 4 | 650.7 | 300.4 | 404.2 | 0.0001 | 44.0 | 576 | 2 | 0 | 5.9 | 0 | 0 |  |
| 8 | 1292.5 | 301.3 | 404.0 | 0.0001 | 44.8 | 580 | 2 | 0 | 6.0 | 0 | 0 |  |
| 16 | 2548.6 | 303.6 | 403.2 | 0.0001 | 45.5 | 587 | 3 | 0 | 6.1 | 0 | 0 |  |
| 32 | 4961.3 | 301.2 | 409.5 | 0.0001 | 47.9 | 604 | 5 | 0 | 8.6 | 0 | 0 |  |
| 64 | 9402.5 | 301.2 | 403.3 | 0.0001 | 54.7 | 638 | 9 | 0 | 8.1 | 0 | 0 |  |
| 128 | 16612.2 | 297.1 | 406.4 | 0.0001 | 84.6 | 699 | 25 | 546 | 26.0 | 0 | 0 |  |
| 256 | 21319.3 | 312.1 | 412.5 | 0.0000 | 160.4 | 848 | 25 | 3672 | 119.8 | 0 | 0 |  |

```
Max: 64. The next step (128) failed: probe, errors.
Confirmed: the next step also failed (probe, errors).
Half (proposed default): 32.
```

At max (64, from the ramp), then at half (32, re-run):

| Concurrency | Items/s | Item p50 (ms) | Item p95 (ms) | CPU s/item | Peak RSS (MiB) | Goroutines | Pool in use | Pool wait delta | Probe p95 (ms) | Probe errors | Errors | First error |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 64 | 9402.5 | 301.2 | 403.3 | 0.0001 | 54.7 | 638 | 9 | 0 | 8.1 | 0 | 0 |  |
| 32 | 4995.1 | 300.7 | 403.2 | 0.0001 | 55.2 | 603 | 4 | 50 | 7.9 | 0 | 0 |  |

*Run 2, pool 10: row import ramp*

| Concurrency | Items/s | Item p50 (ms) | Item p95 (ms) | CPU s/item | Peak RSS (MiB) | Goroutines | Pool in use | Pool wait delta | Probe p95 (ms) | Probe errors | Errors | First error |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 6.5 | 152.0 | 218.7 | 0.0013 | 40.7 | 12 | 1 | 0 | 6.4 | 0 | 0 |  |
| 2 | 13.1 | 152.0 | 220.0 | 0.0013 | 40.0 | 13 | 1 | 0 | 5.8 | 0 | 0 |  |
| 4 | 25.9 | 152.3 | 220.0 | 0.0013 | 39.5 | 15 | 2 | 0 | 5.6 | 0 | 0 |  |
| 8 | 50.8 | 156.4 | 220.3 | 0.0012 | 39.1 | 19 | 2 | 0 | 5.0 | 0 | 0 |  |
| 16 | 102.4 | 149.6 | 218.2 | 0.0011 | 40.1 | 27 | 3 | 13 | 5.1 | 0 | 0 |  |
| 32 | 197.9 | 155.9 | 218.8 | 0.0010 | 41.8 | 43 | 3 | 64 | 6.4 | 0 | 0 |  |

```
Max: 8. The next step (16) failed: errors.
Confirmed: the next step also failed (errors).
Half (proposed default): 4.
```

At max (8, from the ramp), then at half (4, re-run):

| Concurrency | Items/s | Item p50 (ms) | Item p95 (ms) | CPU s/item | Peak RSS (MiB) | Goroutines | Pool in use | Pool wait delta | Probe p95 (ms) | Probe errors | Errors | First error |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 8 | 50.8 | 156.4 | 220.3 | 0.0012 | 39.1 | 19 | 2 | 0 | 5.0 | 0 | 0 |  |
| 4 | 26.3 | 149.8 | 219.8 | 0.0014 | 42.1 | 15 | 2 | 0 | 6.2 | 0 | 0 |  |

*Run 2, pool 10: listing ramp*

| Concurrency | Items/s | Item p50 (ms) | Item p95 (ms) | CPU s/item | Peak RSS (MiB) | Goroutines | Pool in use | Pool wait delta | Probe p95 (ms) | Probe errors | Errors | First error |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 160.3 | 303.6 | 409.9 | 0.0001 | 46.1 | 572 | 1 | 0 | 5.7 | 0 | 0 |  |
| 2 | 320.4 | 305.7 | 411.0 | 0.0001 | 44.1 | 573 | 2 | 0 | 5.8 | 0 | 0 |  |
| 4 | 642.7 | 300.6 | 405.5 | 0.0001 | 44.2 | 574 | 2 | 0 | 6.8 | 0 | 0 |  |
| 8 | 1287.3 | 300.9 | 409.7 | 0.0001 | 44.0 | 580 | 3 | 0 | 6.4 | 0 | 0 |  |
| 16 | 2570.7 | 297.1 | 399.9 | 0.0001 | 45.5 | 586 | 3 | 0 | 6.6 | 0 | 0 |  |
| 32 | 4973.7 | 301.4 | 405.9 | 0.0001 | 47.6 | 604 | 5 | 0 | 6.8 | 0 | 0 |  |
| 64 | 9457.0 | 298.9 | 407.2 | 0.0001 | 56.7 | 637 | 10 | 54 | 11.6 | 0 | 0 |  |
| 128 | 16691.0 | 299.5 | 409.9 | 0.0001 | 67.9 | 698 | 10 | 994 | 23.4 | 0 | 0 |  |

```
Max: 32. The next step (64) failed: errors.
Confirmed: the next step also failed (probe, errors).
Half (proposed default): 16.
```

At max (32, from the ramp), then at half (16, re-run):

| Concurrency | Items/s | Item p50 (ms) | Item p95 (ms) | CPU s/item | Peak RSS (MiB) | Goroutines | Pool in use | Pool wait delta | Probe p95 (ms) | Probe errors | Errors | First error |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 32 | 4973.7 | 301.4 | 405.9 | 0.0001 | 47.6 | 604 | 5 | 0 | 6.8 | 0 | 0 |  |
| 16 | 2563.6 | 298.3 | 403.9 | 0.0001 | 49.0 | 588 | 3 | 0 | 6.6 | 0 | 0 |  |

## 4. Settings register

"Default" is what the code ships. A deployed environment may override it with an env var; record any such override in the private notes, not here.

### Database

| Setting | Where | Default | Capacity estimate | Status |
| --- | --- | --- | --- | --- |
| Pool max open connections | `DB_MAX_OPEN_CONNS`, `pkg/database/postgres.go` | 25 (`.env.example` shows 10) | At most this many statements in flight; imports share it with user requests. **Measured on a laptop against the shared database at pool 25: `contentList` plateaus at about 900–920 req/s, roughly 37 req/s per connection (section 3).** The import run (section 3) used pools of 25 and 10: the largest import concurrency that avoided pool waits tracked the pool size. Not measured at the deployed pool value or CPU limit | `measured` (other hardware) |
| Pool idle, lifetime, idle time | `DB_MAX_IDLE_CONNS`, `DB_CONN_MAX_LIFETIME`, `DB_CONN_MAX_IDLE_TIME` | 15, 30 min, 10 min | n/a | `derived` |

### HTTP and GraphQL

| Setting | Where | Default | Capacity estimate | Status |
| --- | --- | --- | --- | --- |
| Server read / write / idle timeout | `ReadTimeout`, `WriteTimeout`, `IdleTimeout` on the `http.Server` in `cmd/server/main.go` | 15 s / 15 s / 60 s (subscriptions are exempt from the write timeout) | A non-subscription request over 15 s is cut | `derived` |
| Rate limit | `RATE_LIMIT_PER_MIN`, `internal/config/security.go` | 100 per minute per client IP (per the k6 README) | n/a | `derived` |
| Query complexity limit | `internal/server/api.go:144` | 500 | n/a | `derived` |
| WebSocket keep-alive ping | `internal/server/api.go:93` | 10 s | n/a | `derived` |
| Realtime per-subscriber buffer | `internal/adapters/realtime/hub.go:22` | 64 events | Concurrent subscribers the deployed process can hold: none recorded | `unmeasured` |

### Import

| Setting | Where | Default | Capacity estimate | Status |
| --- | --- | --- | --- | --- |
| Global row-import cap | `IMPORT_ROW_CONCURRENCY`, `internal/config/import_limits.go`; limiter `import_rows` | 4, shared by every batch. Per-batch workers = min(cap, rows in the batch), so a 5,000-row batch starts 4 goroutines, not 5,000 | Max 8 at a pool of 10, 16 at a pool of 25: the DB pool sets it, not CPU, memory or API rate (section 3, run of 2026-11-17). Default = half of the max at the smallest pool measured. Any deployed override: private notes | `measured` (other hardware) |
| Global source-listing cap | `IMPORT_LISTING_CONCURRENCY`, `internal/config/import_limits.go`; limiter `import_listings` | 8, shared by every import (a source takes a slot for its whole listing; its timeout starts once it has one) | Max 32 at a pool of 10, 64 at a pool of 25. **8 is set by the pool-reserve rule, not by half of the max** (half would be 16 or 32): at the code-default pool of 25 with 4 rows, 2 x (4 + 8) = 24 stays below it. The rule is stricter than measured use; relaxing it is an open decision (section 3, open decisions (a)). Any deployed override: private notes | `measured` (other hardware) |
| Rows per import request | `domain/import_job.go:90,94` | 1,000 (admin 5,000) | n/a | `derived` |
| Sources per job | `domain/import_job.go:86` | 10 | n/a | `derived` |
| Batch and listing timeouts | `importTimeout`, `listingTimeout`, `import_service.go` | 30 min each. The batch timeout includes the wait for row slots | **Checked against the shipped row cap, so the 30-minute limit is unchanged.** At 4 rows and the stub's 0.15 s per item, 26 rows/s x 1,800 s is about 47,000 rows against the admin limit of 5,000 (9.4x). At 0.5 s per item: 8 rows/s, 14,400 rows (2.9x). It stops covering 5,000 rows above 1.44 s per item. **Concurrent batches share the global cap**, so three 5,000-row batches at 0.5 s per item (8 rows/s in all) get about 4,800 rows each and would run out of time. **On a batch timeout, rows that never started are failed** ("The import was cut short. Select it again to retry.", one `UPDATE` scoped to that batch's job and rows by `FailQueuedItems`), so the user can queue them again at once; the batch's own rows that did run keep their outcomes. A shutdown differs: unsent rows stay `queued` for the next restart's `RecoverInterrupted` | `derived` |
| Progress publish interval | `import_progress.go:11` | 500 ms | n/a | `derived` |
| Finished jobs kept in the progress trackers | `defaultMaxIdleEntries`, `core/services/latest_hub.go` | 256 per tracker (import progress and listing progress each keep their own). A job still running or being watched is never counted or evicted | Bounds the memory held for finished jobs, which otherwise grows with every job until a restart. Beyond the cap the oldest finished job reads as one this process never ran (an empty count), as after a restart; the database stays the source of truth. Not sized by measurement | `derived` |

### External APIs and caches

| Setting | Where | Default | Capacity estimate | Status |
| --- | --- | --- | --- | --- |
| TMDB film lookups across person listings | `PersonEnrichConcurrency` (`tmdb/person_lister.go`), shared `tmdb_enrich` limiter wired in `cmd/server/main.go` | One limiter of `PersonEnrichConcurrency` slots shared by every person listing (a lister without the shared limiter caps each listing on its own) | TMDB allows about 50 requests per second (per a code comment, not re-checked). The cap now applies across listings, not per listing. It comes from TMDB's limit, not our hardware, so it was not ramped | `provider` |
| TMDB, Open Library, Wikidata HTTP timeout | `adapters/*/client.go` | 10 s | n/a | `derived` |
| YouTube metadata cache | `DefaultYouTubeCacheTTLSeconds`, `internal/config/config.go:67` | 6 h | The API has a daily quota (units not checked); caching cuts calls | `provider` |
| YouTube / TMDB / Open Library trending cache | config, `tmdb/cache.go:15` | 1 h | n/a | `derived` |
| User / category / todo-action cache | `adapters/repositories/cached/` | 60 s / 5 min / 10 min | n/a | `derived` |

## 5. Not covered yet

Frontend limits (TanStack `staleTime`, grid block size), dataloader batch sizes, YouTube quota units, and any stress test under the deployed process's limits (the import run in section 3 was not). Also not covered: row import and listing running at the same time, import under real API latency and quota, and a listing CPU cost per row measured to more than 4 decimals.

## Change log

| Date | Change |
| --- | --- |
| 2026-11-15 | Register created from the code. |
| 2026-11-16 | Recorded the k6 ramp results from PR #384 (laptop, shared database, pool 25). Environment-specific figures moved out of git into private notes. Nothing is measured yet under the deployed limits or for import. |
| 2026-11-17 | Import caps added. Initial defaults **4 rows and 8 listings** (`IMPORT_ROW_CONCURRENCY`, `IMPORT_LISTING_CONCURRENCY`) from the import capacity run in section 3: rows are half of the measured max at the smallest pool measured (8 at a pool of 10); listings are held to 8 by the pool-reserve rule at the code-default pool, below half of the measured max. The TMDB lookup cap is now shared across listings. Not yet confirmed under the deployed process's limits. |
| 2026-11-19 | Import and listing progress trackers keep at most 256 finished jobs each in memory (`defaultMaxIdleEntries`); running and watched jobs are never evicted. |
