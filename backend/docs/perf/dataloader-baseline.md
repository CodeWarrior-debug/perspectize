# Dataloader baseline — `content` list query (`Content.primaryCategory` N+1)

**Captured:** 2026-09-06
**Branch base:** `main` @ `f4a2f9a`
**Harness:** `backend/internal/perf/dataloader_perf_test.go` (`-tags perf`)
**DB:** Sevalla-hosted PostgreSQL 17 (`us-east1-001.proxy.sevalla.app`), real dev data
**State under test:** unmodified `contentResolver.PrimaryCategory` — per-row
`ContentService.GetByID` + `CategoryService.GetCategoryByID`.

## What the harness does

Builds the real resolver chain (GORM repos → core services → gqlgen executable
schema → `handler.New`), then issues the exact `ListContent` query the SvelteKit
`ActivityTable` sends — including the `primaryCategory { … }` sub-selection that
triggers the N+1 — via the gqlgen test `client`, `first: 50`, 12 iterations.

SQL statements per request are counted with a GORM `Query`/`Row` callback
(`internal/perf` `queryCounter`), not estimated.

## Dataset

| metric | value |
|---|---|
| `content` rows | 75 |
| rows with `primary_category_id` set | 1 |
| distinct categories referenced | 1 |
| `categories` rows | 3 |
| page size exercised | 50 |

## Results (12 runs, nothing discarded)

| metric | value |
|---|---|
| latency min | 375.0 ms |
| latency max | 705.4 ms |
| latency mean | 544.7 ms |
| latency median | 532.9 ms |
| **SQL queries / request** | **53** (identical every run) |

### Query breakdown (53)

- 1 × `SELECT … FROM content … LIMIT 51` (cursor page)
- 1 × `SELECT count(*) FROM content` (`includeTotalCount: true`)
- 50 × `SELECT * FROM content WHERE id = $1 LIMIT 1` — one per row, from
  `contentResolver.PrimaryCategory` re-fetching the content it was handed just
  to read `PrimaryCategoryID`
- 1 × `SELECT * FROM categories WHERE id = $1 LIMIT 1` — the single row that
  actually has a category

## Honest caveats

- **Small dataset.** Only 1 of 75 rows has a category, so the *category* lookups
  barely register. The measured cost is dominated by the **50 redundant
  `content` re-fetches**, which happen for every row regardless of whether it
  has a category. The N+1 is real and scales with page size; the category
  fan-out would only add to it on data where more rows are categorised.
- **Latency is network-RTT-bound**, not query-bound. Each statement is a
  round-trip to a remote Sevalla DB (~6–10 ms normally, with 250–330 ms
  outliers observed). Production runs against the same remote DB, so this is
  representative, but absolute millisecond figures will differ by network
  conditions. The **query-count** reduction is the stable, meaningful metric.
