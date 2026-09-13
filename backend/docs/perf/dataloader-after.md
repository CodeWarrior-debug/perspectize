# Dataloader after — `content` list query (`Content.primaryCategory` batched)

**Captured:** 2026-09-06
**Branch:** `feature/content-aggregate-dataloader`
**Harness:** `backend/internal/perf/dataloader_perf_test.go` (`-tags perf`) — byte-identical to the baseline run
**DB:** Sevalla-hosted PostgreSQL 17, same dev data as baseline
**State under test:** `contentResolver.PrimaryCategory` reads the FK from
`model.Content.PrimaryCategoryID` (already loaded) and batch-loads the category
through a per-request `dataloadgen` loader.

## What changed

- `model.Content` gained a non-schema `PrimaryCategoryID *int` (gqlgen
  `extraFields`), populated in `domainToModel`. The resolver no longer calls
  `ContentService.GetByID` — the 50 redundant per-row content re-fetches are gone.
- New `internal/adapters/graphql/dataloader` package: a `dataloadgen` mapped
  loader whose batch function calls the **existing** `CategoryService` port
  (`GetCategoriesByIDs` → `CategoryRepository.GetByIDs` → one `WHERE id IN (...)`).
  No SQL in the adapter/graphql layer.
- Wired into the chi stack in `cmd/server/main.go` as
  `graphqldl.Middleware(categoryService)` (per-request loader in context),
  positioned alongside the other `r.Use(...)` middleware after auth.

## Results (12 runs, nothing discarded)

| metric | value |
|---|---|
| latency min | 97.6 ms |
| latency max | 252.9 ms |
| latency mean | 117.2 ms |
| latency median | 102.5 ms |
| **SQL queries / request** | **3** (identical every run) |

### Query breakdown (3)

- 1 × `SELECT … FROM content … LIMIT 51` (cursor page)
- 1 × `SELECT count(*) FROM content` (`includeTotalCount: true`)
- 1 × `SELECT * FROM categories WHERE id IN ($1)` — batched, one round-trip for
  the whole page regardless of how many distinct categories it references

The first iteration (252.9 ms) is a cold-connection outlier; steady-state is
~100 ms and flat.

## Caveats (unchanged from baseline)

Absolute latency is remote-DB-RTT-bound and will vary with network conditions.
The query-count metric (**3, constant**) is the stable result and is
independent of page size — it stays at 3 whether the page has 10 rows or 500.
