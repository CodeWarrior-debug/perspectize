# Neon Postgres Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Execution status (updated 2026-10-06)

**Cut over.** The production database now runs on Neon (PostgreSQL 18.6, us-east-1) and the
Sevalla-hosted backend app is connected to it. This plan was executed by hand with
`pg_dump`/`pg_restore` rather than the scripted Tasks 1–5 below; the checkboxes in this file
were not ticked and are kept as the original plan.

| Plan item | Status |
|---|---|
| Confirm Sevalla version | Done: PostgreSQL 17.0 (Neon is 18.6; a 17 -> 18 restore is supported) |
| Extension parity | Done by hand: Sevalla has only `plpgsql`, nothing to install |
| Rehearsal restore on a scratch Neon branch | Done, then discarded; 14/14 tables matched exactly |
| Maintenance window, final dump, restore into `production` | Done: all 14 tables matched Sevalla's exact row counts, `schema_migrations` = 29 (clean), `valid_integer_range` domain present |
| Repoint backend `DATABASE_URL` and restart | Done on Sevalla; backend log shows a successful Neon connection |
| End-to-end smoke test of the deployed site | Confirm and record here |
| Backend test suite against Neon (Pre-flight) | Not run |
| Decommission the Sevalla database | Pending: keep as rollback for about a week, then delete |
| Reset the DB passwords that were exposed during cutover (Neon `neondb_owner`, Sevalla `admin`) | Pending |

**Deviations from this plan** (the plan text below is unchanged):
- **Direct connection, not pooled.** The app uses Neon's **direct** string, not the pooled one,
  because the realtime listener uses `LISTEN`/`NOTIFY`, which Neon's PgBouncer (transaction
  mode) does not support. So `DATABASE_URL_UNPOOLED` / `GetMigrationDSN()` (Tasks 1–2) were not
  needed, and `DB_MAX_OPEN_CONNS` is sized against Neon's direct connection limit, not the
  pooler's `default_pool_size`.
