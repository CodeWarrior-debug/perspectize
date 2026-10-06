# Neon Performance Tuning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Execution status (updated 2026-10-06)

**Not started.** The migration this plan depends on cut over on 2026-10-06 (see the migration
plan's "Execution status"). **The `sevalla-baseline` benchmark was not captured before
cutover.** The Sevalla database is still running as a rollback copy and holds the same data,
so a baseline can still be taken against it, but only until it is decommissioned (planned
about a week after cutover). Capture it first or drop the before/after comparison.
Neon runs the **direct** connection (not the pooler) because of `LISTEN`/`NOTIFY`, so any
pooling-related tuning here must be re-derived for that setup.

**Goal:** Establish a Sevalla-baseline-vs-tuned-Neon before/after benchmark for Perspectize's
hot queries, and land pooling/indexing/extension tuning changes using Neon's branching feature
so tuning happens with zero production load and a documented rollback point.

**Architecture:** A shared bench script runs the same set of `EXPLAIN ANALYZE` queries against
any DSN and appends timestamped, labeled results to a results file. Baseline numbers are
captured against Sevalla before migration; post-migration, a Neon branch is created per tuning
iteration, changes are applied to the branch, the branch is benchmarked against its untouched
parent, and only validated changes get promoted to the Neon production branch.

**Tech Stack:** PostgreSQL (`EXPLAIN ANALYZE`, `pg_stat_statements`), `golang-migrate`, bash,
Neon CLI (`neonctl`).

**Spec:** `docs/superpowers/specs/2026-09-03-neon-postgres-migration-design.md`

## Global Constraints

- Baseline is captured against the **live Sevalla instance** before the migration plan's
  cutover runs — this task's Task 1 must execute before
  `docs/superpowers/plans/2026-09-03-neon-postgres-migration-plan.md`'s Task 6 decommission
  step, ideally during that plan's own pre-flight phase.
- Tuning iterations happen on Neon branches (copy-on-write, zero prod load), never directly
  against the Neon production branch.
- Do not port Sevalla-era spinning-disk assumptions (`random_page_cost`,
  `effective_io_concurrency` overrides) forward — Neon's compute-size-driven tuning is
  authoritative; any deviation must be justified by this plan's own empirical before/after
  numbers, not assumed.
- This workstream is infra-level (pooling, indexes-for-Neon, extensions, storage assumptions)
  and is distinct from `.planning/v1.1-ROADMAP.md`'s **Phase 11: Database Optimization**
  (JSONB trimming, column promotion — schema-level). Phase 11's index work (11-04-PLAN.md)
  should reuse this plan's bench script rather than re-deriving a benchmarking method.
- This plan does not execute the tuning cycle against real production data — it produces the
  tooling, the enabling migration, and the runbook. Execution happens in a separate future
  session.

---

### Task 1: Hot-query benchmark script

**Files:**
- Create: `backend/scripts/bench-hot-queries.sh`
- Create: `backend/scripts/hot-queries.sql`
- Test: `backend/scripts/bench-hot-queries.test.sh`

**Interfaces:**
- Consumes: `<dsn> <label>` positional args; reads query definitions from
  `backend/scripts/hot-queries.sql`; shells out to `psql`.
- Produces: appends one line per query to `backend/scripts/bench-results.csv` (columns:
  `timestamp,label,query_name,planning_time_ms,execution_time_ms`) — this file is the shared
  format Task 3's branch-comparison script parses to produce a diff.

- [ ] **Step 1: Define the hot queries to benchmark**

Create `backend/scripts/hot-queries.sql` — one named query per block, matching the Activity
table's actual list/sort/filter access pattern (cursor pagination on `updated_at`, the default
sort):

```sql
-- name: activity_list_default_sort
SELECT id, title, updated_at FROM content
ORDER BY updated_at DESC
LIMIT 25;

-- name: activity_list_next_page
SELECT id, title, updated_at FROM content
WHERE updated_at < NOW()
ORDER BY updated_at DESC
LIMIT 25;

-- name: activity_text_search
SELECT id, title, updated_at FROM content
WHERE title ILIKE '%test%'
ORDER BY updated_at DESC
LIMIT 25;

-- name: perspectives_for_content
SELECT id, quality_rating, agreement_rating FROM perspectives
WHERE content_id = (SELECT id FROM content ORDER BY updated_at DESC LIMIT 1);
```

- [ ] **Step 2: Write the failing test (stubbed `psql`)**

Create `backend/scripts/bench-hot-queries.test.sh`:

