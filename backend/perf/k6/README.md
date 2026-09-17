# Backend performance tests (k6)

Load tests for the Go GraphQL API, isolated per route/operation so a single
slow resolver doesn't get hidden in an aggregate number. Every scenario runs
a fixed, guaranteed iteration count (`ITERATIONS`, default 20, floor 10) via
k6's `shared-iterations` executor, rather than a time-boxed ramp — so every
run reports a known, comparable sample size instead of "however many
requests happened to fit in the time window."

## Install

```bash
brew install k6
```

## Running

Point at a local server (`go run ./cmd/server` from `backend/`, default
`:8080`) or a deployed environment via `-e BASE_URL=...`.

```bash
# health check only, no auth needed
k6 run perf/k6/health.js

# GraphQL operations — set AUTH_TOKEN for authenticated queries/mutations
AUTH_TOKEN=<clerk-session-jwt> k6 run perf/k6/graphql.js

# target a single operation instead of the full suite
AUTH_TOKEN=<jwt> k6 run perf/k6/graphql.js --env OPERATION=contentList

# more/fewer iterations per operation (floor of 10 enforced)
k6 run perf/k6/graphql.js --env ITERATIONS=50

# operations needing a real record id are skipped (with a console warning)
# unless you provide one:
CONTENT_ID=123 PERSPECTIVE_ID=45 USERNAME=someuser k6 run perf/k6/graphql.js

# against deployed dev/staging
k6 run perf/k6/health.js -e BASE_URL=https://<sevalla-backend-host>
```

## HTML report

Each script writes a JSON summary; convert it to an HTML report with
`report.mjs` (a small dependency-free script, no npm install needed):

```bash
k6 run perf/k6/graphql.js --out json=perf/k6/results/graphql-run.json
node perf/k6/report.mjs perf/k6/results/graphql-run.json perf/k6/results/graphql-report.html
```

Open `perf/k6/results/graphql-report.html` in a browser.

## Rate limiting

The API has a global per-IP rate limiter (`RATE_LIMIT_PER_MIN`, default
100/min — see `internal/adapters/web/middleware/ratelimit.go`). k6 runs from
a single machine/IP, so scenarios with more than a couple VUs will trip it
and show up as `http_req_failed` rather than genuine slowness. Either raise
`RATE_LIMIT_PER_MIN` in the environment under test, or keep VU counts modest
(the shipped scripts default to 10 VUs, which already exceeds 100/min at a
0.5s sleep and will show limiter rejections — lower `stages` targets if you
want a clean throughput number instead of a rate-limit stress test).

## Adding a new operation

Add an entry to `OPERATIONS` in `graphql.js` with the query string and
variables. Each operation gets its own k6 `group()` and its own
`shared-iterations` scenario, so its timing and iteration count show up
isolated in the summary and report — it doesn't get averaged in with every
other route.

## Testing mutations

Every mutation in the schema requires `@auth` and writes real rows to the
shared Sevalla dev database (`backend/CLAUDE.md` — there is no local Docker
Postgres). This scaffold deliberately only load-tests queries, not
mutations, to avoid polluting shared state on repeated runs. If you need to
load-test a mutation, do it against a disposable database/environment, and
prefer one that's cheap to clean up (e.g. `markOnboardingSeen` over
`createUser`/`deletePerspective`) — never point mutation load tests at the
shared dev DB.

## Files

- `health.js` — smoke-tests `/health`, no auth, useful for confirming an
  environment before running heavier scripts against it.
- `graphql.js` — per-operation load test against `/graphql`. Each operation
  runs as its own scenario so p95/p99 latency is reported isolated per route.
- `report.mjs` — converts a k6 JSON summary export into a single HTML report.
- `results/` — gitignored output directory for JSON/HTML reports.
