# Phase 18: Server-Side Pagination & Filtering with Data Mode Toggle - Research

**Researched:** 2026-02-26
**Domain:** AG Grid ClientSideRowModel mode switching, SvelteKit URL state management, GORM JSONB filtering, cursor-based pagination
**Confidence:** HIGH

## Summary

This phase adds a data mode toggle to ActivityTable that switches between "All Items" (server-side sort/filter/search) and "Loaded X Items" (client-side sort/filter/search). The research covers five key domains: AG Grid's ability to suppress client-side sorting/filtering while keeping the ClientSideRowModel, SvelteKit URL search param patterns with Svelte 5 runes, AG Grid filter model serialization, GORM JSONB filtering in PostgreSQL, and cursor-to-page-number mapping.

**Primary recommendation:** Keep ClientSideRowModel for both modes. In "All Items" mode, dynamically update column definitions to set `sortable: false` and `filter: false`, intercept sort/filter events, route them to server via TanStack Query, and display pre-sorted/pre-filtered data from the server. Use `goto()` with `replaceState: true` for URL state sync with `$app/state` page object for reactive reads.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Data Mode Toggle Labels:** "All Items" (server-side) and "Loaded X Items" with dynamic count (client-side)
- **Default mode:** "Loaded Items" (client-side) -- preserves current behavior
- **Toggle location:** Pagination bar area, near total count display
- **URL structure:** `/activity?mode=all&sort=views&dir=desc&page=2&f.type=youtube&f.views=1000..&q=cooking`
- **URL sync behavior:** `replaceState` for filter/sort/search changes; `goto` for page changes
- **Pagination:** Cursor-based under the hood with page numbers in URL; 1-indexed in URL; "Jump to page" not supported in v1
- **Server-side filter columns:** All 11 columns mapped in CONTEXT.md table (Item, Type, Length, Views, Likes, Publish Date, Channel, Tags, Description, Date Added, Updated)
- **New sort fields:** CHANNEL_TITLE and LENGTH
- **New ContentFilter fields:** minViewCount, maxViewCount, minLikeCount, maxLikeCount, publishedAfter, publishedBefore, channelTitle, tagContains, descriptionSearch, createdAfter, createdBefore, updatedAfter, updatedBefore
- **Client-side mode uses AG Grid Quick Filter** (`api.setGridOption('quickFilterText', ...)`) for page-level search

### Claude's Discretion
- Implementation details for mode switching (grid re-initialization vs dynamic column defs)
- Specific debounce timings and UX micro-interactions
- Internal state management patterns (URL-first vs state-first)

### Deferred Ideas (OUT OF SCOPE)
- Database optimization / indexing (Phase 11)
- Jump-to-page functionality
- Server-Side Row Model migration
</user_constraints>

## 1. AG Grid Client-Side vs Server-Side Filtering Coexistence

### Approach: Keep ClientSideRowModel, Disable Its Features in "All Items" Mode

**Confidence: HIGH** (verified via AG Grid official docs)

AG Grid does NOT have a `suppressClientSideSort` or `suppressClientSideFilter` grid option. The approach is to dynamically toggle column-level properties.

### Dynamic Column Definition Updates

AG Grid supports updating column definitions at runtime via `api.setGridOption('columnDefs', newDefs)`. When updating:
- All non-"Initial" properties can be changed
- Existing column state (widths, pinned, etc.) is preserved
- Column events fire as expected

**Pattern for mode switching:**

```typescript
// Generate column defs based on mode
function getColumnDefs(mode: 'all' | 'loaded'): ColDef<ContentItem>[] {
  const baseDefs = [...]; // base column definitions

  if (mode === 'all') {
    return baseDefs.map(col => ({
      ...col,
      // In "All Items" mode: disable AG Grid's built-in sort/filter
      // Sort/filter events still fire -- we intercept them for server-side routing
      filter: false,  // Remove filter UI (server handles filtering)
      sortable: true,  // Keep sort UI clickable (we intercept onSortChanged)
    }));
  }
  return baseDefs; // "Loaded Items" mode: use standard client-side behavior
}

// Apply when mode changes
$effect(() => {
  if (gridApi) {
    gridApi.setGridOption('columnDefs', getColumnDefs(dataMode));
  }
});
```