```bash
#!/usr/bin/env bash
# Tests bench-hot-queries.sh against a stubbed `psql`. Run:
# bash backend/scripts/bench-hot-queries.test.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STUB_DIR="$(mktemp -d)"
trap 'rm -rf "$STUB_DIR"' EXIT

cat > "$STUB_DIR/psql" <<'EOF'
#!/usr/bin/env bash
# Simulate EXPLAIN (ANALYZE, FORMAT JSON) output with fixed timings.
echo '[{"Planning Time": 0.123, "Execution Time": 4.567}]'
EOF
chmod +x "$STUB_DIR/psql"

results_file="$STUB_DIR/bench-results.csv"
PATH="$STUB_DIR:$PATH" BENCH_RESULTS_FILE="$results_file" \
  "$SCRIPT_DIR/bench-hot-queries.sh" "postgres://test-dsn" "sevalla-baseline"

if [[ ! -f "$results_file" ]]; then
  echo "FAIL: results file was not created"
  exit 1
fi

if ! grep -q "sevalla-baseline,activity_list_default_sort,0.123,4.567" "$results_file"; then
  echo "FAIL: expected row not found in results file"
  cat "$results_file"
  exit 1
fi

line_count="$(wc -l < "$results_file")"
if [[ "$line_count" -ne 4 ]]; then
  echo "FAIL: expected 4 result rows (one per query in hot-queries.sql), got $line_count"
  cat "$results_file"
  exit 1
fi

echo "PASS: bench-hot-queries.sh records one CSV row per query"
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bash backend/scripts/bench-hot-queries.test.sh`
Expected: FAIL with `bench-hot-queries.sh: No such file or directory`

- [ ] **Step 4: Write minimal implementation**

Create `backend/scripts/bench-hot-queries.sh`:

```bash
#!/usr/bin/env bash
# Runs every named query in hot-queries.sql against a DSN via
# EXPLAIN (ANALYZE, FORMAT JSON), and appends planning/execution time to a
# shared results CSV so before/after numbers accumulate across runs.
#
# Usage: bench-hot-queries.sh <dsn> <label>
# Env: BENCH_RESULTS_FILE (default: backend/scripts/bench-results.csv)
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <dsn> <label>" >&2
  exit 2
fi

dsn="$1"
label="$2"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
queries_file="$script_dir/hot-queries.sql"
results_file="${BENCH_RESULTS_FILE:-$script_dir/bench-results.csv}"

if [[ ! -f "$results_file" ]]; then
  echo "timestamp,label,query_name,planning_time_ms,execution_time_ms" > "$results_file"
fi

timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
current_name=""
current_sql=""

run_query() {
  local name="$1" sql="$2"
  [[ -z "$sql" ]] && return
  local explain_json
  explain_json="$(psql -X -A -t -c "EXPLAIN (ANALYZE, FORMAT JSON) $sql" "$dsn")"
  local planning execution
  planning="$(echo "$explain_json" | grep -oE '"Planning Time": [0-9.]+' | grep -oE '[0-9.]+')"
  execution="$(echo "$explain_json" | grep -oE '"Execution Time": [0-9.]+' | grep -oE '[0-9.]+')"
  echo "$timestamp,$label,$name,$planning,$execution" >> "$results_file"
}

while IFS= read -r line; do
  if [[ "$line" =~ ^--\ name:\ (.+)$ ]]; then
    run_query "$current_name" "$current_sql"
    current_name="${BASH_REMATCH[1]}"
    current_sql=""
  elif [[ -n "$line" && ! "$line" =~ ^-- ]]; then
    current_sql="$current_sql $line"
  fi
done < "$queries_file"
run_query "$current_name" "$current_sql"

echo "Results appended to $results_file"
```

- [ ] **Step 5: Run test to verify it passes**

Run: `chmod +x backend/scripts/bench-hot-queries.sh && bash backend/scripts/bench-hot-queries.test.sh`
Expected: `PASS: bench-hot-queries.sh records one CSV row per query`

- [ ] **Step 6: Commit**

```bash
git add backend/scripts/bench-hot-queries.sh backend/scripts/hot-queries.sql backend/scripts/bench-hot-queries.test.sh
git commit -m "feat(scripts): add hot-query benchmark script for Sevalla/Neon comparison

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0178nkc7gqvqEdqBn9MnDBKi"
```

---

### Task 2: Migration — enable `pg_stat_statements`

**Files:**
- Create: `backend/migrations/000015_enable_pg_stat_statements.up.sql`
- Create: `backend/migrations/000015_enable_pg_stat_statements.down.sql`

**Interfaces:**
- Consumes: nothing — plain `golang-migrate` SQL migration, applied via `make migrate-up`
  (existing target, no changes needed).
- Produces: `pg_stat_statements` extension + view, which Task 3's branch-comparison workflow
  queries to identify which queries actually changed after a tuning iteration (not just the
  hand-picked hot queries in `hot-queries.sql`).

Migration numbering: confirmed next available is `000015` via
`ls backend/migrations | tail -6` (highest existing is `000014_add_clerk_user_id`) — re-check
this at execution time per this project's CLAUDE.md, since other plans may have landed
migrations first.

