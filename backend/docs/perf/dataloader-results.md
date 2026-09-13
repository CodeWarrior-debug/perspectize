# Dataloader results — `Content.primaryCategory` N+1 elimination

**Query:** `ListContent` (`content(first: 50, …)` with `primaryCategory { … }`) —
the query backing the SvelteKit `ActivityTable`.
**Method:** `backend/internal/perf/dataloader_perf_test.go`, real resolver chain
against the Sevalla dev DB, 12 iterations each, SQL statements counted via a GORM
callback (not estimated). Baseline and after runs used the identical harness.

## Before / after

| metric | baseline (N+1) | after (dataloader) | change |
|---|---:|---:|---:|
| **SQL queries / request** | **53** | **3** | **−50 (−94%), ~17.7× fewer** |
| latency — median | 532.9 ms | 102.5 ms | **−81%, 5.2× faster** |
| latency — mean | 544.7 ms | 117.2 ms | −78%, 4.6× faster |
| latency — min | 375.0 ms | 97.6 ms | −74% |
| latency — max | 705.4 ms | 252.9 ms | −64% |

Query count was rock-constant across all 12 runs in both states (`[53]×12` →
`[3]×12`).

### Where the 50 queries went

| source | baseline | after |
|---|---:|---:|
| content cursor page | 1 | 1 |
| `count(*)` for `totalCount` | 1 | 1 |
| per-row `content` re-fetch in `PrimaryCategory` | 50 | 0 — FK reused from the already-loaded row |
| category lookup | 1 (single-row) | 1 (batched `WHERE id IN (...)`) |
| **total** | **53** | **3** |

## Scaling note

The `after` query count is **independent of page size** — it stays at 3 for a
10-row or a 500-row page. The baseline grows as `2N + 3`.

## Honesty flag — is the result reliable?

**The query-count result is reliable and representative. The latency percentages
are directionally correct but noisy.**

- **Dataset is small and lightly categorised** (75 content rows, only 1 with a
  `primary_category_id`). The dominant cost removed is the **50 redundant
  per-row `content` re-fetches**, which occur for every row whether or not it
  has a category — so the N+1 is genuine and independent of how much category
  data exists. The category fan-out itself is currently tiny; on data where many
  rows are categorised the batched loader would save proportionally more.
- **Latency is bound by round-trip time to the remote Sevalla DB**, with
  observed per-statement outliers of 250–330 ms. Production talks to the same
  remote DB, so the shape holds, but the exact millisecond figures depend on
  network conditions at capture time. Treat "≈5× faster / 94% fewer queries" as
  the headline; treat the sub-percent latency digits as approximate.