- **Pool env vars, no code change.** `DB_MAX_OPEN_CONNS=10`, `DB_MAX_IDLE_CONNS=5`,
  `DB_CONN_MAX_IDLE_TIME=4m` (under Neon's ~5 min autosuspend), `DB_CONN_MAX_LIFETIME=30m`;
  documented in `backend/.env.example`.
- **Hosting.** The backend is deployed on Sevalla (not DigitalOcean App Platform, as written
  in Task 6); only the database moved.
- **Neon free tier**, not Launch, as the floor assumed in the spec.
- Scripts from Tasks 3–5 were not built; their checks were done manually (see table).

**Goal:** Move Perspectize's production PostgreSQL database from Sevalla to Neon, with data intact, during a single brief maintenance window, with a documented rollback path.

**Architecture:** `pg_dump`/`pg_restore` from Sevalla into a version-pinned Neon project during a short maintenance window. The app's `DATABASE_URL` is repointed from Sevalla to Neon's pooled connection string; a new `DATABASE_URL_UNPOOLED` env var carries Neon's direct connection string for migration tooling (`golang-migrate`, `pg_dump`), since Neon's pooler runs in PgBouncer transaction mode and can't support the session-level semantics those tools need.

**Tech Stack:** PostgreSQL (`pg_dump`/`pg_restore`), Go (`backend/internal/config`), `golang-migrate`, bash, Neon CLI (`neonctl`).

**Spec:** `docs/superpowers/specs/2026-09-03-neon-postgres-migration-design.md`

## Global Constraints

- Production database only — no staging DB exists; local dev is out of scope for this plan.
- Brief downtime during a user-chosen maintenance window is acceptable — no logical
  replication/dual-write required.
- Migration mechanism is `pg_dump`/`pg_restore`, not the Import Data Assistant or logical
  replication (per spec §Migration approach).
- Neon project must be pinned to an explicit Postgres major version matching Sevalla's current
  version (confirm via `SELECT version();` before provisioning) — Neon has no in-place major
  version upgrade.
- Neon plan tier: Launch (Free tier's compute-suspend-on-limit is not production-safe).
- App runtime uses Neon's **pooled** (`-pooler`) connection string; migration tooling and
  `pg_dump`/`pg_restore` use the **direct** (unpooled) connection string.
- No changes to `backend/pkg/database/postgres.go`'s pooling code — the existing
  `SetMaxOpenConns`/`SetMaxIdleConns`/`SetConnMaxLifetime` stack is compatible with Neon's
  pooler unmodified.
- This plan does not execute the cutover — it produces the tooling and runbook. Execution
  happens in a separate future session per this project's manual/delegable split (see Task 6).

---

### Task 1: `DatabaseConfig.GetMigrationDSN()` — direct-connection DSN for migration tooling

**Files:**
- Modify: `backend/internal/config/config.go` (add method after `GetDSN`, ~line 113)
- Test: `backend/test/config/config_test.go`

**Interfaces:**
- Consumes: nothing new — reads `DATABASE_URL_UNPOOLED` env var directly, falls back to the
  existing `(*DatabaseConfig).GetDSN()`.
- Produces: `func (c *DatabaseConfig) GetMigrationDSN() string` — used by Task 2 (Makefile) as
  the source of truth for what "the migration DSN" means, and referenced by name in Task 4's
  and Task 5's runbook text so a human operator knows which env var controls which tool.

- [ ] **Step 1: Write the failing test**

Add to `backend/test/config/config_test.go` (in the same file/package as the existing
`DATABASE_URL`-related tests — match the existing `t.Setenv`-based style used there):

```go
func TestGetMigrationDSN_PrefersUnpooledURL(t *testing.T) {
	t.Setenv("DATABASE_URL_UNPOOLED", "postgres://user:pass@ep-xxx.us-east-2.aws.neon.tech/db?sslmode=require")
	t.Setenv("DATABASE_URL", "postgres://user:pass@ep-xxx-pooler.us-east-2.aws.neon.tech/db?sslmode=require")

	c := &config.DatabaseConfig{}
	got := c.GetMigrationDSN()

	assert.Equal(t, "postgres://user:pass@ep-xxx.us-east-2.aws.neon.tech/db?sslmode=require", got)
}

func TestGetMigrationDSN_FallsBackToGetDSN(t *testing.T) {
	t.Setenv("DATABASE_URL_UNPOOLED", "")
	t.Setenv("DATABASE_URL", "postgres://user:pass@ep-xxx-pooler.us-east-2.aws.neon.tech/db?sslmode=require")

	c := &config.DatabaseConfig{}
	got := c.GetMigrationDSN()

	assert.Equal(t, "postgres://user:pass@ep-xxx-pooler.us-east-2.aws.neon.tech/db?sslmode=require", got)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./test/config/... -run TestGetMigrationDSN -v`
Expected: FAIL — `c.GetMigrationDSN undefined (type *config.DatabaseConfig has no field or method GetMigrationDSN)`

- [ ] **Step 3: Write minimal implementation**

In `backend/internal/config/config.go`, immediately after the existing `GetDSN` method:

```go
// GetMigrationDSN returns the connection string for migration tooling
// (golang-migrate, pg_dump/pg_restore). These require session-level semantics
// (advisory locks, multi-statement transactions) that Neon's pooled endpoint
// (PgBouncer transaction mode) does not support, so migration tooling must use
// Neon's direct/unpooled endpoint instead of the app's runtime DATABASE_URL.
// Prefers DATABASE_URL_UNPOOLED; falls back to GetDSN() (DATABASE_URL, then
// the host/port/user config) so this is a no-op for non-Neon environments.
func (c *DatabaseConfig) GetMigrationDSN() string {
	if url := os.Getenv("DATABASE_URL_UNPOOLED"); url != "" {
		return url
	}
	return c.GetDSN()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go test ./test/config/... -run TestGetMigrationDSN -v`
Expected: PASS (both subtests)

- [ ] **Step 5: Run full config test suite to confirm no regression**

Run: `cd backend && go test ./test/config/... -v`
Expected: PASS — all existing tests plus the two new ones

- [ ] **Step 6: Commit**

```bash
git add backend/internal/config/config.go backend/test/config/config_test.go
git commit -m "feat(config): add GetMigrationDSN for Neon unpooled connection

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0178nkc7gqvqEdqBn9MnDBKi"
```

---

### Task 2: Wire `DATABASE_URL_UNPOOLED` into `golang-migrate` Makefile targets

**Files:**
- Modify: `backend/Makefile:10`
- Test: none (Makefile has no Go test harness) — verified via `make -n` dry-run output, which
  prints the resolved command without executing it.

**Interfaces:**
- Consumes: `DATABASE_URL_UNPOOLED`/`DATABASE_URL` env vars, same names Task 1's
  `GetMigrationDSN()` reads — keeps the Makefile and the Go config in agreement about which
  var takes precedence, even though the Makefile doesn't call the Go function directly (it
  shells out to the standalone `migrate` CLI binary, not the backend binary).
- Produces: `DB_URL` make variable, consumed unchanged by the existing `migrate-up`,
  `migrate-up-n`, `migrate-down`, `migrate-down-n`, `migrate-version`, `migrate-force` targets
  (no changes needed to those targets themselves).

- [ ] **Step 1: Change the DB_URL fallback chain**

In `backend/Makefile`, replace line 10:

```makefile
DB_URL ?= $(or $(DATABASE_URL),postgres://testuser:testpass@localhost:5432/testdb?sslmode=disable)
```

with:

```makefile
# Prefers DATABASE_URL_UNPOOLED (Neon's direct connection string — required for
# golang-migrate, which needs session-level semantics unavailable through Neon's
# pooled/PgBouncer endpoint), then DATABASE_URL, then the local CI default.
DB_URL ?= $(or $(DATABASE_URL_UNPOOLED),$(DATABASE_URL),postgres://testuser:testpass@localhost:5432/testdb?sslmode=disable)
```

- [ ] **Step 2: Verify the fallback chain with a dry run — unpooled URL takes precedence**

Run:
```bash
cd backend
make -n migrate-version DATABASE_URL_UNPOOLED=postgres://direct-host/db DATABASE_URL=postgres://pooled-host/db
```
Expected output contains: `migrate -path migrations -database "postgres://direct-host/db" version`

- [ ] **Step 3: Verify the fallback chain with a dry run — falls back to DATABASE_URL**

Run:
```bash
cd backend
make -n migrate-version DATABASE_URL=postgres://pooled-host/db
```
Expected output contains: `migrate -path migrations -database "postgres://pooled-host/db" version`

- [ ] **Step 4: Verify the fallback chain with a dry run — local default unaffected**

Run:
```bash
cd backend
make -n migrate-version
```
Expected output contains: `migrate -path migrations -database "postgres://testuser:testpass@localhost:5432/testdb?sslmode=disable" version`

- [ ] **Step 5: Commit**

```bash
git add backend/Makefile
git commit -m "build(migrate): prefer DATABASE_URL_UNPOOLED for golang-migrate targets

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0178nkc7gqvqEdqBn9MnDBKi"
```

---

### Task 3: Extension parity check script

**Files:**
- Create: `backend/scripts/check-extension-parity.sh`
- Test: `backend/scripts/check-extension-parity.test.sh`

**Interfaces:**
- Consumes: two positional args, `<source-dsn> <target-dsn>`; shells out to `psql`.
- Produces: exit code 0 if the target has every extension the source has installed, exit code
  1 (with a printed diff) otherwise. Task 6's runbook invokes this script by its exact path and
  argument order.

- [ ] **Step 1: Write the failing test (stubbed `psql`)**

Create `backend/scripts/check-extension-parity.test.sh`:

```bash
#!/usr/bin/env bash
# Tests check-extension-parity.sh against a stubbed `psql` so no real database
# is required. Run: bash backend/scripts/check-extension-parity.test.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STUB_DIR="$(mktemp -d)"
trap 'rm -rf "$STUB_DIR"' EXIT

# Stub psql: first call (source DSN) returns 3 extensions, second call (target
# DSN) returns only 2 of them — missing "pg_trgm" — so the script must fail.
cat > "$STUB_DIR/psql" <<'EOF'
#!/usr/bin/env bash
# args: -X -A -t -c "SELECT extname FROM pg_extension ORDER BY extname;" <dsn>
dsn="${*: -1}"
if [[ "$dsn" == *"source"* ]]; then
  printf 'pg_stat_statements\npg_trgm\nplpgsql\n'
else
  printf 'pg_stat_statements\nplpgsql\n'
fi
EOF
chmod +x "$STUB_DIR/psql"

set +e
PATH="$STUB_DIR:$PATH" "$SCRIPT_DIR/check-extension-parity.sh" \
  "postgres://source-dsn" "postgres://target-dsn" > "$STUB_DIR/out.txt" 2>&1
status=$?
set -e

if [[ $status -eq 0 ]]; then
  echo "FAIL: expected non-zero exit (missing pg_trgm), got 0"
  cat "$STUB_DIR/out.txt"
  exit 1
fi

if ! grep -q "pg_trgm" "$STUB_DIR/out.txt"; then
  echo "FAIL: expected output to mention missing extension pg_trgm"
  cat "$STUB_DIR/out.txt"
  exit 1
fi

echo "PASS: check-extension-parity.sh correctly detects missing pg_trgm"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash backend/scripts/check-extension-parity.test.sh`
Expected: FAIL with `check-extension-parity.sh: No such file or directory` (script doesn't
exist yet)

- [ ] **Step 3: Write minimal implementation**

Create `backend/scripts/check-extension-parity.sh`:

```bash
#!/usr/bin/env bash
# Compares installed Postgres extensions between two databases (e.g. Sevalla
# source vs Neon target before cutover). Exits 1 and prints the missing
# extensions if the target is missing anything the source has installed.
#
# Usage: check-extension-parity.sh <source-dsn> <target-dsn>
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <source-dsn> <target-dsn>" >&2
  exit 2
fi

source_dsn="$1"
target_dsn="$2"
query="SELECT extname FROM pg_extension ORDER BY extname;"

source_ext="$(psql -X -A -t -c "$query" "$source_dsn")"
target_ext="$(psql -X -A -t -c "$query" "$target_dsn")"

missing="$(comm -23 <(echo "$source_ext" | sort) <(echo "$target_ext" | sort))"

if [[ -n "$missing" ]]; then
  echo "Missing on target — install before cutover or confirm safe to drop:"
  echo "$missing"
  exit 1
fi

echo "OK: target has every extension the source has installed."
```

- [ ] **Step 4: Run test to verify it passes**

Run: `chmod +x backend/scripts/check-extension-parity.sh && bash backend/scripts/check-extension-parity.test.sh`
Expected: `PASS: check-extension-parity.sh correctly detects missing pg_trgm`

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/check-extension-parity.sh backend/scripts/check-extension-parity.test.sh
git commit -m "feat(scripts): add Neon extension parity check for migration pre-flight

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0178nkc7gqvqEdqBn9MnDBKi"
```

---

### Task 4: Dump/restore orchestration script

**Files:**
- Create: `backend/scripts/migrate-to-neon.sh`
- Test: `backend/scripts/migrate-to-neon.test.sh`

**Interfaces:**
- Consumes: `<source-dsn> <target-dsn>` positional args (target must be Neon's **direct**
  connection string — the script itself doesn't distinguish pooled/unpooled, that's an
  operator responsibility documented in Task 6's runbook); shells out to `pg_dump`/`pg_restore`.
- Produces: exit code 0 on success. Task 6's runbook invokes this script twice — once
  pre-cutover for the bulk copy, once inside the maintenance window for the final delta.

- [ ] **Step 1: Write the failing test (stubbed `pg_dump`/`pg_restore`)**

Create `backend/scripts/migrate-to-neon.test.sh`:

```bash
#!/usr/bin/env bash
# Tests migrate-to-neon.sh against stubbed pg_dump/pg_restore so no real
# database is required. Run: bash backend/scripts/migrate-to-neon.test.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STUB_DIR="$(mktemp -d)"
trap 'rm -rf "$STUB_DIR"' EXIT

cat > "$STUB_DIR/pg_dump" <<'EOF'
#!/usr/bin/env bash
echo "pg_dump called with: $*" >> "$STUB_LOG"
# Simulate writing a dump file at the -f path
for ((i=1; i<=$#; i++)); do
  if [[ "${!i}" == "-f" ]]; then
    j=$((i+1))
    touch "${!j}"
  fi
done
EOF
chmod +x "$STUB_DIR/pg_dump"

cat > "$STUB_DIR/pg_restore" <<'EOF'
#!/usr/bin/env bash
echo "pg_restore called with: $*" >> "$STUB_LOG"
EOF
chmod +x "$STUB_DIR/pg_restore"

export STUB_LOG="$STUB_DIR/calls.log"
PATH="$STUB_DIR:$PATH" "$SCRIPT_DIR/migrate-to-neon.sh" \
  "postgres://source-dsn" "postgres://target-dsn"

if ! grep -q "pg_dump called with:.*--format=custom.*postgres://source-dsn" "$STUB_LOG"; then
  echo "FAIL: pg_dump not called with expected format/source dsn"
  cat "$STUB_LOG"
  exit 1
fi

if ! grep -q "pg_restore called with:.*--clean --if-exists.*postgres://target-dsn" "$STUB_LOG"; then
  echo "FAIL: pg_restore not called with expected flags/target dsn"
  cat "$STUB_LOG"
  exit 1
fi

echo "PASS: migrate-to-neon.sh calls pg_dump then pg_restore with expected args"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash backend/scripts/migrate-to-neon.test.sh`
Expected: FAIL with `migrate-to-neon.sh: No such file or directory`

- [ ] **Step 3: Write minimal implementation**

Create `backend/scripts/migrate-to-neon.sh`:

```bash
#!/usr/bin/env bash
# Dumps a Postgres database from source-dsn and restores it into target-dsn.
# target-dsn must be Neon's DIRECT (unpooled) connection string — pg_restore
# needs session-level semantics the pooled/PgBouncer endpoint doesn't support.
#
# Usage: migrate-to-neon.sh <source-dsn> <target-dsn>
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <source-dsn> <target-dsn>" >&2
  exit 2
fi

source_dsn="$1"
target_dsn="$2"
dump_file="$(mktemp -t perspectize-neon-migration.XXXXXX.dump)"
trap 'rm -f "$dump_file"' EXIT

echo "Dumping from source..."
pg_dump --format=custom --no-owner --no-privileges -f "$dump_file" "$source_dsn"

echo "Restoring into target..."
pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname="$target_dsn" "$dump_file"

echo "Done."
```

- [ ] **Step 4: Run test to verify it passes**

Run: `chmod +x backend/scripts/migrate-to-neon.sh && bash backend/scripts/migrate-to-neon.test.sh`
Expected: `PASS: migrate-to-neon.sh calls pg_dump then pg_restore with expected args`

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/migrate-to-neon.sh backend/scripts/migrate-to-neon.test.sh
git commit -m "feat(scripts): add pg_dump/pg_restore orchestration for Neon cutover

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0178nkc7gqvqEdqBn9MnDBKi"
```

---

### Task 5: Post-restore validation script

**Files:**
- Create: `backend/scripts/validate-neon-restore.sh`
- Test: `backend/scripts/validate-neon-restore.test.sh`

**Interfaces:**
- Consumes: `<source-dsn> <target-dsn>` positional args; shells out to `psql`.
- Produces: exit 0 if every table's row count matches between source and target, exit 1 with a
  printed diff otherwise. Task 6's runbook runs this immediately after Task 4's restore, before
  the go/no-go decision.

- [ ] **Step 1: Write the failing test (stubbed `psql`)**

Create `backend/scripts/validate-neon-restore.test.sh`:

```bash
#!/usr/bin/env bash
# Tests validate-neon-restore.sh against a stubbed `psql`. Run:
# bash backend/scripts/validate-neon-restore.test.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STUB_DIR="$(mktemp -d)"
trap 'rm -rf "$STUB_DIR"' EXIT

# Stub psql: table list query returns "content,perspectives,users". Row-count
# queries match for content/users but mismatch for perspectives (source has
# 10, target has 9) — the script must report that and exit non-zero.
cat > "$STUB_DIR/psql" <<'EOF'
#!/usr/bin/env bash
dsn="${*: -1}"
query="${*}"
if [[ "$query" == *"information_schema.tables"* ]]; then
  printf 'content\nperspectives\nusers\n'
  exit 0
fi
table="$(echo "$query" | grep -oE 'FROM \"?[a-z_]+\"?' | awk '{print $2}' | tr -d '"')"
case "$table" in
  content) echo 100 ;;
  users) echo 5 ;;
  perspectives)
    if [[ "$dsn" == *"source"* ]]; then echo 10; else echo 9; fi
    ;;
esac
EOF
chmod +x "$STUB_DIR/psql"

set +e
PATH="$STUB_DIR:$PATH" "$SCRIPT_DIR/validate-neon-restore.sh" \
  "postgres://source-dsn" "postgres://target-dsn" > "$STUB_DIR/out.txt" 2>&1
status=$?
set -e

if [[ $status -eq 0 ]]; then
  echo "FAIL: expected non-zero exit (perspectives mismatch), got 0"
  cat "$STUB_DIR/out.txt"
  exit 1
fi

if ! grep -q "perspectives" "$STUB_DIR/out.txt"; then
  echo "FAIL: expected output to name the mismatched table 'perspectives'"
  cat "$STUB_DIR/out.txt"
  exit 1
fi

echo "PASS: validate-neon-restore.sh correctly detects row-count mismatch"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash backend/scripts/validate-neon-restore.test.sh`
Expected: FAIL with `validate-neon-restore.sh: No such file or directory`

- [ ] **Step 3: Write minimal implementation**

Create `backend/scripts/validate-neon-restore.sh`:

```bash
#!/usr/bin/env bash
# Compares per-table row counts between source and target after a restore.
# Exits 1 and prints every mismatched table if any counts differ.
#
# Usage: validate-neon-restore.sh <source-dsn> <target-dsn>
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <source-dsn> <target-dsn>" >&2
  exit 2
fi

source_dsn="$1"
target_dsn="$2"

tables="$(psql -X -A -t -c \
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;" \
  "$source_dsn")"

mismatches=0
for table in $tables; do
  source_count="$(psql -X -A -t -c "SELECT COUNT(*) FROM \"$table\";" "$source_dsn")"
  target_count="$(psql -X -A -t -c "SELECT COUNT(*) FROM \"$table\";" "$target_dsn")"
  if [[ "$source_count" != "$target_count" ]]; then
    echo "MISMATCH: $table — source=$source_count target=$target_count"
    mismatches=$((mismatches + 1))
  fi
done

if [[ $mismatches -gt 0 ]]; then
  echo "$mismatches table(s) mismatched — do not cut over until resolved."
  exit 1
fi

echo "OK: all tables match row-for-row."
```

- [ ] **Step 4: Run test to verify it passes**

Run: `chmod +x backend/scripts/validate-neon-restore.sh && bash backend/scripts/validate-neon-restore.test.sh`
Expected: `PASS: validate-neon-restore.sh correctly detects row-count mismatch`

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/validate-neon-restore.sh backend/scripts/validate-neon-restore.test.sh
git commit -m "feat(scripts): add post-restore row-count validation for Neon cutover

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0178nkc7gqvqEdqBn9MnDBKi"
```

---

### Task 6: Cutover runbook (manual vs. delegable checklist)

**Files:**
- Create: `.docs/RUNBOOKS/neon-cutover.md`

**Interfaces:**
- Consumes: the exact script paths and argument order from Tasks 3–5
  (`backend/scripts/check-extension-parity.sh`, `backend/scripts/migrate-to-neon.sh`,
  `backend/scripts/validate-neon-restore.sh`) and the env var names from Tasks 1–2
  (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`).
- Produces: the operational document a human follows during the actual cutover — nothing
  downstream consumes this programmatically.

This is a documentation task — there's no test cycle, since it's an operator-facing runbook,
not code. The "deliverable" is the file itself; review is reading it end-to-end for accuracy
against Tasks 1–5's actual script names/flags before checking this off.

- [ ] **Step 1: Write the runbook**

Create `.docs/RUNBOOKS/neon-cutover.md`:

```markdown
# Neon Cutover Runbook

Companion to `docs/superpowers/specs/2026-09-03-neon-postgres-migration-design.md` and
`docs/superpowers/plans/2026-09-03-neon-postgres-migration-plan.md`. Run steps in order.
✅ = manual (you), 🤖 = delegable (agent or scripted).

## 1. Provision

- [ ] ✅ Confirm Sevalla's current Postgres major version: `psql "$DATABASE_URL" -c "SELECT version();"`
- [ ] ✅ Create a Neon project (neon.tech dashboard or `neonctl projects create`), pinning
      `--pg-version` to match Sevalla's version, on the **Launch** plan tier.
- [ ] ✅ From the Neon dashboard, copy both connection strings for the new project's default
      branch: the pooled one (hostname contains `-pooler`) and the direct one (no `-pooler`).

## 2. Pre-flight (before the maintenance window — no downtime yet)

- [ ] 🤖 Extension parity: `backend/scripts/check-extension-parity.sh "$DATABASE_URL" "<neon-direct-dsn>"`
      — resolve any reported gaps before continuing.
- [ ] 🤖 Bulk copy (safe to run while Sevalla is still live and serving traffic — this captures
      a consistent snapshot but will miss writes made after it starts):
      `backend/scripts/migrate-to-neon.sh "$DATABASE_URL" "<neon-direct-dsn>"`
- [ ] 🤖 Validate the bulk copy: `backend/scripts/validate-neon-restore.sh "$DATABASE_URL" "<neon-direct-dsn>"`
- [ ] 🤖 Run the backend test suite against the Neon copy to catch anything version/config
      related before touching production:
      `cd backend && DATABASE_URL="<neon-direct-dsn>" go test ./...`
- [ ] ✅ In the Neon dashboard (Settings > Compute), note the pooler's `default_pool_size` for
      the selected compute size, and set `DB_MAX_OPEN_CONNS` (env var, read by
      `PoolConfigFromEnv` in `backend/pkg/database/postgres.go`) comfortably under it — an app
      pool larger than the pooler's own pool size defeats the pooler and can exhaust it under
      concurrent app instances.

## 3. Maintenance window (brief downtime starts here)

- [ ] ✅ Announce/start the maintenance window.
- [ ] 🤖 Final delta copy, to catch writes made since step 2's bulk copy:
      `backend/scripts/migrate-to-neon.sh "$DATABASE_URL" "<neon-direct-dsn>"`
- [ ] 🤖 Final validation: `backend/scripts/validate-neon-restore.sh "$DATABASE_URL" "<neon-direct-dsn>"`
- [ ] ✅ In the DigitalOcean App Platform dashboard, update the backend service's env vars:
      - `DATABASE_URL` → Neon's **pooled** connection string
      - `DATABASE_URL_UNPOOLED` → Neon's **direct** connection string
- [ ] 🤖 Redeploy/restart the backend service.
- [ ] 🤖 Smoke test production: hit a handful of real GraphQL queries against the live API and
      confirm expected data comes back.
- [ ] ✅ Go/no-go call. If no-go: revert `DATABASE_URL`/`DATABASE_URL_UNPOOLED` in the dashboard
      to the Sevalla values and redeploy — Sevalla has not been touched by any step above, so
      this is a clean revert.
- [ ] ✅ End the maintenance window.

## 4. Decommission (after a confidence window — recommend one week)

- [ ] ✅ Cancel the Sevalla database service.
- [ ] ✅ Remove any now-stale Sevalla-DB-specific references from `.docs/SECURITY.md`,
      `backend/CLAUDE.md`, and `.docs/VERIFICATION.md` (grep for `Sevalla` and check each hit —
      some Sevalla references are about app hosting, which is unaffected by this migration, and
      must stay).
```

- [ ] **Step 2: Commit**

```bash
git add .docs/RUNBOOKS/neon-cutover.md
git commit -m "docs: add Neon cutover runbook with manual/delegable checklist

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0178nkc7gqvqEdqBn9MnDBKi"
```