- [ ] **Step 1: Write the up migration**

Create `backend/migrations/000015_enable_pg_stat_statements.up.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

- [ ] **Step 2: Write the down migration**

Create `backend/migrations/000015_enable_pg_stat_statements.down.sql`:

```sql
DROP EXTENSION IF EXISTS pg_stat_statements;
```

- [ ] **Step 3: Verify migration file naming matches golang-migrate's expected pattern**

Run: `ls backend/migrations | grep 000015`
Expected:
```
000015_enable_pg_stat_statements.down.sql
000015_enable_pg_stat_statements.up.sql
```

- [ ] **Step 4: Verify against a real Postgres instance**

This can't be verified with a stub — `CREATE EXTENSION` needs a real server. Run against the
CI-style local Postgres this project already uses for backend tests (`postgres:17`, see
`.github/workflows/ci.yml`):

```bash
docker run --rm -d --name pg-stat-test -e POSTGRES_PASSWORD=test -p 5433:5432 postgres:17
sleep 2
PGPASSWORD=test psql -h localhost -p 5433 -U postgres -f backend/migrations/000015_enable_pg_stat_statements.up.sql
PGPASSWORD=test psql -h localhost -p 5433 -U postgres -c "SELECT extname FROM pg_extension WHERE extname='pg_stat_statements';"
PGPASSWORD=test psql -h localhost -p 5433 -U postgres -f backend/migrations/000015_enable_pg_stat_statements.down.sql
docker stop pg-stat-test
```
Expected: the `SELECT` returns one row (`pg_stat_statements`) between the up and down runs.
This is a one-off local Docker container for verifying the migration SQL only — it is not part
of this project's normal workflow (per `[[project_infrastructure]]`, dev/prod use a
cloud-hosted DB, no Docker) and must be torn down (`docker stop`) immediately after.

- [ ] **Step 5: Commit**

```bash
git add backend/migrations/000015_enable_pg_stat_statements.up.sql backend/migrations/000015_enable_pg_stat_statements.down.sql
git commit -m "feat(db): enable pg_stat_statements for query performance analysis

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0178nkc7gqvqEdqBn9MnDBKi"
```

---

### Task 3: Neon branch-based tuning-cycle script

**Files:**
- Create: `backend/scripts/neon-branch-bench.sh`
- Test: `backend/scripts/neon-branch-bench.test.sh`

**Interfaces:**
- Consumes: `<parent-branch-name> <tuning-branch-name>` positional args; shells out to
  `neonctl branches create`/`neonctl branches delete`/`neonctl connection-string`, and reuses
  Task 1's `backend/scripts/bench-hot-queries.sh` by exact path, passing the created branch's
  connection string as `<dsn>` and `<tuning-branch-name>` as `<label>`.
- Produces: exit 0 after benchmarking the new branch and leaving it in place for manual
  inspection (deletion is a separate explicit step, not automatic, so a human can review
  results before losing the branch).

- [ ] **Step 1: Write the failing test (stubbed `neonctl` + real Task 1 script with stubbed `psql`)**

Create `backend/scripts/neon-branch-bench.test.sh`:

```bash
#!/usr/bin/env bash
# Tests neon-branch-bench.sh against stubbed neonctl and psql. Run:
# bash backend/scripts/neon-branch-bench.test.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STUB_DIR="$(mktemp -d)"
trap 'rm -rf "$STUB_DIR"' EXIT

cat > "$STUB_DIR/neonctl" <<'EOF'
#!/usr/bin/env bash
echo "neonctl called with: $*" >> "$STUB_LOG"
if [[ "$1" == "branches" && "$2" == "create" ]]; then
  echo "created branch"
elif [[ "$1" == "connection-string" ]]; then
  echo "postgres://branch-dsn"
fi
EOF
chmod +x "$STUB_DIR/neonctl"

cat > "$STUB_DIR/psql" <<'EOF'
#!/usr/bin/env bash
echo '[{"Planning Time": 0.1, "Execution Time": 1.0}]'
EOF
chmod +x "$STUB_DIR/psql"

export STUB_LOG="$STUB_DIR/calls.log"
results_file="$STUB_DIR/bench-results.csv"
PATH="$STUB_DIR:$PATH" BENCH_RESULTS_FILE="$results_file" \
  "$SCRIPT_DIR/neon-branch-bench.sh" "main" "tuning-iteration-1"

if ! grep -q "branches create.*tuning-iteration-1.*--parent main" "$STUB_LOG"; then
  echo "FAIL: expected neonctl branches create with --parent main"
  cat "$STUB_LOG"
  exit 1
fi

if [[ ! -f "$results_file" ]] || ! grep -q "tuning-iteration-1" "$results_file"; then
  echo "FAIL: expected bench results labeled with the new branch name"
  exit 1