**Source:** [AG Grid: Updating Column Definitions](https://www.ag-grid.com/javascript-data-grid/column-updating-definitions/)

### Sort Interception Strategy

In both modes, `onSortChanged` fires when the user clicks a column header. The existing handler already maps AG Grid colIds to GraphQL `ContentSortBy` values via `SORT_FIELD_MAP`. The key difference by mode:

- **"Loaded Items" mode:** AG Grid sorts client-side first; `onSortChanged` also updates server-side sort for next fetch (current behavior).
- **"All Items" mode:** `onSortChanged` updates URL params and triggers TanStack Query refetch; AG Grid receives pre-sorted data and displays as-is.

No special interception needed -- the current `onSortChanged` pattern works for both modes. The server returns data in the correct order, and AG Grid displays it because the `sortModel` on the grid matches.

### Filter Interception in "All Items" Mode

In "All Items" mode, set `filter: false` on all columns to remove AG Grid filter UI. Instead, provide a separate filter UI (or custom header components) that update URL params directly. When the URL params change, TanStack Query refetches with the new filter, and AG Grid receives pre-filtered data.

**Alternative (not recommended):** Keep AG Grid filter UI active and use `onFilterChanged` to extract the filter model and route to server. This adds complexity because AG Grid will try to client-side filter the data too. Disabling AG Grid's client-side filtering while keeping filter UI requires `isExternalFilterPresent` returning `true` and `doesExternalFilterPass` always returning `true`, which is a hack.

**Recommended approach:** In "All Items" mode, hide AG Grid column filters (`filter: false`) and provide URL-driven filter controls in the pagination bar or a filter sidebar. This is cleaner and avoids fighting AG Grid's client-side filter pipeline.

### External Filter API (for reference)

`isExternalFilterPresent` and `doesExternalFilterPass` are Client-Side Row Model only. They work alongside (not instead of) AG Grid's column filters. If you want AG Grid to skip its own filtering and defer to external logic:

```typescript
// Make all rows pass AG Grid's client-side filter
isExternalFilterPresent: () => false, // No external filter active
// Combined with filter: false on columns = no client-side filtering at all
```

**Source:** [AG Grid: External Filter](https://www.ag-grid.com/javascript-data-grid/filter-external/)

### Quick Filter for Client-Side Search

In "Loaded Items" mode, use AG Grid Quick Filter for the page-level search input:

```typescript
// In "Loaded Items" mode, route search to AG Grid Quick Filter
$effect(() => {
  if (gridApi && dataMode === 'loaded') {
    gridApi.setGridOption('quickFilterText', searchText);
  }
});
```

Quick Filter splits text into words and matches case-insensitively across all columns. It only works with ClientSideRowModel.

**Source:** [AG Grid: Quick Filter](https://www.ag-grid.com/javascript-data-grid/filter-quick/)

## 2. SvelteKit URL Search Params

### Reading URL Params Reactively

**Confidence: HIGH** (verified via SvelteKit official docs)

SvelteKit ^2.52.2 supports `$app/state` (Svelte 5 runes). The project currently does not use `$app/state` or `$app/stores` -- this will be the first usage.

```typescript
import { page } from '$app/state';

// IMPORTANT: page.url reactivity bug in $app/state
// Workaround: access page.state to trigger reactivity on page.url
const sortParam = $derived.by(() => {
  page.state; // force reactivity trigger
  return page.url.searchParams.get('sort') ?? 'updatedAt';
});
```

**Known bug (Issue #13187):** `page.url` derived values may not update when using `$app/state`. The workaround is to access `page.state` inside the `$derived.by` callback to force reactivity. This is a known SvelteKit issue as of early 2025.

**Alternative (safer):** Use the deprecated `$app/stores` which has proven reactivity:

```typescript
import { page } from '$app/stores';

const sortParam = $derived($page.url.searchParams.get('sort') ?? 'updatedAt');
```

**Recommendation:** Use `$app/state` with the `page.state` workaround. The project uses Svelte 5 exclusively, and `$app/stores` is deprecated. If the workaround proves unreliable during implementation, fall back to `$app/stores`.

**Source:** [SvelteKit: $app/state](https://svelte.dev/docs/kit/$app-state), [Issue #13187](https://github.com/sveltejs/kit/issues/13187)

### Writing URL Params

Use `goto()` from `$app/navigation` for URL updates:

```typescript
import { goto } from '$app/navigation';

function updateUrlParams(params: Record<string, string | undefined>) {
  const url = new URL(window.location.href);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, value);
    }
  }

  // replaceState: no history entry (for filter/sort changes)
  goto(url.toString(), {
    replaceState: true,
    noScroll: true,
    keepFocus: true
  });
}

function navigateToPage(pageNum: number) {
  const url = new URL(window.location.href);
  if (pageNum <= 1) {
    url.searchParams.delete('page');
  } else {
    url.searchParams.set('page', String(pageNum));
  }

  // goto (not replaceState): creates history entry for back/forward
  goto(url.toString(), {
    noScroll: true,
    keepFocus: true
  });
}
```

**Full `goto` signature:**

```typescript
function goto(
  url: string | URL,
  opts?: {
    replaceState?: boolean;    // Don't create new history entry
    noScroll?: boolean;        // Don't scroll to top
    keepFocus?: boolean;       // Keep current element focused
    invalidateAll?: boolean;   // Re-run all load functions
    invalidate?: (string | URL | ((url: URL) => boolean))[];
    state?: App.PageState;     // Shallow routing state
  }
): Promise<void>;
```

**Source:** [SvelteKit: $app/navigation](https://svelte.dev/docs/kit/$app-navigation)

### Bidirectional URL <-> State Sync Pattern

**Recommended pattern: URL-first (source of truth is URL)**

```typescript
import { page } from '$app/state';
import { goto } from '$app/navigation';

// --- READ: URL -> State (reactive) ---
const dataMode = $derived.by(() => {
  page.state;
  return (page.url.searchParams.get('mode') ?? 'loaded') as 'all' | 'loaded';
});

const sortField = $derived.by(() => {
  page.state;
  return page.url.searchParams.get('sort') ?? 'updatedAt';
});

const sortDir = $derived.by(() => {
  page.state;
  return (page.url.searchParams.get('dir') ?? 'desc') as 'asc' | 'desc';
});

const currentPage = $derived.by(() => {
  page.state;
  return parseInt(page.url.searchParams.get('page') ?? '1', 10);
});

const searchQuery = $derived.by(() => {
  page.state;
  return page.url.searchParams.get('q') ?? '';
});

// --- WRITE: State -> URL ---
function setSort(field: string, dir: 'asc' | 'desc') {
  const url = new URL(window.location.href);
  url.searchParams.set('sort', field);
  url.searchParams.set('dir', dir);
  url.searchParams.delete('page'); // Reset page on sort change
  goto(url.toString(), { replaceState: true, noScroll: true, keepFocus: true });
}

// --- TanStack Query reads from derived URL state ---
const contentQuery = createQuery(() => ({
  queryKey: queryKeys.content.list({
    sortBy: SORT_FIELD_MAP[sortField],
    sortOrder: sortDir.toUpperCase(),
    search: searchQuery,
    first: pageSize,
    after: cursors[currentPage - 1], // 1-indexed page -> 0-indexed cursor
    filter: buildFilterFromUrl(),
  }),
  queryFn: async () => { /* ... */ },
  enabled: dataMode === 'all', // Only fetch in server-side mode
}));
```

**Important:** `goto()` triggers SvelteKit's load functions if they read `url`. Since this component uses TanStack Query (not SvelteKit load), this is a non-issue -- TanStack Query reacts to `queryKey` changes via the function wrapper pattern.

**Source:** [SvelteKit: goto with replaceState](https://www.programonaut.com/how-to-change-url-query-parameters-without-reload-sveltekit/)

### Avoid `history.replaceState` Directly

SvelteKit warns against using `history.pushState`/`history.replaceState` directly as they conflict with SvelteKit's router. Always use the `goto`, `pushState`, and `replaceState` imports from `$app/navigation`.

**Source:** [SvelteKit: Shallow routing](https://svelte.dev/docs/kit/shallow-routing)

## 3. AG Grid Filter Model Serialization

### Filter Model Structure

**Confidence: HIGH** (verified via AG Grid official docs)

`api.getFilterModel()` returns an object keyed by column ID, where each value describes the active filter:

#### Text Filter Model
```json
{
  "channel": {
    "filterType": "text",
    "type": "contains",
    "filter": "cooking"
  }
}
```

**Type options:** `contains`, `notContains`, `equals`, `notEqual`, `startsWith`, `endsWith`, `blank`, `notBlank`

#### Number Filter Model
```json
{
  "views": {
    "filterType": "number",
    "type": "greaterThan",
    "filter": 1000
  }
}
```

For range:
```json
{
  "views": {
    "filterType": "number",
    "type": "inRange",
    "filter": 1000,
    "filterTo": 5000
  }
}
```

**Type options:** `equals`, `notEqual`, `greaterThan`, `greaterThanOrEqual`, `lessThan`, `lessThanOrEqual`, `inRange`, `blank`, `notBlank`

#### Date Filter Model
```json
{
  "publishDate": {
    "filterType": "date",
    "type": "inRange",
    "dateFrom": "2024-01-01",
    "dateTo": "2024-06-30"
  }
}
```

**Type options:** `equals`, `notEqual`, `greaterThan`, `lessThan`, `greaterThanOrEqual`, `lessThanOrEqual`, `inRange`, `blank`, `notBlank`

Date format is `YYYY-MM-DD` in the model.

#### Combined Conditions
```json
{
  "views": {
    "filterType": "number",
    "operator": "AND",
    "conditions": [
      { "filterType": "number", "type": "greaterThan", "filter": 1000 },
      { "filterType": "number", "type": "lessThan", "filter": 50000 }
    ]
  }
}
```

**Source:** [AG Grid: Filter API](https://www.ag-grid.com/javascript-data-grid/filter-api/), [AG Grid: Text Filter](https://www.ag-grid.com/javascript-data-grid/filter-text/), [AG Grid: Date Filter](https://www.ag-grid.com/javascript-data-grid/filter-date/)

### Filter Model to URL Params Conversion

For Phase 18's URL structure (`f.views=1000..5000`, `f.date=2024-01..2024-06`), the conversion is:

```typescript
// AG Grid filter model -> URL params
function filterModelToUrlParams(model: Record<string, any>): Record<string, string> {
  const params: Record<string, string> = {};

  for (const [colId, filter] of Object.entries(model)) {
    const urlKey = `f.${colId}`;

    if (filter.filterType === 'text') {
      params[urlKey] = filter.filter;
    }

    if (filter.filterType === 'number') {
      if (filter.type === 'inRange') {
        params[urlKey] = `${filter.filter}..${filter.filterTo}`;
      } else if (filter.type === 'greaterThan' || filter.type === 'greaterThanOrEqual') {
        params[urlKey] = `${filter.filter}..`;
      } else if (filter.type === 'lessThan' || filter.type === 'lessThanOrEqual') {
        params[urlKey] = `..${filter.filter}`;
      }
    }

    if (filter.filterType === 'date') {
      if (filter.type === 'inRange') {
        params[urlKey] = `${filter.dateFrom}..${filter.dateTo}`;
      } else if (filter.type === 'greaterThan') {
        params[urlKey] = `${filter.dateFrom}..`;
      } else if (filter.type === 'lessThan') {
        params[urlKey] = `..${filter.dateTo ?? filter.dateFrom}`;
      }
    }
  }

  return params;
}

// URL params -> GraphQL ContentFilter
function urlParamsToContentFilter(params: URLSearchParams): Record<string, any> {
  const filter: Record<string, any> = {};

  const viewsParam = params.get('f.views');
  if (viewsParam) {
    const [min, max] = viewsParam.split('..');
    if (min) filter.minViewCount = parseInt(min, 10);
    if (max) filter.maxViewCount = parseInt(max, 10);
  }

  const dateParam = params.get('f.date');
  if (dateParam) {
    const [after, before] = dateParam.split('..');
    if (after) filter.publishedAfter = after;
    if (before) filter.publishedBefore = before;
  }

  // ... similar for other filter columns
  return filter;
}
```

**Note:** In "All Items" mode, AG Grid column filters are disabled (`filter: false`), so `getFilterModel()` will be empty. The filter state lives in the URL and is parsed directly to GraphQL variables. `getFilterModel()` / `setFilterModel()` are only useful in "Loaded Items" mode for preserving filter state across mode switches.

## 4. GORM JSONB Filtering in PostgreSQL

### Writing WHERE Clauses on JSONB Values with GORM

**Confidence: HIGH** (verified via existing codebase patterns + official GORM docs)

The project already uses raw JSONB extraction in `buildContentSortRules` (see `helpers.go`). The same patterns apply to filters.

#### Existing Pattern (from helpers.go)
```go
// Already used for sorting:
SQLRepr: "(response->'items'->0->'statistics'->>'viewCount')::BIGINT"
SQLRepr: "(response->'items'->0->'statistics'->>'likeCount')::BIGINT"
SQLRepr: "response->'items'->0->'snippet'->>'publishedAt'"
```

#### New Filter Patterns

Use GORM `Where()` with raw SQL expressions:

```go
// In gorm_content_repository.go List() method

// ViewCount filter (JSONB -> BIGINT cast)
if params.Filter.MinViewCount != nil {
    query = query.Where(
        "(response->'items'->0->'statistics'->>'viewCount')::BIGINT >= ?",
        *params.Filter.MinViewCount,
    )
}
if params.Filter.MaxViewCount != nil {
    query = query.Where(
        "(response->'items'->0->'statistics'->>'viewCount')::BIGINT <= ?",
        *params.Filter.MaxViewCount,
    )
}

// LikeCount filter (same pattern)
if params.Filter.MinLikeCount != nil {
    query = query.Where(
        "(response->'items'->0->'statistics'->>'likeCount')::BIGINT >= ?",
        *params.Filter.MinLikeCount,
    )
}

// PublishedAt filter (string comparison works for ISO 8601)
if params.Filter.PublishedAfter != nil {
    query = query.Where(
        "response->'items'->0->'snippet'->>'publishedAt' >= ?",
        *params.Filter.PublishedAfter,
    )
}
if params.Filter.PublishedBefore != nil {
    query = query.Where(
        "response->'items'->0->'snippet'->>'publishedAt' <= ?",
        *params.Filter.PublishedBefore,
    )
}

// ChannelTitle filter (ILIKE for case-insensitive text search)
if params.Filter.ChannelTitle != nil && *params.Filter.ChannelTitle != "" {
    query = query.Where(
        "response->'items'->0->'snippet'->>'channelTitle' ILIKE ?",
        "%"+*params.Filter.ChannelTitle+"%",
    )
}

// Tags filter (search within JSONB array)
// tags are at response->'items'->0->'snippet'->'tags'
// Use jsonb_array_elements_text to search within the array
if params.Filter.TagContains != nil && *params.Filter.TagContains != "" {
    query = query.Where(
        "EXISTS (SELECT 1 FROM jsonb_array_elements_text(response->'items'->0->'snippet'->'tags') AS tag WHERE tag ILIKE ?)",
        "%"+*params.Filter.TagContains+"%",
    )
}

// Description filter (ILIKE)
if params.Filter.DescriptionSearch != nil && *params.Filter.DescriptionSearch != "" {
    query = query.Where(
        "response->'items'->0->'snippet'->>'description' ILIKE ?",
        "%"+*params.Filter.DescriptionSearch+"%",
    )
}

// CreatedAt/UpdatedAt filters (direct columns, not JSONB)
if params.Filter.CreatedAfter != nil {
    query = query.Where("created_at >= ?", *params.Filter.CreatedAfter)
}
if params.Filter.CreatedBefore != nil {
    query = query.Where("created_at <= ?", *params.Filter.CreatedBefore)
}
if params.Filter.UpdatedAfter != nil {
    query = query.Where("updated_at >= ?", *params.Filter.UpdatedAfter)
}
if params.Filter.UpdatedBefore != nil {
    query = query.Where("updated_at <= ?", *params.Filter.UpdatedBefore)
}
```

**Source:** Existing codebase (`helpers.go`) + [GORM: Custom Data Types](https://gorm.io/docs/data_types.html)

### PostgreSQL JSONB Operator Reference

| Operator | Purpose | Example |
|----------|---------|---------|
| `->` | Get JSON object field (returns JSON) | `response->'items'` |
| `->>` | Get JSON object field (returns text) | `response->>'name'` |
| `->N` | Get JSON array element (returns JSON) | `response->'items'->0` |
| `::BIGINT` | Cast text to integer | `(... ->> 'viewCount')::BIGINT` |
| `@>` | Contains (for GIN index) | `response @> '{"key": "val"}'` |

### Performance: JSONB Filtering Without Indexes

**Confidence: MEDIUM** (based on PostgreSQL docs + community patterns)

Without indexes, every JSONB filter requires a sequential scan extracting and comparing values from every row. For the current dataset size (likely <10K rows), this is acceptable. At scale (100K+), it becomes a bottleneck.

#### Index Strategy (Deferred to Phase 11, Documented Here for Reference)

**B-Tree Expression Indexes** -- best for the specific JSONB paths we query:

```sql
-- ViewCount: range queries on extracted integer
CREATE INDEX idx_content_view_count ON content (
  ((response->'items'->0->'statistics'->>'viewCount')::BIGINT)
);

-- LikeCount: range queries on extracted integer
CREATE INDEX idx_content_like_count ON content (
  ((response->'items'->0->'statistics'->>'likeCount')::BIGINT)
);

-- PublishedAt: range queries on extracted timestamp string
CREATE INDEX idx_content_published_at ON content (
  (response->'items'->0->'snippet'->>'publishedAt')
);

-- ChannelTitle: text search on extracted string
CREATE INDEX idx_content_channel_title ON content (
  (response->'items'->0->'snippet'->>'channelTitle')
);
```

**Why B-Tree expression indexes over GIN:**
- GIN indexes support `@>` containment and `?` key-exists operators, NOT `=`, `>`, `<`, `ILIKE`
- Our filters use `->>` extraction + comparison operators, which need B-Tree
- B-Tree expression indexes are ~6x smaller than GIN indexes
- B-Tree supports range scans and sorting, which is exactly what we need
- The WHERE clause must exactly match the index expression

**GIN indexes would be useful for:** Tags array containment (`response @> '{"items": [{"snippet": {"tags": ["cooking"]}}]}'`), but the `jsonb_array_elements_text` + `ILIKE` approach we use for tag search won't benefit from GIN.

**Source:** [pganalyze: GIN Indexes](https://pganalyze.com/blog/gin-index), [Crunchy Data: Indexing JSONB](https://www.crunchydata.com/blog/indexing-jsonb-in-postgres), [PostgreSQL: JSON Types](https://www.postgresql.org/docs/current/datatype-json.html)

### Tags Array Handling

Tags in the YouTube API response are a JSON array at `response->'items'->0->'snippet'->'tags'`. To search within this array:

```sql
-- Check if any tag contains the search text (case-insensitive)
EXISTS (
  SELECT 1
  FROM jsonb_array_elements_text(response->'items'->0->'snippet'->'tags') AS tag
  WHERE tag ILIKE '%cooking%'
)
```

This is a correlated subquery that unnests the array and checks each element. It handles NULL tags (no match) and empty arrays gracefully.

### NULL Handling

JSONB extraction returns NULL when the path doesn't exist. The `::BIGINT` cast on NULL returns NULL. Comparisons with NULL return NULL (falsy), so rows without the field are naturally excluded from filtered results. This is correct behavior -- if a video has no viewCount, it shouldn't match a "views >= 1000" filter.

## 5. gorm-cursor-paginator Page Number Mapping

### Library Capabilities

**Confidence: HIGH** (verified via official README)

`gorm-cursor-paginator` (v2) is purely cursor-based. It does NOT support:
- Offset-based pagination
- Page number queries
- "Jump to page X" functionality

The library returns a `Cursor` struct:

```go
type Cursor struct {
    After  *string  // Cursor for next page
    Before *string  // Cursor for previous page
}
```

**Source:** [gorm-cursor-paginator GitHub](https://github.com/pilagod/gorm-cursor-paginator)

### Existing Frontend Cursor-to-Page Mapping

The current `ActivityTable.svelte` already implements cursor-to-page mapping:

```typescript
let currentPage = $state(0);
let cursors = $state<(string | null)[]>([null]); // Index 0 = first page (no cursor)

// When data loads, store endCursor for next page
if (response.content.pageInfo.hasNextPage && response.content.pageInfo.endCursor) {
    if (cursors.length === currentPage + 1) {
        cursors = [...cursors, response.content.pageInfo.endCursor];
    }
}

// Navigate: use cursors[pageIndex] to fetch that page
let currentCursor = $derived(cursors[currentPage]);
```

This is the correct pattern. The cursors array acts as a page-to-cursor lookup table built incrementally as the user navigates forward.

### Page Number in URL with Cursor Under the Hood

**Pattern:**

```
URL: ?page=3
Internal: cursors = [null, "cursor_for_page_2", "cursor_for_page_3"]
         currentPage = 2 (0-indexed)
         currentCursor = cursors[2] = "cursor_for_page_3"
```

**Challenge:** If a user loads a URL with `?page=3` directly (bookmark/share), the `cursors` array only has `[null]`. We need to sequentially fetch pages 1 and 2 to build up the cursor chain.

**Solutions (in order of preference):**

1. **Sequential fetch on URL load with page > 1:** Fetch page 1 -> get endCursor -> fetch page 2 -> get endCursor -> fetch page 3. This is slow but correct. For v1, acceptable since "Jump to page" is not supported and users mostly navigate sequentially.

2. **Reset to page 1 on direct URL load:** If `cursors` array doesn't have the cursor for the requested page, redirect to page 1. Simple but loses the shared URL's page state.

3. **Encode cursor in URL instead of page number:** URL becomes `?after=abc123` instead of `?page=3`. Correct but ugly URLs and meaningless to users.

**Recommendation:** Option 1 (sequential fetch) for URL loads with page > 1. Wrap in a single `$effect` that detects when `currentPage` from URL exceeds the cursors array and sequentially fetches until caught up. Show a loading state during catch-up. Since v1 doesn't support "Jump to page," most shared URLs will be page 1-5, making the sequential approach fast enough.

```typescript
// Catch-up logic when URL page exceeds known cursors
$effect(() => {
  const targetPage = urlPage; // from URL params, 1-indexed
  if (targetPage > cursors.length) {
    // Need to fetch pages sequentially to build cursor chain
    // This triggers contentQuery for page 1, then 2, etc.
    // TanStack Query cache means already-visited pages are instant
    catchUpToPage(targetPage);
  }
});
```

### "Page X of Y" Display

`totalCount` is already fetched from the backend (`includeTotalCount: true`). Page count = `Math.ceil(totalCount / pageSize)`. The current code already displays `Page {currentPage + 1} of {Math.ceil(totalCount / pageSize) || 1}`.

## Architecture Patterns

### Recommended State Flow

```
URL (source of truth)
  |
  v
$derived values (sortField, sortDir, filters, page, mode, searchQuery)
  |
  +--> "All Items" mode: TanStack Query fetches with server params
  |     |
  |     v
  |     AG Grid displays pre-sorted/filtered data (no client-side processing)
  |
  +--> "Loaded Items" mode: TanStack Query fetches with basic params
        |
        v
        AG Grid handles sort/filter/search client-side
```

### File Organization

```
frontend/src/lib/
  utils/
    url-params.ts          # URL param read/write utilities
    filter-mapping.ts      # AG Grid filter model <-> URL params <-> GraphQL filter
  components/
    ActivityTable.svelte   # Updated with mode toggle + URL-driven state
    DataModeToggle.svelte  # "All Items" / "Loaded X Items" toggle component
```

### Backend Changes

```
backend/
  schema.graphql                    # Updated ContentFilter + new sort enum values
  internal/core/domain/
    pagination.go                   # Extended ContentFilter struct
  internal/adapters/repositories/
    postgres/
      gorm_content_repository.go    # Extended filter WHERE clauses
      helpers.go                    # New sort rules for CHANNEL_TITLE, LENGTH
  internal/adapters/graphql/
    resolvers/
      schema.resolvers.go          # Map new filter fields to domain
```

### Anti-Patterns to Avoid

- **Do NOT switch to Server-Side Row Model:** The SSRM requires an AG Grid Enterprise license and is architecturally different. The ClientSideRowModel with disabled features approach is simpler and free.
- **Do NOT use `history.replaceState` directly:** Conflicts with SvelteKit router. Always use `goto()` or SvelteKit's `replaceState`.
- **Do NOT keep separate state AND URL:** URL is the single source of truth. Component state is derived from URL. Writing state writes to URL, which triggers reactive reads.
- **Do NOT use `gorm.io/datatypes` JSONQuery for complex JSONB filters:** The existing raw SQL pattern (`response->'items'->0->...`) is clearer and already established in the codebase.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cursor pagination | Custom offset-to-cursor mapping | gorm-cursor-paginator (existing) | Already integrated, handles edge cases |
| URL param encoding | Custom serialization | URLSearchParams API + simple `..` range syntax | Browser-native, well-tested |
| Filter debouncing | Custom timer management | Simple `setTimeout`/`clearTimeout` pattern (existing) | Already in codebase, works well |
| GraphQL code generation | Manual resolver types | gqlgen `make graphql-gen` (existing) | Schema-first, type-safe |

## Common Pitfalls

### Pitfall 1: AG Grid Double-Sorting in "All Items" Mode
**What goes wrong:** Server returns data sorted by views DESC, but AG Grid also sorts client-side, potentially reordering.
**Why it happens:** If `sortable: true` is set and AG Grid's sort state matches the column, it applies client-side sort on top.
**How to avoid:** In "All Items" mode, after setting rowData, ensure AG Grid's sort model matches the server sort so it's a no-op. Or use `postSortRows` to restore server order.
**Warning signs:** Data order differs between first render and after sort state applies.

### Pitfall 2: SvelteKit `page.url` Reactivity in `$app/state`
**What goes wrong:** `$derived` values from `page.url.searchParams` don't update when URL changes.
**Why it happens:** Known Svelte 5 / SvelteKit bug (Issue #13187) -- `page.url` is not deeply reactive in `$app/state`.
**How to avoid:** Access `page.state` inside `$derived.by()` to force reactivity trigger.
**Warning signs:** UI doesn't update after `goto()` with new params.

### Pitfall 3: Cursor Array Invalidation on Filter/Sort Change
**What goes wrong:** Cursors from a previous sort/filter state are used with new sort/filter params, returning wrong results.
**Why it happens:** Cursor encodes row position under a specific sort/filter context.
**How to avoid:** Reset `cursors = [null]` and `currentPage = 0` whenever sort, filter, or search changes. The existing code already does this for sort/filter changes.
**Warning signs:** Page 2 shows unexpected results after changing sort order.

### Pitfall 4: JSONB NULL Handling in Filters
**What goes wrong:** Rows with NULL JSONB fields are excluded from ALL filter results, even "less than" filters.
**Why it happens:** `NULL::BIGINT >= 1000` evaluates to NULL (not false), so the row is excluded.
**How to avoid:** This is actually correct behavior for most cases. If needed, use `COALESCE((... ->> 'viewCount')::BIGINT, 0)` to treat NULL as 0.
**Warning signs:** Videos without statistics data disappear from filtered results.

### Pitfall 5: goto() Triggering Load Functions
**What goes wrong:** Calling `goto()` to update URL params re-runs SvelteKit load functions, causing double data fetches.
**Why it happens:** SvelteKit re-runs load functions that read `url` when URL changes.
**How to avoid:** The current page (`+page.svelte`) has no `load` function -- all data fetching is via TanStack Query in the component. This pitfall doesn't apply unless a `+page.ts` load function is added later.
**Warning signs:** Network tab shows duplicate requests after URL param changes.

## Code Examples

### Extended ContentFilter (domain/pagination.go)

```go
type ContentFilter struct {
    ContentType      *ContentType
    MinLengthSeconds *int
    MaxLengthSeconds *int
    Search           *string
    // New filter fields for Phase 18
    MinViewCount      *int
    MaxViewCount      *int
    MinLikeCount      *int
    MaxLikeCount      *int
    PublishedAfter    *string
    PublishedBefore   *string
    ChannelTitle      *string
    TagContains       *string
    DescriptionSearch *string
    CreatedAfter      *string
    CreatedBefore     *string
    UpdatedAfter      *string
    UpdatedBefore     *string
}
```

### Extended GraphQL Schema (schema.graphql)

```graphql
enum ContentSortBy {
    CREATED_AT
    UPDATED_AT
    NAME
    VIEW_COUNT
    LIKE_COUNT
    PUBLISHED_AT
    CHANNEL_TITLE  # New
    LENGTH         # New
}

input ContentFilter {
    contentType: ContentType
    minLengthSeconds: Int
    maxLengthSeconds: Int
    search: String
    # New filter fields
    minViewCount: Int
    maxViewCount: Int
    minLikeCount: Int
    maxLikeCount: Int
    publishedAfter: String
    publishedBefore: String
    channelTitle: String
    tagContains: String
    descriptionSearch: String
    createdAfter: String
    createdBefore: String
    updatedAfter: String
    updatedBefore: String
}
```

### New Sort Rules (helpers.go)

```go
case domain.ContentSortByChannelTitle:
    primaryRule = paginator.Rule{
        Key:             "ChannelTitle",
        Order:           paginatorOrder,
        SQLRepr:         "response->'items'->0->'snippet'->>'channelTitle'",
        NULLReplacement: "",
    }
case domain.ContentSortByLength:
    primaryRule = paginator.Rule{
        Key:   "Length",
        Order: paginatorOrder,
    }
```

Note: `ContentSortByLength` uses the direct `length` column (not JSONB), so no `SQLRepr` needed. The `Length` field on `ContentModel` is a real column.

### ContentModel Dummy Field for ChannelTitle Sort

```go
// In gorm_models.go - add dummy field for cursor paginator
type ContentModel struct {
    // ... existing fields ...
    ChannelTitle string `gorm:"-"` // Dummy for gorm-cursor-paginator sort key
}
```

### Data Mode Toggle Component

```svelte
<!-- DataModeToggle.svelte -->
<script lang="ts">
    let { mode, loadedCount, onToggle } = $props<{
        mode: 'all' | 'loaded';
        loadedCount: number;
        onToggle: (newMode: 'all' | 'loaded') => void;
    }>();
</script>

<div class="flex items-center gap-1 text-xs">
    <button
        onclick={() => onToggle('all')}
        class="px-2 py-1 rounded-md transition-colors {mode === 'all'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent'}"
    >
        All Items
    </button>
    <button
        onclick={() => onToggle('loaded')}
        class="px-2 py-1 rounded-md transition-colors {mode === 'loaded'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent'}"
        title="Sort, filter, and search within the currently loaded page only"
    >
        Loaded {loadedCount} Items
    </button>
</div>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `$app/stores` (`$page`) | `$app/state` (`page`) | SvelteKit 2.12 | Direct property access, runes-compatible |
| `api.setQuickFilter()` | `api.setGridOption('quickFilterText', ...)` | AG Grid v31 | Consistent with new options API |
| `history.replaceState()` | `goto()` with `replaceState: true` | SvelteKit 1.x | Router-compatible URL updates |

**Deprecated/outdated:**
- `$app/stores`: Deprecated in favor of `$app/state` (requires Svelte 5)
- `api.setQuickFilter()`: Replaced by `setGridOption('quickFilterText', ...)`
- `sveltekit-search-params` library: Not yet runes-compatible, avoid

## Open Questions

1. **AG Grid sort state sync in "All Items" mode**
   - What we know: We can set sort via `api.applyColumnState()` to match server sort.
   - What's unclear: Whether AG Grid re-sorts data client-side even when the sort state matches the data order. If it does, `postSortRows` may be needed to preserve server order.
   - Recommendation: Test during implementation. If AG Grid re-sorts, add `postSortRows` that returns data in original order when in "All Items" mode.

2. **Sequential page catch-up performance**
   - What we know: Direct URL load with `?page=5` requires 4 sequential fetches to build cursor chain.
   - What's unclear: Whether TanStack Query's cache can be leveraged to make this fast.
   - Recommendation: Implement sequential fetch. If slow, consider encoding the cursor in the URL as `?after=...` alongside `?page=N` for direct access.

3. **`page.url` reactivity workaround stability**
   - What we know: The `page.state` workaround forces reactivity.
   - What's unclear: Whether this workaround will break in future SvelteKit updates.
   - Recommendation: Use the workaround but wrap URL reads in a single utility function so the workaround is centralized and easy to update.

## Sources

### Primary (HIGH confidence)
- [AG Grid: Filter API](https://www.ag-grid.com/javascript-data-grid/filter-api/) - filter model structure
- [AG Grid: External Filter](https://www.ag-grid.com/javascript-data-grid/filter-external/) - isExternalFilterPresent/doesExternalFilterPass
- [AG Grid: Quick Filter](https://www.ag-grid.com/javascript-data-grid/filter-quick/) - quickFilterText API
- [AG Grid: Row Sorting](https://www.ag-grid.com/javascript-data-grid/row-sorting/) - sortable property, postSortRows
- [AG Grid: Updating Column Definitions](https://www.ag-grid.com/javascript-data-grid/column-updating-definitions/) - dynamic column def updates
- [SvelteKit: $app/state](https://svelte.dev/docs/kit/$app-state) - reactive page object
- [SvelteKit: $app/navigation](https://svelte.dev/docs/kit/$app-navigation) - goto() function
- [gorm-cursor-paginator](https://github.com/pilagod/gorm-cursor-paginator) - cursor pagination library
- Existing codebase: `helpers.go`, `gorm_content_repository.go`, `ActivityTable.svelte`

### Secondary (MEDIUM confidence)
- [pganalyze: GIN Indexes](https://pganalyze.com/blog/gin-index) - GIN vs B-Tree for JSONB
- [Crunchy Data: Indexing JSONB](https://www.crunchydata.com/blog/indexing-jsonb-in-postgres) - JSONB indexing strategies
- [GORM datatypes](https://github.com/go-gorm/datatypes) - JSONB query helpers
- [SvelteKit Issue #13187](https://github.com/sveltejs/kit/issues/13187) - page.url reactivity bug

### Tertiary (LOW confidence)
- [SvelteKit Issue #13746](https://github.com/sveltejs/kit/issues/13746) - Feature request for native URL param sync (no resolution yet)

## Metadata

**Confidence breakdown:**
- AG Grid mode switching: HIGH - verified via official docs, clear approach using dynamic column defs
- SvelteKit URL params: HIGH - goto/replaceState well-documented; MEDIUM for $app/state reactivity (known bug with workaround)
- AG Grid filter models: HIGH - official docs provide complete model structures
- GORM JSONB filtering: HIGH - existing codebase patterns + verified PostgreSQL operators
- Cursor-to-page mapping: HIGH - existing code pattern already works; sequential catch-up is the clear approach

**Research date:** 2026-02-26
**Valid until:** 2026-03-26 (stable domain, AG Grid v32 is mature)
