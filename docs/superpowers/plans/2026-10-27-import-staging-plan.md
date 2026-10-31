⚠️ Written without superpowers loaded — a superpowers-enabled session should review via writing-plans before this is executed

# Import Staging — Plan

**Intent:** [import-staging](../../../project-management/intents/import-staging.md) · **Spec:** [YouTube channel import](../specs/2026-10-27-youtube-channel-import-design.md) · **Release:** dark backend, merge-gated frontend

## Defaults taken for the spec's open questions

| Question | v1 answer | Why |
|---|---|---|
| Who can create an import? | Admins only (`createImportJob` checks `ADMIN`) | Listing spends API quota; there is no admin page yet, so imports are created through GraphQL or the demo seed |
| Shared or per-user staging? | Shared: one job's rows are seen by every signed-in user | One listing per source; import status is a fact about the library, not a person |
| Review model | Include (pick rows to import) | Most of a 2,000-video channel is unwanted |
| Stats freshness | Snapshot at listing time, shown as "as of"; the import re-fetches | Keeps quota predictable |
| Route | `/import` (list) and `/import/[id]` (sheet), not in the main nav | "Preliminary, not primary" |
| Source types | `YOUTUBE_CHANNEL` → `YOUTUBE_VIDEO`, `TMDB_PERSON` → `MOVIE` | Claims and Bible passages have no external list to import from |

## Data model (migration 000036: production is already at 34, see the migration header)

- `import_jobs`: `id`, `user_id` (creator), `name`, `created_at`, `updated_at`.
- `import_job_sources`: `id`, `job_id` (CASCADE), `source_type`, `source_ref`, `title`, `url`, `destination_type`, `status` (`listing|ready|failed`), `status_detail`, `item_count`, `fetched_at`.
- `import_job_items`: one row per candidate, `UNIQUE (source_id, external_id)`. Promoted columns for sort/filter (`kind`, `title`, `summary`, `published_at`, `duration_seconds`, views/likes/comments, `rating`/`rating_count`/`rating_source`, `chapter_count`, `has_captions`, `position`), `details jsonb` (description, tags, chapters, people, links, thumbnail) loaded only by the detail query, and the import outcome (`import_status`, `import_error`, `content_id` SET NULL).
- "In library" is computed in the list query by `LEFT JOIN content ON content.url = item.canonical_url`, so it is always current and costs no extra query.

## Pipelines (goroutines + channels)

- **Listing** (per source, started by `createImportJob`): lister goroutine pages the source API and sends batches of up to 50 candidates on a channel → stager goroutine upserts each batch (one statement) and bumps the source's count → source marked `ready` or `failed`.
- **Import** (started by `importItems`): the request loads the picked rows (1 query) and marks the eligible ones `queued` (1 statement), then returns. A pool of 4 workers reads them from a channel and calls the existing `CreateFromYouTube` / `CreateFromMovie`, recording `imported`, `skipped` (already existed) or `failed` per row.
- **Restart:** on boot, sources left `listing` and rows left `queued` are marked `failed` with "interrupted by a restart", so nothing spins forever. Resume is phase 2.

## Slices

1. **Dark backend PR** (to `main`): migration, domain, ports, GORM repository with query-count tests, YouTube channel + TMDB person adapters (httptest), import service (pipelines run inline in tests), GraphQL schema/resolvers, round-trip counts, demo seed with real sample data.
2. **Frontend PR** (`feature/import-staging-frontend`, merge-gated): `/import` list, `/import/[id]` sheet (AG Grid, destination type column, Decide/All columns, floating filters, multi-select with select-all-filtered, detail panel, polling while listing or importing), Vitest + cache-contract tests.

## Out of scope (v1)

Admin UI for creating imports, resuming interrupted work, scheduled re-sync, exclusion-mode review, blog and Bible sources, Scripture mapping of sermons.
