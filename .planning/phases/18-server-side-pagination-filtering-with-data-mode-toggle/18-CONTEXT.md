# Phase 18: Server-Side Pagination & Filtering with Data Mode Toggle — Context

## Phase Goal

Add a data mode toggle to ActivityTable that switches between "All Items" (server-side sort/filter/search across full dataset) and "Loaded X Items" (client-side sort/filter/search on currently loaded page). Expand backend filtering and sorting capabilities to support full server-side operation.

## Problem Statement

Currently, ActivityTable has a hybrid approach:
- **Server-side**: Sort, search (name ILIKE), pagination (cursor-based)
- **Client-side**: Column filtering (Type, Length, Views, Likes, Date, Channel, Tags, Description)

This means column filters only operate on the current page of results (typically 10-50 items), not the full dataset. Users with 100+ items can't filter across all their content — they only filter what's visible.

Additionally:
- The page-level search input (`searchText` in `+page.svelte`) is passed to ActivityTable but never consumed — search is disconnected
- No URL-reflected query state — users can't share or bookmark a filtered view
- AG Grid's `SORT_FIELD_MAP` has several fallbacks (`type`, `duration`, `channel` all fall back to `NAME`) because the backend doesn't support sorting on those fields

## Design Decisions

### Data Mode Toggle

**Labels:**
- **"All Items"** — Server-side mode. Sort, filter, and search operate on the entire dataset via GraphQL API.
- **"Loaded X Items"** (dynamic count, e.g., "Loaded 47 Items") — Client-side mode. Sort, filter, and search operate on the currently fetched page only. Hover tooltip explains: "Sort, filter, and search within the currently loaded page only."

**Default mode:** "Loaded Items" (client-side) — preserves current behavior, fast for small datasets.

**Toggle location:** Pagination bar area, near the total count display.

### Server-Side Filtering (All Items Mode)

All AG Grid columns support server-side filtering:

| Column | Filter Type | Backend Implementation |
|--------|------------|----------------------|
| Item (name) | Text search (ILIKE) | Already exists (`search` in ContentFilter) |
| Type | Enum select | Already exists (`contentType` in ContentFilter) |
| Length/Duration | Number range | Already exists (`minLengthSeconds`, `maxLengthSeconds`) |
| Views | Number range (min/max) | **New**: `minViewCount`, `maxViewCount` |
| Likes | Number range (min/max) | **New**: `minLikeCount`, `maxLikeCount` |
| Publish Date | Date range | **New**: `publishedAfter`, `publishedBefore` |
| Channel | Text search (ILIKE) | **New**: `channelTitle` |
| Tags | Text contains | **New**: `tagContains` |
| Description | Text search (ILIKE) | **New**: `descriptionSearch` |
| Date Added | Date range | **New**: `createdAfter`, `createdBefore` |
| Updated | Date range | **New**: `updatedAfter`, `updatedBefore` |

**Note:** ViewCount, LikeCount, PublishedAt, ChannelTitle, Tags, Description are extracted from JSONB `response` column. Filters will use JSONB operators in SQL WHERE clauses (same pattern as existing sort rules with `SQLRepr`).

### Server-Side Sorting Expansion

Current `ContentSortBy` enum supports: `CREATED_AT`, `UPDATED_AT`, `NAME`, `VIEW_COUNT`, `LIKE_COUNT`, `PUBLISHED_AT`.

**New sort fields needed:**
- `CHANNEL_TITLE` — JSONB extraction: `response->'items'->0->'snippet'->>'channelTitle'`
- `LENGTH` — Direct column: `length`

The `SORT_FIELD_MAP` in ActivityTable will be updated to remove `NAME` fallbacks.

### Pagination

**Hybrid approach:** Cursor-based under the hood (via gorm-cursor-paginator) with page numbers in the URL.

- URL shows `?page=2` but internally uses cursor pagination for performance
- Frontend maintains a cursor-to-page mapping (current `cursors` array pattern already does this)
- Page numbers are 1-indexed in URL, 0-indexed internally (current pattern)
- "Jump to page" not supported in v1 — sequential navigation only (prev/next)

### URL Structure

**Search params on current route** — SvelteKit-native, shareable, bookmarkable.

```
/activity?mode=all&sort=views&dir=desc&page=2&f.type=youtube&f.views=1000..&q=cooking
```

| Param | Values | Default (omitted from URL) |
|-------|--------|--------------------------|
| `mode` | `all`, `loaded` | `loaded` |
| `sort` | AG Grid colId: `item`, `type`, `duration`, `views`, `likes`, `publishDate`, `channel`, `createdAt`, `updatedAt` | `updatedAt` |
| `dir` | `asc`, `desc` | `desc` |
| `page` | 1-indexed page number | `1` |
| `pageSize` | `10`, `25`, `50` | `10` |
| `q` | Text search string | (empty) |
| `f.type` | `youtube` | (none) |
| `f.duration` | Range: `60..600`, `..300`, `600..` | (none) |
| `f.views` | Range: `1000..`, `..5000`, `1000..5000` | (none) |
| `f.likes` | Range: same syntax | (none) |
| `f.date` | ISO range: `2024-01..2024-06`, `2024-01..`, `..2024-06` | (none) |
| `f.channel` | Text search | (none) |
| `f.tags` | Text contains | (none) |

**URL sync behavior:**
- `replaceState` for filter/sort/search changes (no history spam)
- `goto` for page changes (supports browser back/forward through pages)
- On page load, read URL params → initialize state → fetch data

