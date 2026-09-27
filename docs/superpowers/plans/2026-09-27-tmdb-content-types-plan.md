# TMDB Content Types — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `MOVIE`, `TV_SHOW`, `TV_SEASON` and `TV_EPISODE` content types enriched from TMDB, with per-type grid columns, popovers and details views as designed in the content-type designer.

**Spec:** [`docs/superpowers/specs/2026-09-27-tmdb-content-types-design.md`](../specs/2026-09-27-tmdb-content-types-design.md). Every column, tooltip and details tile in it is defined in `tools/content-type-designer/src/catalog.ts` and `src/details.ts`. Output → *Single-type views* regenerates the per-type tables.

**Architecture:** Three sequenced PRs:
- **PR A:** backend TMDB adapter, the four types and their mutations, and the parent FK with force-add of parents.
- **PR B:** frontend grid (columns, renderers, popovers, `hideWhenSolo` Type column).
- **PR C:** add-content flow and the details modal.

**Tech Stack:** Go, GORM, gqlgen, PostgreSQL 17; SvelteKit, Svelte 5, TanStack Query, ag-grid-svelte5, Tailwind v4, Vitest.

## Global Constraints

- No chained bash commands (`&&`).
- **One migration: `content.parent_content_id`** (spec §3). `content_type` is plain varchar, all other new fields live in `response` JSONB, and the canonical TMDB URLs keep the global `UNIQUE(url)`. Write and review the SQL only. Never run `make migrate-up`/`down`; the PR must say it needs a manual `migrate up` per environment.
- **Migration numbering:** at execution time run `ls backend/migrations/ | tail -5` and `git log --all --oneline -- 'backend/migrations/*'`. As of 2026-09-27, `000028` (content privacy) and `000029` (YouTube Music ISRC index) are claimed by unmerged branches, so `000030` is the likely slot. Re-verify it rather than trusting this number.
- Canonical URLs are always regenerated from ids, never stored as pasted.
- TMDB attribution (logo + notice) ships in the same PR as the first TMDB-visible UI.
- `TMDB_API_READ_ACCESS_TOKEN` is entered by a human through the secret workflow (`.docs/SECURITY.md`). Claude never reads or writes its value.

---

## PR A: Backend

- [ ] **A1 Domain:** add the `ContentTypeMovie/TVShow/TVSeason/TVEpisode` constants and the sort enums for `episodes`, `position` (season×1000+episode), `certification` (scale order) and `releaseStatus`.
- [ ] **A2 Port + adapter:** `adapters/tmdb/` (`client.go`, `parser.go`, `canonical.go`) with the four fetches from spec §4. Parse TMDB/IMDb URLs to ids (IMDb via `/find`). Table-driven parser tests against recorded JSON fixtures.
- [ ] **A3 Schema:** four enum values, plus `createContentFromTMDB(input: { kind, tmdbId, seasonNumber?, episodeNumber?, url? })` and a `searchTMDB(query, kind)` query. Run `make graphql-gen`.
- [ ] **A0 Migration `0000NN_add_content_parent_id`:** `ALTER TABLE content ADD COLUMN IF NOT EXISTS parent_content_id BIGINT NULL REFERENCES content(id) ON DELETE RESTRICT;` plus `CREATE INDEX IF NOT EXISTS idx_content_parent_content_id ON content(parent_content_id) WHERE parent_content_id IS NOT NULL;`, and the matching down. Add `ParentContentID *int64` to the domain and GORM models, and `parent: Content` to the GraphQL `Content` type.
- [ ] **A4 Service:** `CreateFromTMDB` resolves the input to ids, builds the canonical URL, returns the existing row on a UNIQUE hit, then enriches and persists `response`. Season and episode copy network, genres and certification from the parent call.
- [ ] **A4b Force-add parents:** in one transaction, an episode add find-or-creates its show, then its season (one extra `/tv/{id}/season/{n}` call), then the episode. A season add find-or-creates its show. Parent rows go through the same dedupe path, record the adding user, and set `response.addedVia = "parent"`. Set `parent_content_id` to the season for episodes and to the show for seasons. Never add children. Tests: new parent created; existing parent reused; a concurrent duplicate hitting UNIQUE is resolved by re-reading; the transaction rolls back if the parent fetch fails.
- [ ] **A5 Repository:** add JSONB sort rules in `helpers.go` and virtual fields in `gorm_models.go` for the sortable columns in spec §5.
- [ ] **A6 Refresh:** make "Update source data" work for TMDB types, with the same 6h cooldown.
- [ ] **A7 Verify:** `go build ./...`, `gofmt -l .`, `go test ./...`.

## PR B: Frontend grid

- [ ] **B1 Types and queries** for the new fields in `src/lib/queries/content/`.
- [ ] **B2 Column defs** in `ActivityTable.svelte` for `series`, `position`, `episodes`, `certification` and `releaseStatus`. Each has per-type header labels and `headerTooltip` from the catalog.
- [ ] **B3 `hideWhenSolo`:** hide the Type column when the type filter has exactly one type.
- [ ] **B4 Item renderer:** 2:3 poster for movie/show/season, 16:9 still for episode. Subtitles as in spec §5; title click opens details and media click opens TMDB.
- [ ] **B5 Popovers:** per-column `tooltipSpec` (raw copy values; multi mode for genres and keywords; score + vote count; spoiler blur).
- [ ] **B6 Per-type default column sets** from the spec §5 table, plus Category off by default for TMDB types.
- [ ] **B7 Verify:** `pnpm run test:run`, plus renderer and tooltipSpec unit tests.

## PR C: Add flow + details modal

- [ ] **C1 Add-content autodetect:** TMDB/IMDb URL → type chip. A title search offers movie or show, then a season and episode picker. When adding a season or episode, the confirm step names any parents it will also add ("Also adds Breaking Bad and Season 5"). The message is informational only, with no opt-out.
- [ ] **C2 Details layouts** per spec §7: seasons and episodes lists with open/add, breadcrumb, prev/next, and the attribution footer.
- [ ] **C3 CSP:** allow `img-src image.tmdb.org`.
- [ ] **C4 Verify:** frontend tests. Browser checks are handed to a local session (`.docs/VERIFICATION.md`).
