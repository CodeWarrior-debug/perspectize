# Adding a Column to the AG Grid Table

Decision guide for adding a new column to the ActivityTable AG Grid.

## Key Files

| File | Purpose |
|------|---------|
| `frontend/src/lib/components/ActivityTable.svelte` | Column definitions, grid options, sort map |
| `frontend/src/lib/utils/formatting.ts` | Cell renderers and value formatters |
| `frontend/src/lib/queries/content.ts` | GraphQL query fields and TypeScript types |
| `frontend/tests/unit/formatting.test.ts` | Formatter/renderer tests |
| `frontend/tests/unit/queries-content.test.ts` | Query definition tests |
| `frontend/tests/components/ActivityTable.test.ts` | Component rendering tests |
| `backend/schema.graphql` | GraphQL schema (if new field) |
| `backend/internal/core/domain/content.go` | Domain model (if new field) |
| `backend/internal/adapters/repositories/postgres/helpers.go` | Sort rules for JSONB-derived fields |
| `backend/migrations/` | Database migrations (if new persisted field) |

---

## Decision 1: Does This Need Backend Changes?

This is the most important decision — it determines whether the work is frontend-only or full-stack.

```
Is the field already in the ContentItem TypeScript interface?
├── YES → Is it already in the LIST_CONTENT GraphQL query?
│   ├── YES → FRONTEND-ONLY (skip to Decision 2)
│   └── NO → Add field to LIST_CONTENT query selection set, then FRONTEND-ONLY
│
└── NO → Where does the data live?
    │
    ├── COMPUTED from existing fields (e.g., "age" from createdAt)
    │   → FRONTEND-ONLY: use valueGetter, no backend needed
    │
    ├── IN the YouTube API response JSONB (already stored, just not exposed)
    │   → BACKEND: JSONB EXTRACTION (no migration)
    │   Steps:
    │   1. Add field to Content type in schema.graphql
    │   2. Add virtual field to GORM model (gorm:"-" tag)
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
        → Check: YouTube API response structure in response JSONB
        → Example JSONB paths:
          viewCount:   response->'items'->0->'statistics'->>'viewCount'
          likeCount:   response->'items'->0->'statistics'->>'likeCount'
          publishedAt: response->'items'->0->'snippet'->>'publishedAt'
          channelTitle: response->'items'->0->'snippet'->>'channelTitle'
          tags:        response->'items'->0->'snippet'->'tags'
          description: response->'items'->0->'snippet'->>'description'
```

### Backend files touched per scenario

| Scenario | Files |
|----------|-------|
| **Frontend-only** | None |
| **JSONB extraction** | `schema.graphql`, `gorm_models.go`, `helpers.go`, `schema.resolvers.go` (maybe), `gqlgen.yml` (maybe) |
| **New DB column** | All of above + `migrations/`, `domain/content.go`, `gorm_mappers.go` |

---

## Decision 2: Column Properties

| Property | Decision | Options |
|----------|----------|---------|
| **`colId`** | Unique identifier | Lowercase camelCase string |
| **`field`** | Maps to `ContentItem` property | Must match TS interface field, or omit if using `valueGetter` |
| **`headerName`** | Display text | Short label for column header |
| **`headerTooltip`** | Hover text | Longer description |
| **`context: { tooltipSpec }`** | Cell hover popover | Omit for default (displayed text + copy of raw value); `false` to opt out; `{ text, copyValue }` to override display/copy; `{ mode: 'multi', items, emptyText }` for chip lists; add the spec to `ACTIVITY_TOOLTIP_SPECS` (`frontend/src/lib/utils/activityTooltipSpecs.ts`) |

---

## Decision 3: Sizing Strategy

| Option | When to Use | Example |
|--------|-------------|---------|
| **`width: Npx`** | Fixed-width data (dates, numbers, short text) | `width: 100` (views, likes) |
| **`flex: N`** | Flexible-width that fills available space | `flex: 2` (item name) |
| **`minWidth`** | Floor width when using flex | — |
| **`maxWidth`** | Cap width for flex columns | — |

Current widths: `100px` (views, likes), `140px` (dates), `160px` (channel), `200px` (tags), `flex: 2` (item).

---

## Decision 4: Renderer or Formatter?

| Need | Solution | Where | Existing to Reuse |
|------|----------|-------|--------------------|
| Plain text/number | None needed | — | — |
| Number formatting (1.2K) | `valueFormatter` | `formatting.ts` | `formatCount` |
| Date formatting | `valueFormatter` | `formatting.ts` | `dateValueFormatter`, `formatPublishDate` |
| Array to string | `valueFormatter` | `formatting.ts` | `formatTags` |
| Truncated text | `valueFormatter` | `formatting.ts` | `truncateDescription` |
| Computed from multiple fields | `valueGetter` | inline or `formatting.ts` | `durationValueGetter` |
| Rich HTML (images, links, icons) | `cellRenderer` returning `HTMLElement` | `formatting.ts` | `itemCellRenderer`, `typeCellRenderer` |