### Client-Side Mode Behavior

In "Loaded Items" mode:
- AG Grid handles sort/filter/search entirely client-side
- No server requests on filter/sort changes
- Page-level search uses AG Grid Quick Filter (`api.setQuickFilter()`)
- Pagination is AG Grid's built-in client-side pagination
- URL still reflects state (so switching to "All Items" mode preserves context)

### All Items Mode Behavior

In "All Items" mode:
- Sort changes → update URL → TanStack Query refetches with new sortBy/sortOrder
- Filter changes (debounced 500ms) → update URL → TanStack Query refetches with new filter params
- Search → update URL → TanStack Query refetches with new `search` param
- Pagination → update URL → TanStack Query refetches with cursor for new page
- AG Grid displays data as-is (no client-side filtering/sorting)

### Mode Switching

When toggling modes:
- **All → Loaded**: Load all data on current page, enable client-side features
- **Loaded → All**: Preserve current sort/filter/search, convert to server-side params, refetch
- Filters that can't map between modes are reset (e.g., AG Grid complex filter models → simplified server params)

## Current Architecture

### Frontend Data Flow
```
+page.svelte
  └── ActivityTable.svelte
        ├── TanStack Query (contentQuery)
        │     ├── queryKey: includes sortBy, sortOrder, search, first, after
        │     └── queryFn: graphqlClient.request(LIST_CONTENT, vars)
        ├── AG Grid (ClientSideRowModelModule)
        │     ├── onSortChanged → updates sortBy/sortOrder state
        │     ├── onFilterChanged → updates filterText (item column only, 500ms debounce)
        │     └── Client-side filters for other columns
        └── Manual pagination controls (prev/next + page size)
```

### Backend Stack
```
GraphQL Schema (schema.graphql)
  └── content query with: first, after, last, before, sortBy, sortOrder, filter, includeTotalCount
        └── ContentFilter: contentType, minLengthSeconds, maxLengthSeconds, search

Resolver (schema.resolvers.go)
  └── Maps GraphQL input → domain.ContentListParams → ContentService.ListContent

Repository (gorm_content_repository.go)
  └── List(): builds GORM query → applies filters → counts → paginates with gorm-cursor-paginator

Sort Rules (helpers.go: buildContentSortRules)
  └── ViewCount, LikeCount, PublishedAt use SQLRepr for JSONB extraction
  └── Name, CreatedAt, UpdatedAt use direct column references
```

### Key Files

| Layer | File | Purpose |
|-------|------|---------|
| Frontend page | `frontend/src/routes/+page.svelte` | Activity page with search input + ActivityTable |
| Frontend table | `frontend/src/lib/components/ActivityTable.svelte` | AG Grid + TanStack Query + pagination |
| Frontend queries | `frontend/src/lib/queries/content.ts` | LIST_CONTENT GraphQL query |
| Frontend query keys | `frontend/src/lib/queries/keys.ts` | TanStack Query key factory |
| Frontend formatting | `frontend/src/lib/utils/formatting.ts` | Cell renderers, formatters |
| GraphQL schema | `backend/schema.graphql` | ContentFilter, ContentSortBy, content query |
| Resolver | `backend/internal/adapters/graphql/resolvers/schema.resolvers.go` | Content query resolver |
| Domain | `backend/internal/core/domain/pagination.go` | ContentListParams, ContentFilter, PaginatedContent |
| Domain | `backend/internal/core/domain/content.go` | Content struct |
| Repository | `backend/internal/adapters/repositories/postgres/gorm_content_repository.go` | List() with GORM + cursor pagination |
| Helpers | `backend/internal/adapters/repositories/postgres/helpers.go` | buildContentSortRules |
| GORM models | `backend/internal/adapters/repositories/postgres/gorm_models.go` | ContentModel with dummy sort fields |

## Known Issues to Fix

1. **Disconnected search**: `searchText` prop passed from `+page.svelte` to `ActivityTable` but never consumed. Search should be wired through URL params.
2. **Sort fallbacks**: `SORT_FIELD_MAP` maps `type`, `duration`, `channel` to `NAME` — these should either be unsortable server-side or properly supported.
3. **No URL state**: Navigating away and back resets all filters/sort/search/page.

## Dependencies

- None (can parallel with other phases)

## Risks

1. **JSONB filter performance**: Filtering on JSONB-extracted values (viewCount, likeCount, publishedAt, channelTitle, tags) without indexes will be slow at scale. Mitigation: add GIN/BTREE indexes on common JSONB paths, or defer to Phase 11 (Database Optimization).
2. **AG Grid mode switching complexity**: Switching between client-side and server-side row models mid-session may require grid re-initialization. Mitigation: keep using ClientSideRowModelModule for both modes — in "All Items" mode, just disable AG Grid's client-side features and route everything through the server.
3. **URL param explosion**: Many filter params could make URLs unwieldy. Mitigation: only include non-default params in URL.

## Success Criteria

1. Data mode toggle visible in pagination area with "All Items" / "Loaded X Items" labels
2. In "All Items" mode, sorting any column triggers server-side sort (no client-side fallbacks)
3. In "All Items" mode, filtering any column triggers server-side filter via expanded ContentFilter
4. In "Loaded Items" mode, sort/filter/search works client-side only (current behavior)
5. URL reflects current query state (mode, sort, filters, page, search)
6. Sharing a URL with params restores the exact view
7. Default mode is "Loaded Items" with no URL params
8. Hover tooltip on "Loaded X Items" explains the mode

---

*Context gathered: 2026-02-26*
