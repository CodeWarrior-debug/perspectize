# Neon Postgres Migration & Performance Tuning — Design Spec

**Date:** 2026-09-03
**Status:** Piece 1 (migration) cut over 2026-10-06; Sevalla decommission and Piece 2 (performance tuning) pending — see "Execution status" in the migration plan
**Required execution sub-skill:** `superpowers:executing-plans`

## Overview

Perspectize's production PostgreSQL database is currently hosted on Sevalla (cloud Postgres;
see `backend/internal/config/config.go` — `DATABASE_URL`-driven DSN, pgx driver, GORM). This
spec covers moving that database to [Neon](https://neon.tech), and using the move as the
occasion to correct a set of tuning assumptions (connection pooling, indexing, and
storage/disk defaults) that were never revisited for a managed, disk-separated Postgres
provider.

This is two related but separable pieces of work, each getting its own superpowers
implementation plan:

1. **Migration** — move the existing production database and its data to Neon, cut the app
   over, decommission Sevalla.
2. **Performance tuning** — using Neon's branching feature, establish a Sevalla-baseline vs
   tuned-Neon before/after comparison and land the tuning changes (pooling config, indexes,
   extensions, revised storage-tier assumptions).

Both plans live under `docs/superpowers/plans/`. A single roadmap phase (see
[Roadmap placement](#roadmap-placement)) references both.

## Scope

**In scope:**
- Production database only (per user direction — no separate staging DB exists today; local
  dev already points at the cloud DB per `[[project_infrastructure]]` memory, and is not
  touched by this work unless the migration itself requires a local-dev `DATABASE_URL` update).
- Full data migration (schema + rows), not just an empty-schema cutover.
- Connection pooling, indexing, and extension/storage tuning as a coupled follow-on
  workstream, benchmarked before/after.
- Manual-vs-delegable checklists for both plans, since account/dashboard-level steps
  (Neon project creation, DNS/env var changes in the DigitalOcean App Platform dashboard,
  choosing the maintenance window, final go/no-go) cannot be delegated to an agent.

**Out of scope:**
- Staging/local-dev environment migration (none exists to migrate; local dev's pointer to a
  cloud DB can be repointed to Neon as a small follow-up, not part of this spec).
- Zero-downtime cutover mechanics (logical replication/dual-write). User has confirmed brief
  downtime during a maintenance window is acceptable — this materially simplifies the
  migration plan (see [Migration approach](#migration-approach)).
- Schema-level optimization (JSONB trimming, column promotion) — that is the existing,
  already-roadmapped **Phase 11: Database Optimization** in `.planning/v1.1-ROADMAP.md`. This
  spec's performance workstream is infra-level (pooling/indexing-for-Neon/extensions/storage
  assumptions), not a duplicate of Phase 11's schema work. Phase 11 will depend on this
  spec's migration phase instead of "v1.0 complete" (see below).

## Research findings (via context7, `/neondatabase/website`)

Full detail was reported in-conversation; the load-bearing facts for plan-writing:

- **Versions:** Neon supports Postgres 14–18 (18 is current default), pinned at project
  creation via `--pg-version`; no in-place major-version upgrade path.
- **Tiers:** Free tier suspends compute on limit (not production-safe) — **Launch** is the
  practical floor for a small production app (autoscale to 16 CU, 7-day point-in-time
  restore, usage-based billing).
- **Pooling:** Built-in PgBouncer in transaction mode, exposed as a distinct `-pooler`
  connection string. Transaction-mode pooling cannot do session-scoped features (`SET`,
  `LISTEN/NOTIFY`, session advisory locks, multi-statement temp tables) — migration tooling
  (`golang-migrate`, `pg_dump`/`pg_restore`) must use the **direct** (unpooled) string; app
  runtime traffic should use the **pooled** string. The existing pgx/GORM
  `SetMaxOpenConns`/`SetMaxIdleConns`/`SetConnMaxLifetime` stack (`backend/pkg/database/postgres.go`)
  needs no code change — it layers on top of the pooler unmodified, but `DB_MAX_OPEN_CONNS`
  should be checked against the pooler's computed `default_pool_size` for the chosen compute
  size to avoid pool exhaustion.
- **Extensions:** Broad parity (`pgvector`, `pg_stat_statements`, `pg_trgm`, `pgcrypto`,
  `postgis`, `postgres_fdw`, `dblink`, `btree_gin`/`gist`), enabled via plain
  `CREATE EXTENSION IF NOT EXISTS`. No documented "unsupported" list surfaced; the practical
  constraint is no superuser/filesystem access, not extension availability.
- **Storage/tuning:** Compute and storage are separated; Neon sets `fsync = off` (durability
  is handled by its own storage engine) and prefetches aggressively to offset
  network-attached-storage latency. Neon publishes no fixed `random_page_cost`/
  `effective_io_concurrency` recommendation — official guidance is to not fight Neon's
  compute-size-driven parameter tuning with `ALTER SYSTEM`. Legacy Sevalla-era
  spinning-disk-oriented values should **not** be ported forward; they should be re-baselined
  empirically post-migration.
- **Migration mechanism:** Import Data Assistant (databases under 10GB), `pg_dump`/`pg_restore`
  (general case, direct connection, one database at a time — no `pg_dumpall`), or logical
  replication (near-zero-downtime). Given brief downtime is acceptable and this is a small
  app, `pg_dump`/`pg_restore` is the right mechanism.
- **Branching:** Copy-on-write, near-instant, zero production compute load. Can branch from
  current head or a historical timestamp. This is the mechanism for the performance
  workstream's before/after methodology.

## Migration approach

1. **Provision** (manual): create Neon project, pin Postgres version explicitly (match
   Sevalla's current major version — confirm via `SELECT version();` before provisioning),
   select Launch tier.
2. **Pre-flight** (delegable): confirm extension parity — run
   `SELECT extname FROM pg_extension;` against Sevalla, cross-check each against Neon's
   `pg_available_extensions`.
3. **Dump** (delegable): `pg_dump` from Sevalla using a direct connection string.
4. **Restore** (delegable): `pg_restore` into Neon's **direct** (unpooled) connection string.
5. **Validate** (delegable): row counts, spot-check queries, run existing backend test suite
   against the restored Neon database (point `DATABASE_URL` at Neon in a local/CI run before
   touching prod config).
6. **Cutover** (manual + delegable): during a short, user-chosen maintenance window —
   - (manual) put the app in a brief read-only/maintenance state if desired, or accept a short
     hard outage given low current traffic
   - (delegable) run a final incremental `pg_dump`/`pg_restore` delta (or just re-run full
     dump/restore if downtime budget allows) to catch writes since step 3
   - (manual) update `DATABASE_URL` in the DigitalOcean App Platform dashboard to Neon's
     **pooled** connection string
   - (delegable) restart/redeploy backend service, run smoke tests against production
   - (manual) go/no-go decision; if no-go, revert `DATABASE_URL` to Sevalla
7. **Decommission** (manual): after a confidence window (recommend one week), cancel Sevalla
   database service.

### Manual vs. delegable checklist (migration)

| Step | Manual (you) | Delegable (agent/CLI) |
|---|---|---|
| Neon account + project creation | ✅ | |
| Pin Postgres version | ✅ (decision) | ✅ (CLI flag) |
| Choose Launch tier | ✅ | |
| Extension parity check | | ✅ |
| `pg_dump` from Sevalla | | ✅ |
| `pg_restore` into Neon | | ✅ |
| Row-count / smoke-test validation | | ✅ |
| Run backend test suite against Neon | | ✅ |
| Choose + announce maintenance window | ✅ | |
| Final delta dump/restore at cutover | | ✅ |
| Update `DATABASE_URL` in DO App Platform dashboard | ✅ | |
| Redeploy backend, post-cutover smoke test | | ✅ |
| Go/no-go call | ✅ | |
| Decommission Sevalla | ✅ | |

## Performance tuning approach

**Baseline (pre-migration, delegable):** capture `EXPLAIN ANALYZE` output and timing for the
app's actual hot queries (Activity table list/sort/filter queries — see Phase 11's own query
list once written) against the still-live Sevalla instance, plus current
`DB_MAX_OPEN_CONNS`/pool behavior under load.

**Tuning cycle (post-migration, delegable, uses Neon branching):**
1. Create a Neon branch from prod (instant, copy-on-write, no prod load).
2. On the branch: enable `pg_stat_statements` at minimum; apply candidate changes — pooler
   config (`DB_MAX_OPEN_CONNS` sized to the pooler's `default_pool_size`), candidate indexes,
   any extension-backed query rewrites.
3. Re-run the same hot queries against the branch; compare to the Sevalla baseline and to the
   branch's own pre-change parent.
4. Document before/after numbers.
5. Promote validated changes to prod; delete the branch.

**Explicit non-goal:** porting `random_page_cost`/`effective_io_concurrency`-style
spinning-disk assumptions forward. These get re-baselined empirically on Neon rather than
assumed from Sevalla-era config.

This workstream is infra-level and precedes/parallels Phase 11's schema-level indexing work —
Phase 11's composite-index plans (11-04) should target the Neon database and can reuse this
workstream's benchmarking methodology rather than re-deriving it.

## Roadmap placement

Insert a new decimal phase into `.planning/v1.1-ROADMAP.md`:

- **Phase 10.5: Neon Postgres Migration & Infra Tuning** (INSERTED, before Phase 11)
  - Depends on: v1.0 complete
  - Points to `docs/superpowers/plans/neon-postgres-migration-plan.md` and
    `docs/superpowers/plans/neon-performance-tuning-plan.md`
  - Phase 11 (Database Optimization)'s "Depends on" changes from "v1.0 complete" to
    "Phase 10.5 complete"

This is a GSD roadmap *pointer* entry only — no GSD-native `PLAN.md`/`must_haves.truths` files,
since execution goes through superpowers per the project's stated workflow split (GSD retained
only for roadmap/milestone bookkeeping, not new planning).

## Risks

| Risk | Mitigation |
|---|---|
| Postgres major-version mismatch between Sevalla and Neon breaks restore | Confirm Sevalla's version before provisioning; pin Neon to match |
| Extension used in production not available on Neon | Pre-flight parity check (step 2) before committing to cutover |
| Pool exhaustion after cutover (app pool larger than Neon pooler's default) | Size `DB_MAX_OPEN_CONNS` against the pooler's computed `default_pool_size` before cutover, not after |
| Data written to Sevalla during the dump/restore window is lost | Final delta dump/restore immediately before `DATABASE_URL` switch (step 6) |
| Tuning changes look good on a branch but regress on prod's real traffic pattern | Keep the branch around briefly post-promotion for a fast rollback comparison point |

## Success criteria

1. Production traffic is served entirely from Neon; Sevalla database is decommissioned.
2. All existing backend tests pass against Neon.
3. No data loss versus the pre-cutover Sevalla state (row-count and spot-check parity).
4. Documented before/after benchmark numbers exist for the app's hot queries (Sevalla
   baseline vs tuned Neon).
5. `docs/superpowers/plans/neon-postgres-migration-plan.md` and
   `docs/superpowers/plans/neon-performance-tuning-plan.md` exist and are executable via
   `superpowers:executing-plans`.
6. `.planning/v1.1-ROADMAP.md` reflects Phase 10.5 and Phase 11's updated dependency.
