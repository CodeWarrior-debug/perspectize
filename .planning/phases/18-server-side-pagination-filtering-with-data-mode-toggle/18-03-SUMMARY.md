---
phase: 18-server-side-pagination-filtering-with-data-mode-toggle
plan: "03"
subsystem: ui
tags: [ag-grid, tanstack-query, svelte5, url-state, data-mode-toggle, server-side-filtering]

# Dependency graph
requires:
  - phase: 18-01
    provides: "Expanded ContentFilter (13 fields) and ContentSortBy (CHANNEL_TITLE, LENGTH) in GraphQL schema"
  - phase: 18-02
    provides: "gridUrlState.ts with DataMode, GridParams, COL_TO_SORT, parseGridParams, serializeGridParams, filterToUrlParams, urlParamsToFilter, urlParamsToGraphQLFilter"
provides:
  - "DataModeToggle segmented control component (All Items / Loaded N Items)"
  - "ActivityTable refactored to URL-driven state — no more internal sort/filter/page state"
  - "Mode-conditional data fetching: server-side (all) vs client-side (loaded)"
  - "Search input on Activity page wired to URL params with 300ms debounce"
  - "AG Grid sort/filter events routed to URL updates or client-side handling based on mode"
  - "skipNextSortEvent flag prevents sort indicator sync from triggering URL loop"
  - "ContentFilterInput re-exported from queries/content.ts for convenience"
  - "Query key factory updated with filter and mode fields"
affects: [future-activity-page-features, phase-19-onwards]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "URL-driven grid state: $derived(parseGridParams(page.url.searchParams)) → all state from URL"
    - "Mode-conditional query: server-side mode fetches pageSize rows with full filter, client-side fetches 100 rows for AG Grid filtering"
    - "skipNextSortEvent flag: prevents onSortChanged loop when programmatically setting column state"
    - "postSortRows callback: suppresses AG Grid client-side re-sort of server-sorted data"
    - "handleModeToggle syncs AG Grid filter model to URL params when switching Loaded → All"

key-files:
  created:
    - "frontend/src/lib/components/DataModeToggle.svelte"
  modified:
    - "frontend/src/lib/components/ActivityTable.svelte"
    - "frontend/src/routes/+page.svelte"
    - "frontend/src/lib/queries/content.ts"
    - "frontend/src/lib/queries/keys.ts"

key-decisions:
  - "URL-driven state via $derived(parseGridParams(page.url.searchParams)) — ActivityTable has zero internal sort/filter/page state"
  - "Default mode is 'loaded' (client-side) — omitted from URL when default for clean bookmarks"
  - "Client-side mode loads first:100 rows to support AG Grid filtering across full loaded set"
  - "skipNextSortEvent flag breaks the sync loop between applyColumnState and onSortChanged"
  - "postSortRows callback prevents AG Grid from client-side re-sorting server-pre-sorted data"
  - "page.url.searchParams.get('q') used directly for searchInput $state init to avoid Svelte 5 state_referenced_locally warning"
  - "COL_TO_SORT from gridUrlState.ts replaces local SORT_FIELD_MAP — Duration maps to LENGTH, Channel maps to CHANNEL_TITLE"

patterns-established:
  - "URL as single source of truth for grid state: all mode, sort, dir, page, pageSize, q, filters derived from URL"
  - "Mode switch handler: reset cursors, sync AG Grid filters to URL params when switching Loaded → All"
  - "Cursor stack management: 1-indexed pageNum maps to 0-indexed cursors array (cursors[pageNum-1])"

requirements-completed: []

# Metrics
duration: 5min
completed: 2026-02-28
---

# Phase 18 Plan 03: Data Mode Toggle UI & Grid Integration Summary

**AG Grid ActivityTable fully wired to URL-driven state with DataModeToggle switching between server-side (All Items) and client-side (Loaded Items) sort/filter modes**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-28T00:43:18Z
- **Completed:** 2026-02-28T00:48:30Z
- **Tasks:** 7 (Tasks 1, 4, 5 pre-committed; Tasks 2, 3, 6, 7 executed)
- **Files modified:** 5

## Accomplishments

- ActivityTable state management fully replaced: zero internal sort/filter/page `$state` — all derived from URL via `parseGridParams`
- DataModeToggle segmented control integrated into pagination bar — "All Items" triggers server-side requests, "Loaded N Items" uses AG Grid client-side
- Search input on Activity page debounced and wired to URL, ActivityTable reads it from URL (no `searchText` prop)
- AG Grid sort/filter events route conditionally: in 'loaded' mode they return early (AG Grid handles client-side), in 'all' mode they update URL triggering TanStack Query refetch
- `skipNextSortEvent` flag prevents infinite loop when programmatically syncing AG Grid column state from URL
- All 380 frontend tests pass; all backend tests pass

## Task Commits

1. **Task 1: Create DataModeToggle Component** - `2aae959` (feat)
2. **Task 4: Verify LIST_CONTENT Query** - `86f7dea` (feat — ContentFilterInput re-export)
3. **Task 5: Update Query Keys Factory** - `b98fa0c` (feat — filter/mode fields)
4. **Task 2+3+6: ActivityTable URL-driven state + Page search wiring + Mode switch polish** - `cfa407b` (feat)

**Plan metadata:** (docs commit — this summary)

## Files Created/Modified

- `frontend/src/lib/components/DataModeToggle.svelte` - Segmented pill toggle (All Items / Loaded N Items)
- `frontend/src/lib/components/ActivityTable.svelte` - Major refactor: URL-driven state, mode-conditional data fetching, DataModeToggle in pagination bar
- `frontend/src/routes/+page.svelte` - Search input wired to URL with 300ms debounce, searchText prop removed
- `frontend/src/lib/queries/content.ts` - Re-export ContentFilterInput from gridUrlState.ts
- `frontend/src/lib/queries/keys.ts` - Added filter and mode fields to content list key

## Decisions Made

- Used `page.url.searchParams.get('q') ?? ''` for `searchInput` initial value rather than `gridParams.q` to avoid Svelte 5 `state_referenced_locally` lint warning
- Tasks 1/4/5 were already committed from a prior session — resumed at Task 2 without redoing completed work
- `postSortRows` callback used to suppress AG Grid client-side re-sort of server-pre-sorted data in 'all' mode

## Deviations from Plan

None — plan executed exactly as written. All tasks from 18-03-PLAN.md implemented. Pre-existing TypeScript errors in `FormPopover.test.ts` were confirmed pre-existing (existed before this plan's execution) and are out of scope.

## Issues Encountered

- Svelte 5 `state_referenced_locally` warning in +page.svelte when using `$derived` value as `$state` initial: fixed by using `page.url.searchParams.get('q')` directly instead of `gridParams.q`

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 18 complete: all three plans (backend filters, URL state utilities, UI integration) are done
- ActivityTable is now fully URL-driven — future feature work (column chooser, saved views) can extend URL params
- The `deferred-items.md` has no items; all pre-existing FormPopover.test.ts TypeScript errors were known before this phase

## Self-Check: PASSED

All files confirmed on disk. All commits confirmed in git history.

---
*Phase: 18-server-side-pagination-filtering-with-data-mode-toggle*
*Completed: 2026-02-28*