fi

echo "PASS: neon-branch-bench.sh creates a branch and benchmarks it"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash backend/scripts/neon-branch-bench.test.sh`
Expected: FAIL with `neon-branch-bench.sh: No such file or directory`

- [ ] **Step 3: Write minimal implementation**

Create `backend/scripts/neon-branch-bench.sh`:

```bash
#!/usr/bin/env bash
# Creates a Neon branch from parent-branch-name (copy-on-write, zero prod
# load), then runs bench-hot-queries.sh against it, labeled with
# tuning-branch-name. The branch is left in place — delete it explicitly
# with `neonctl branches delete <tuning-branch-name>` after reviewing
# results (compare its rows in bench-results.csv against the baseline/parent
# label from an earlier run).
#
# Usage: neon-branch-bench.sh <parent-branch-name> <tuning-branch-name>
# Requires: neonctl authenticated (`neonctl auth`) with the project already
# selected (`neonctl set-context --project-id <id>`).
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <parent-branch-name> <tuning-branch-name>" >&2
  exit 2
fi

parent_branch="$1"
tuning_branch="$2"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Creating branch '$tuning_branch' from '$parent_branch'..."
neonctl branches create --name "$tuning_branch" --parent "$parent_branch"

dsn="$(neonctl connection-string "$tuning_branch")"

echo "Benchmarking branch '$tuning_branch'..."
"$script_dir/bench-hot-queries.sh" "$dsn" "$tuning_branch"

echo "Branch '$tuning_branch' left in place. Compare its rows in bench-results.csv"
echo "against the baseline/parent label, then either promote the change to the"
echo "production branch or run: neonctl branches delete $tuning_branch"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `chmod +x backend/scripts/neon-branch-bench.sh && bash backend/scripts/neon-branch-bench.test.sh`
Expected: `PASS: neon-branch-bench.sh creates a branch and benchmarks it`

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/neon-branch-bench.sh backend/scripts/neon-branch-bench.test.sh
git commit -m "feat(scripts): add Neon branch-based tuning-cycle benchmark script

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0178nkc7gqvqEdqBn9MnDBKi"
```

---

### Task 4: Before/after benchmark report template

**Files:**
- Create: `.docs/PERFORMANCE_BENCHMARKS.md`

**Interfaces:**
- Consumes: rows from `backend/scripts/bench-results.csv` (Task 1's output format:
  `timestamp,label,query_name,planning_time_ms,execution_time_ms`).
- Produces: the human-readable report referenced by this plan's success criteria — nothing
  downstream consumes this programmatically.

Documentation task — no test cycle; the deliverable is the file itself.

- [ ] **Step 1: Write the template**

Create `.docs/PERFORMANCE_BENCHMARKS.md`:

```markdown
# Performance Benchmarks: Sevalla → Neon

Tracks before/after query performance across the Neon migration and tuning workstream.
Raw data: `backend/scripts/bench-results.csv` (generated by `backend/scripts/bench-hot-queries.sh`
and `backend/scripts/neon-branch-bench.sh` — see
`docs/superpowers/plans/2026-09-03-neon-performance-tuning-plan.md`).

## Methodology

1. **Baseline** — `bench-hot-queries.sh` run against live Sevalla, labeled `sevalla-baseline`,
   captured before the migration cutover (see the migration plan's Task 6 runbook, step 2).
2. **Neon default** — same script run against Neon immediately post-cutover, before any tuning,
   labeled `neon-default`.
3. **Tuning iterations** — `neon-branch-bench.sh` run per candidate change, each on its own
   branch/label, compared against its untouched parent branch's numbers.
4. **Promoted** — once a tuning branch's numbers are validated, the change is applied to the
   Neon production branch and re-measured, labeled `neon-tuned`.

## Results

| Query | sevalla-baseline (ms) | neon-default (ms) | neon-tuned (ms) | Change |
|---|---|---|---|---|
| activity_list_default_sort | _pending_ | _pending_ | _pending_ | _pending_ |
| activity_list_next_page | _pending_ | _pending_ | _pending_ | _pending_ |
| activity_text_search | _pending_ | _pending_ | _pending_ | _pending_ |
| perspectives_for_content | _pending_ | _pending_ | _pending_ | _pending_ |

_Fill in from `backend/scripts/bench-results.csv` as each phase of the runbook completes._

## Tuning changes applied

_Document each promoted change here as it lands: what changed (index, pool size, extension),
which branch validated it, and the before/after numbers from that branch's comparison._
```

- [ ] **Step 2: Commit**

```bash
git add .docs/PERFORMANCE_BENCHMARKS.md
git commit -m "docs: add before/after benchmark report template for Neon tuning

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0178nkc7gqvqEdqBn9MnDBKi"
```
