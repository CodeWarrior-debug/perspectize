# Adding a Column to the AG Grid Table

Decision guide for adding a new column to the ActivityTable AG Grid.

This guide used to point at symbols that no longer exist and describe a
two-tier responsive effect that had grown to four tiers with no test
comparing it to the real one — see the UI gap audit (`.docs/UI_GAP_AUDIT.md`
gap #1) for how that let the Category column ship with no way to show it.
The [UI thoroughness checklist](../../.docs/UI_THOROUGHNESS_CHECKLIST.md) has
the general version of this list, covering every surface a column can touch,
not just the grid; this file is the grid-specific how-to.

**`grid-config.ts`'s `COLUMNS` array is the single source of truth** for
everything below except the AG Grid `ColDef` itself (sizing, renderers,
filter UI type, tooltips) — the column picker, sort picker, server/client
sort maps, URL filter keys, and filter-chip labels are all *derived* from
one `ColumnMeta` entry per column, not five separately hand-maintained
lists. Forgetting a step below now means the derived export is simply
missing that colId (still visible immediately in the picker/sort-picker
UI), not a silent, separately-drifting list — see `.docs/UI_THOROUGHNESS_CHECKLIST.md`
§3.1 for why this replaced the older multi-registry design.

## Key files

| File | Purpose |
|------|---------|
| `frontend/src/lib/components/ActivityTable.svelte` | Column definitions (`columnDefs`), the responsive `$effect`, click/hover handlers |
| `frontend/src/lib/utils/formatting.ts` | Cell renderers, value formatters, value getters |
| `frontend/src/lib/utils/activityTooltipSpecs.ts` | Hover-popover specs (`ACTIVITY_TOOLTIP_SPECS`) |
| `frontend/src/lib/utils/grid-config.ts` | `COLUMNS`/`ColumnMeta` — the single source of truth. `DATA_COLUMNS`/`INTERNAL_COLUMNS` (column picker), `SORTABLE_COLUMNS`/`SORT_VALUE_GETTERS` (sort picker + client-side sort), `COL_TO_SORT`/`SORT_TO_COL` (server sort), `COL_TO_FILTER_KEY`/`COLUMN_LABELS` (URL filter keys + filter-chip labels), `compareContentBySorts`/`filterContentRows` — all derived from `COLUMNS` |
| `frontend/src/lib/utils/gridUrlState.ts` | Re-exports `COL_TO_SORT`/`SORT_TO_COL`/`COL_TO_FILTER_KEY` from `grid-config.ts`; owns `urlParamsToGraphQLFilter` and URL (de)serialization |
| `frontend/src/lib/components/FilterChips.svelte` | Imports `COLUMN_LABELS` from `grid-config.ts` for filter-chip text |
| `frontend/src/lib/components/ColumnPickerDialog.svelte` | Renders `DATA_COLUMNS`/`INTERNAL_COLUMNS` |
| `frontend/src/lib/components/SortPickerDialog.svelte` | Renders `SORTABLE_COLUMNS` |
| `frontend/src/lib/components/ActivityCardList.svelte` | Mobile card view — has its own, much smaller field list |
| `frontend/src/lib/components/ActivityDetailsModal.svelte` | Details modal — also has its own field list |
| `frontend/src/lib/queries/content/index.ts` | GraphQL query fields and the `ContentItem` TypeScript interface |
| `frontend/tests/unit/grid-config.test.ts`, `gridUrlState.test.ts`, `formatting.test.ts` | Unit tests for the above |
| `frontend/tests/unit/column-registry-parity.test.ts`, `column-label-parity.test.ts` | Parity guards — read the real `columnDefs`/`headerName`s from source and fail if `COLUMNS` drifts from them (kept as a belt-and-suspenders check even though the single source makes cross-registry drift structurally impossible — see "Registries a column must be added to" below) |
| `backend/schema.graphql` | GraphQL schema (if new field, or a new `ContentSortBy`/`ContentFilter` value) |
| `backend/internal/core/domain/content.go`, `pagination.go` | Domain model / sort enum (if new field or sortable) |
| `backend/internal/adapters/repositories/postgres/helpers.go` | Sort rules for JSONB-derived and DB-column fields |
| `backend/migrations/` | Database migrations (if new persisted field) |

---

## Decision 1: does this need backend changes?

This is the most important decision — it determines whether the work is frontend-only or full-stack.

```
Is the field already in the ContentItem TypeScript interface?
├── YES → Is it already in the LIST_CONTENT GraphQL query
│         (frontend/src/lib/queries/content/index.ts)?
│   ├── YES → FRONTEND-ONLY (skip to Decision 2)
│   └── NO → Add field to LIST_CONTENT's selection set, then FRONTEND-ONLY
│
└── NO → Where does the data live?
    │
    ├── COMPUTED from existing fields (e.g. percentLiked from viewCount/likeCount)
    │   → FRONTEND-ONLY: use valueGetter, no backend needed for the column
    │   itself — but see Decision 5 if it should also sort server-side.
    │
    ├── IN the YouTube API response JSONB (already stored, just not exposed)
    │   → BACKEND: JSONB EXTRACTION (no migration)
    │   Steps:
    │   1. Add field to Content type in schema.graphql
    │   2. Add virtual field to GORM model (gorm:"-" tag) — see the
    │      ViewCount/LikeCount/PercentLiked pattern in gorm_models.go
    │   3. Add SQL extraction path in helpers.go
    │   4. Add field to GraphQL resolver if not auto-resolved
    │   5. Run make graphql-gen
    │   6. Add field to ContentItem TS interface
    │   7. Add field to LIST_CONTENT query
    │
    ├── NEEDS a new database column (data not in JSONB, not computable)
    │   → BACKEND: FULL STACK (migration required)
    │   Steps:
    │   1. Create migration in backend/migrations/
    │   2. Add field to domain.Content struct
    │   3. Add field to GORM ContentModel
    │   4. Update mappers (gorm_mappers.go)
    │   5. Add field to Content type in schema.graphql
    │   6. Run make graphql-gen
    │   7. Add field to ContentItem TS interface
    │   8. Add field to LIST_CONTENT query
    │
    └── NOT SURE where the data is
        → Check: backend/migrations/000001_create_content.up.sql for DB columns
        → Check: YouTube API response structure in the response JSONB
        → Example JSONB paths:
          viewCount:    response->'items'->0->'statistics'->>'viewCount'
          likeCount:    response->'items'->0->'statistics'->>'likeCount'
          publishedAt:  response->'items'->0->'snippet'->>'publishedAt'
          channelTitle: response->'items'->0->'snippet'->>'channelTitle'
          tags:         response->'items'->0->'snippet'->'tags'
          description:  response->'items'->0->'snippet'->>'description'

          Percent-liked-style computed rules (division, CASE) also live in
          helpers.go's contentSortRule() — see the PERCENT_LIKED case for the
          NULLIF/CASE pattern for a rate that can divide by zero or be
          missing.
```

### Backend files touched per scenario

| Scenario | Files |
|----------|-------|
| **Frontend-only** | None |
| **JSONB extraction** | `schema.graphql`, `gorm_models.go`, `helpers.go`, resolver file for the domain (maybe), `gqlgen.yml` (maybe) |
| **New DB column** | All of the above + `migrations/`, `domain/content.go`, `gorm_mappers.go` |

---

## Decision 2: column properties

| Property | Decision | Options |
|----------|----------|---------|
| **`colId`** | Unique identifier | Lowercase camelCase string |
| **`field`** | Maps to `ContentItem` property | Must match TS interface field, or omit if using `valueGetter` |
| **`headerName`** | Display text | Short label — this is the label every other registry below should match (see "One label everywhere") |
| **`headerTooltip`** | Hover text | Longer description |
| **`context: { tooltipSpec }`** | Cell hover popover (#390) | Omit for the default (displayed text + copy of raw value); `false` to opt out; `{ text, copyValue }` to override display/copy; `{ mode: 'multi', items, emptyText }` for chip lists; add the spec to `ACTIVITY_TOOLTIP_SPECS` |

---

## Decision 3: sizing strategy

| Option | When to use | Example |
|--------|-------------|---------|
| **`width: Npx`** | Fixed-width data (dates, numbers, short text) | `width: 100` (views, likes) |
| **`flex: N`** | Flexible-width that fills available space | `flex: 2` (item name) |
| **`minWidth`** | Floor width when using flex | — |
| **`maxWidth`** | Cap width for flex columns | — |

The grid is capped at `max-w-screen-xl` on the Activity page — `headerMinWidth`
(`formatting.ts`) sums to just under that. A new column's minimum width
counts against that budget; check it doesn't push the total over and clip
the last column (see `frontend/CLAUDE.md`'s "Column minimum widths" gotcha).

---

## Decision 4: renderer or formatter?

| Need | Solution | Where | Existing to reuse |
|------|----------|-------|--------------------|
| Plain text/number | None needed | — | — |
| Number formatting (1.2K) | `valueFormatter` | `formatting.ts` | `formatCount` |
| Date formatting | `valueFormatter` | `formatting.ts` | `dateValueFormatter`, `formatPublishDate` |
| Array to string | `valueFormatter` | `formatting.ts` | `formatTags` |
| Truncated text | `valueFormatter` | `formatting.ts` | `truncateDescription` |
| Computed from multiple fields | `valueGetter` | inline or `formatting.ts` | `durationValueGetter`, `percentLikedValueGetter` |
| Rich HTML (images, links, icons) | `cellRenderer` returning `HTMLElement` | `formatting.ts` | `itemCellRenderer`, `typeCellRenderer`, `categoryCellRenderer` |

**Use theme tokens, not hex colours.** A renderer that sets `style.color`/
`style.cssText` directly (not through Tailwind classes) must use
`var(--color-*)` — see `frontend/CLAUDE.md`'s "Grid colours come from theme
tokens" gotcha. `grid-theme.ts` (`GRID_THEME_PARAMS`) is unit-tested to
contain no raw colours; a renderer's inline styles aren't covered by that
test, so check by eye against a dark preset.

If creating a **new** formatter, value getter or renderer, add it to
`formatting.ts` and add tests (see Testing, below).

---

## Decision 5: sortable?

First decide whether it needs to sort **server-side** ("All Items" mode) or
only **client-side** (the default "Loaded" mode and the mobile card list —
client sorting is required, server sorting is optional):

**Client-side only** (e.g. a value computed purely from other loaded fields):
1. Column def: `sortable: true`, with a `comparator` if the raw grid value
   isn't directly comparable.
2. In `grid-config.ts`'s `COLUMNS` array, set `sortable: true` and a
   `sortValue: (row) => value` on the column's `ColumnMeta` entry (feeds the
   sort picker, the mobile "Edit sorts" dialog, and `compareContentBySorts`,
   used for Loaded-mode client sort and the mobile card list, which has no
   grid of its own).
3. Do **not** set `serverSort` — a `ColumnMeta` entry with `sortable: true`
   but no `serverSort` is intentionally left out of `COL_TO_SORT`, and
   `sortsToGraphQL` silently drops any colId missing from it, so in "All
   Items" mode the sort has no effect. Leave a comment saying so on the
   entry (see `percentLiked`'s entry for the pattern), or the next reader
   will assume it's a bug.

**Server-side too** (needs a real backend sort, e.g. it's a persisted
column, or the client-only limitation above isn't acceptable):
1. Everything in "client-side only" above.
2. Add a value to `enum ContentSortBy` in `schema.graphql`.
3. Add the matching constant to `ContentSortBy` in `domain/pagination.go`.
4. Add a case to `contentSortRule()` in `helpers.go` — for a JSONB or
   computed field, this is where the SQL expression goes (see the
   `PERCENT_LIKED` case for a division that can be zero/NULL).
5. Set `serverSort: 'BACKEND_ENUM_VALUE'` on the same `ColumnMeta` entry in
   `grid-config.ts` — this feeds both `COL_TO_SORT` and (reversed)
   `SORT_TO_COL`. If two colIds ever share a `serverSort` value, `SORT_TO_COL`
   keeps whichever appears first in `COLUMNS`, so order matters (see the
   `NAME`/`type` vs `item` comment in `grid-config.ts`).
6. If the field itself is new, `make graphql-gen` per Decision 1.

---

## Decision 6: filterable?

If yes:

1. Choose the AG Grid filter type: `agTextColumnFilter` (text/string) or
   `agNumberColumnFilter`/`agDateColumnFilter` (numeric/date).
2. Set it in the column def (`filter: 'agTextColumnFilter'`); the grid
   provides its own filter menu, no `floatingFilter` needed for this table.
3. In `grid-config.ts`'s `COLUMNS` array, set `filterKey: 'urlKey'` on the
   column's `ColumnMeta` entry — this is what the URL `f.<urlKey>=` param and
   `filterToUrlParams`/`urlParamsToFilter` (re-exported from `gridUrlState.ts`)
   use to round-trip the filter through the URL (needed for "All Items" mode,
   and for the filter to survive a page reload in either mode). Also set
   `filterRange: 'number'` or `'date'` if it's a range filter, so it lands
   in `NUMBER_RANGE_COLS`/`DATE_RANGE_COLS`.
4. Add a case to `urlParamsToGraphQLFilter`'s switch (`gridUrlState.ts`) if
   the filter should apply server-side in "All Items" mode (most
   numeric/date filters do; text filters usually map to a `ContentFilter`
   field the backend already supports — check `ContentFilter` in
   `schema.graphql` first).
5. Make sure `label` on the same `ColumnMeta` entry is non-empty and matches
   the column's `headerName` — that's what feeds `COLUMN_LABELS`, used by
   `FilterChips.svelte` (see "One label everywhere," below).

**Note:** free-text search (the page's search box) and column filters are
two separate mechanisms — `q`/`qFields` vs `f.*`. Don't route a column
filter through `search`; gap #10 in the UI gap audit was exactly that
mistake (an `f.item` filter silently overwrote the search box's value and
field scope).

---

## Decision 7: search scope?

If the column's text should be matchable from the page-level search box (not
just its own column filter):

1. Confirm the backend has a matching `ContentSearchField` enum value
   (`schema.graphql`) — search scope can only cover fields the backend
   indexes.
2. Add the scope to `SearchScopeKey`/`ALL_SEARCH_SCOPES` in
   `gridUrlState.ts`, and `SCOPE_TO_GQL_FIELD`.
3. Add a label to `SCOPE_LABELS` in `frontend/src/routes/+page.svelte` (the
   search-field-scope popover).

---

## Decision 8: visibility (the column picker)

| Decision | Setting |
|----------|---------|
| Visible by default at desktop width | `hide: false` (or omit) |
| Hidden by default (shown via the column picker) | `hide: true` |

**Every togglable column must be added to `DATA_COLUMNS` (or
`INTERNAL_COLUMNS` for admin-only columns) in `grid-config.ts`.** This is
the column picker's own list of what it offers — it is a hand-written list,
*not* derived from `columnDefs`, so a column left out of it is simply never
offered, with no error and no warning. This is exactly what happened to the
Category column (UI gap audit, gap #1): it had a real colDef and showed at
some responsive tiers, but wasn't in `DATA_COLUMNS`, so it could never be
hidden or re-shown once hidden.

`tests/unit/column-registry-parity.test.ts` reads every `colId` out of
`ActivityTable.svelte`'s source and fails if one is missing from
`DATA_COLUMNS`/`INTERNAL_COLUMNS` (except the always-visible `item` and
`perspectize`) — **this is the test that should fail if you skip this
step**. If it doesn't fail, the test itself needs updating first.

### Responsive visibility (the `$effect` override)

**IMPORTANT:** column visibility is controlled in **two** places that must
stay in sync:

1. **`hide: true`** in the colDef — the initial default.
2. **The responsive `$effect`** in `ActivityTable.svelte` — overrides
   visibility on every breakpoint change, and always wins once it runs
   (it runs on every `gridReady`, including after a grid remount — see
   `frontend/CLAUDE.md`'s "Grid remount gotcha").

The effect uses **four** tiers, not two — `xs` (<445px), `sm` (445–639px),
`md` (640–899px), `lg` (900px+ — desktop) — each with its own list:

```typescript
const alwaysVisible = ['item', 'type', 'perspectize']; // every tier
const smCols = ['category', 'channel'];                // sm and wider
const mdCols = ['duration', 'publishDate'];             // md and wider
const lgCols = ['views', 'likes', 'percentLiked', 'tags']; // lg only
const alwaysHidden = ['description'];                   // never shown by the tier system
// createdAt/updatedAt/id/addedByUserID/url stay hidden via their colDef
// `hide: true` until the user (or, for the admin-only ones, an admin)
// enables them in the column picker.
```

Add the new column to exactly one of `alwaysVisible`/`smCols`/`mdCols`/
`lgCols`/`alwaysHidden`, based on which screen widths should show it by
default. A column that's meant to be picker-only (never shown by the
responsive tiers, only when the user turns it on) doesn't need to appear in
any of these lists — its colDef `hide: true` is then the whole story, same
as `createdAt`/`updatedAt`/the admin-only columns.

---

## Decision 9: column position

Insert the `ColDef` in the `columnDefs` array at the desired position.
Current order: perspectize (action), item (name + thumbnail), type, category
(hidden), duration, views, likes, percentLiked, publishDate, channel, tags,
description (hidden), updatedAt (hidden), createdAt (hidden), then the
admin-only id/addedByUserID/url (all hidden).

---

## One label everywhere

A column's label shows up in up to five places, and they used to disagree
(UI gap audit, gap #9 — e.g. the grid header said "Date" while the column
picker and sort picker said "Published"). Use the **grid header's
`headerName`** as the canonical label, and set it **once** as `label` on the
column's `ColumnMeta` entry in `grid-config.ts`'s `COLUMNS` array — every
other place derives from that single field:

- `DATA_COLUMNS`/`INTERNAL_COLUMNS` (column picker)
- `SORTABLE_COLUMNS` (sort picker)
- `COLUMN_LABELS`, imported by `FilterChips.svelte` (filter chips)
- `ActivityDetailsModal.svelte`'s own field labels, if the field is shown
  there — this one is still a separate, hand-written list, not derived from
  `COLUMNS`

`tests/unit/column-label-parity.test.ts` reads `headerName` out of
`ActivityTable.svelte`'s source and fails if `COLUMNS`' `label` disagrees
with it for any shared colId — kept as a belt-and-suspenders check even
though a single `label` field makes the derived exports disagreeing with
*each other* structurally impossible; it still catches `COLUMNS` disagreeing
with the actual `headerName` in the colDef.

---

## Registries a column must be added to — checklist

Copy this into the PR when adding a column (frontend-only columns can skip
the backend rows):

- [ ] `columnDefs` in `ActivityTable.svelte` (colId, headerName, sizing, filter/sort/hide)
- [ ] Renderer/formatter in `formatting.ts`, using theme tokens if it sets colour
- [ ] Tooltip spec in `activityTooltipSpecs.ts` (or an explicit opt-out)
- [ ] The responsive `$effect`'s tier lists
- [ ] One `ColumnMeta` entry added to `COLUMNS` in `grid-config.ts`, with:
  - [ ] `picker: 'data'` or `'admin'` (column picker) — **the #1 thing this guide used to miss**, back when this was a separately hand-maintained list
  - [ ] `label` matching the colDef's `headerName` (see "One label everywhere")
  - [ ] `sortable: true` + `sortValue`, if sortable (sort picker + client-side sort)
  - [ ] `serverSort`, if sortable server-side (`gridUrlState.ts`'s `COL_TO_SORT`/`SORT_TO_COL`)
  - [ ] `filterKey` (+ `filterRange` if a number/date range), if filterable — feeds the URL `f.*` param and `urlParamsToGraphQLFilter`
- [ ] Search scope (`SearchScopeKey`, `SCOPE_TO_GQL_FIELD`, `SCOPE_LABELS`), if searchable
- [ ] `ActivityCardList.svelte` and `ActivityDetailsModal.svelte`, if the column should also appear on mobile cards / the details modal — both have their own, separate field lists, not derived from `COLUMNS`
- [ ] Tests updated (see Testing, below) and both parity tests still pass

---

## Testing

### Frontend tests to update

**`frontend/tests/unit/formatting.test.ts`** — if you added a new formatter, value getter, or renderer:
- Add test cases covering normal values, null/undefined, and edge cases.
- Renderers that return `HTMLElement` — test innerHTML/textContent of the returned element.

**`frontend/tests/unit/grid-config.test.ts`** — if you touched `DATA_COLUMNS`/`INTERNAL_COLUMNS`/`SORTABLE_COLUMNS`/`SORT_VALUE_GETTERS`/`compareContentBySorts`.

**`frontend/tests/unit/gridUrlState.test.ts`** — if you touched `COL_TO_SORT`/`SORT_TO_COL`/`COL_TO_FILTER_KEY`/`urlParamsToGraphQLFilter`.

**`frontend/tests/unit/column-registry-parity.test.ts`, `column-label-parity.test.ts`** — these should already fail (and then pass again once you've made the change) if you added a togglable column or changed a label; you shouldn't need to edit them directly.

**`frontend/tests/components/ActivityTable.test.ts`** — limited by JSDOM (AG Grid doesn't fully render); add tests for any new props or state logic.

### Backend tests to update (if backend changes were needed)

**`backend/internal/adapters/repositories/postgres/helpers_test.go`** — if you added a sortable field, add a case to `TestBuildContentSortRules` (and `TestBuildContentSortRulesMulti` if it should compose with other sorts).

**`backend/test/domain/content_test.go`** — if you added a new domain field, add a test verifying it exists and handles zero/nil values.

**`backend/test/resolvers/content_resolver_test.go`** — if you added a sortable/filterable field, add a case for sorting and (if applicable) filtering by it.

---

## Quick reference: minimal frontend-only column

For a field that already exists in `ContentItem`, sortable client-side only, no backend changes:

```typescript
// In columnDefs array (ActivityTable.svelte)
{
  colId: 'commentCount',
  field: 'commentCount',
  headerName: 'Comments',
  headerTooltip: 'Comment count',
  width: 100,
  sortable: true,
  filter: 'agNumberColumnFilter',
  hide: true,
  valueFormatter: (params: ValueFormatterParams) => formatCount(params.value),
  // Omit for the default popover, or reference a spec from ACTIVITY_TOOLTIP_SPECS
  context: { tooltipSpec: ACTIVITY_TOOLTIP_SPECS.commentCount },
},
```

```typescript
// grid-config.ts — one ColumnMeta entry in the COLUMNS array, in columnDefs order
{
  colId: 'commentCount',
  label: 'Comments',       // must match headerName above — feeds column
                            // picker, sort picker, and FilterChips labels
  picker: 'data',
  sortable: true,
  sortValue: (row) => row.commentCount,
  filterKey: 'comments',   // URL f.comments= param
  filterRange: 'number',
},
```

No edits needed in `gridUrlState.ts` or `FilterChips.svelte` — `COL_TO_FILTER_KEY`,
`NUMBER_RANGE_COLS`, and `COLUMN_LABELS` are all derived from `COLUMNS`.

Then update `formatting.test.ts` if reusing an existing formatter with new edge cases.

---

## Verification

After adding a column:
1. `pnpm run test:run` in `frontend/` — all tests pass, including the two parity tests.
2. Visual check: the column renders correctly at all four responsive tiers, in the column picker, and (if filterable/sortable) in the filter chips and sort picker.
3. If sortable: verify sort works in both "Loaded" and "All Items" mode (check the network tab for the GraphQL `sorts` variable in All-Items mode).
4. If filterable: verify the filter works and survives a page reload (URL `f.*` param).
5. If backend changes: `go build ./...` and `go test ./...` in `backend/`.