If creating a **new** formatter or renderer, add it to `formatting.ts` and add tests (see Testing section).

---

## Decision 5: Sortable?

If yes, changes needed at multiple layers:

1. **Column def**: Set `sortable: true`
2. **Sort map** (ActivityTable.svelte): Add to `SORT_FIELD_MAP`:
   ```typescript
   'yourColId': 'BACKEND_SORT_ENUM_VALUE',
   ```
3. **GraphQL schema**: Add value to `enum ContentSortBy` in `schema.graphql`
4. **Domain enum**: Add constant to `ContentSortBy` in `domain/pagination.go`
5. **Sort rule**: Add case to `buildContentSortRules()` in `helpers.go`
6. **Regenerate**: `make graphql-gen`

---

## Decision 6: Filterable?

If yes:

1. Choose filter type:
   - `agTextColumnFilter` — text/string fields
   - `agNumberColumnFilter` — numeric fields
2. Set in column def: `filter: 'agTextColumnFilter'` and `floatingFilter: true`

**Note**: Filters currently join into a single `search` string sent to `ContentFilter.search`. Field-specific backend filtering requires backend changes to `ContentFilter` in the schema and repository.

---

## Decision 7: Visibility

| Decision | Setting |
|----------|---------|
| Visible on desktop by default | `hide: false` (or omit) |
| Hidden by default (column menu toggle) | `hide: true` |

### Responsive visibility (`$effect` override)

**IMPORTANT:** Column visibility is controlled in TWO places that must stay in sync:

1. **`hide: true`** in the colDef — sets the initial default
2. **`$effect` block** in ActivityTable.svelte — overrides visibility on mobile/desktop breakpoint changes

The `$effect` always runs on `gridReady`, so it wins. If you only set `hide: true` in colDef but don't update the `$effect`, the column will still show on desktop.

```typescript
// Mobile: item, type only
// Desktop: item, type, duration, views, likes, publishDate, channel, tags
// Hidden on desktop: description, updatedAt, createdAt
```

**When adding a column:** Add it to the appropriate `setColumnsVisible` list in BOTH the `isMobile` and desktop branches of the `$effect`.

---

## Decision 8: Column Position

Insert the `ColDef` in the `columnDefs` array at the desired position. Current order:

1. item (name + thumbnail)
2. type (YouTube icon)
3. duration
4. views
5. likes
6. publishDate
7. channel
8. tags
9. description (hidden)
10. updatedAt (hidden)
11. createdAt (hidden)

---

## Testing

### Frontend tests to update

**`frontend/tests/unit/formatting.test.ts`** — If you added a new formatter or renderer:
- Add test cases for the new function covering: normal values, null/undefined, edge cases
- Pattern: each formatter has a `describe` block with individual `it` cases
- Renderers that return `HTMLElement` — test innerHTML/textContent of returned element

**`frontend/tests/unit/queries-content.test.ts`** — If you added a field to `LIST_CONTENT`:
- Update the test that checks the query includes expected fields
- If a new mutation was added, add a describe block for it

**`frontend/tests/components/ActivityTable.test.ts`** — If column behavior changed:
- Currently limited by JSDOM (AG Grid doesn't fully render)
- Add tests for any new props or state logic if applicable

### Backend tests to update (if backend changes were needed)

**`backend/test/domain/content_test.go`** — If you added a new domain field:
- Add test verifying the field exists and handles zero/nil values

**`backend/test/resolvers/content_resolver_test.go`** — If you added a sortable/filterable field:
- Add test case for sorting by the new field
- Add test case for filtering by the new field (if applicable)
- Update existing paginated query tests if response shape changed

**`backend/test/services/content_service_test.go`** — If service logic changed:
- Unlikely for a column addition unless the field requires new service-layer logic

---

## Quick Reference: Minimal Frontend-Only Column

For a field that already exists in `ContentItem` with no backend changes:

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
  floatingFilter: true,
  hide: true,
  valueFormatter: (params: ValueFormatterParams) => formatCount(params.value),
  // Optional: omit for the default popover, or reference a spec from ACTIVITY_TOOLTIP_SPECS
  context: { tooltipSpec: ACTIVITY_TOOLTIP_SPECS.commentCount },
},
```

Add to `SORT_FIELD_MAP`:
```typescript
'commentCount': 'COMMENT_COUNT',
```

Then update `formatting.test.ts` if reusing an existing formatter with new edge cases.

---

## Verification

After adding a column:
1. `pnpm run test:run` in `frontend/` — all tests pass
2. Visual check: column renders correctly on desktop and mobile
3. If sortable: verify sort works (check network tab for correct GraphQL variables)
4. If filterable: verify filter works with debounce
5. If backend changes: `go build ./...` and `go test ./...` in `backend/`
