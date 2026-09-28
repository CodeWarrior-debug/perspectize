# Phase 02: Data Layer + Activity - Research

**Researched:** 2026-02-07
**Domain:** SvelteKit data fetching, AG Grid integration, state management
**Confidence:** HIGH

## Summary

Phase 2 transforms the Activity page from a placeholder into a functional data table displaying recently updated YouTube content. The phase integrates three key pieces: TanStack Query for data fetching with GraphQL, AG Grid for table display with sorting/filtering/pagination, and session storage for user selector persistence.

The existing codebase already has strong foundations:
- GraphQL backend with cursor-based pagination (`schema.graphql` content query)
- TanStack Query client configured with browser-only execution (`src/lib/queries/client.ts`)
- AG Grid validated with Svelte 5 wrapper (`AGGridTest.svelte`)
- GraphQL query definitions pattern established (`src/lib/queries/content.ts`)

The standard approach is to use TanStack Query's `createQuery` hook with `keepPreviousData` for smooth pagination transitions, AG Grid's Quick Filter for multi-column text search (avoiding backend text search complexity initially), and SvelteKit's snapshots feature for user selection persistence across navigation.

**Primary recommendation:** Use client-side AG Grid pagination with TanStack Query (fetch all data once, AG Grid handles display pagination). This matches the test data size (small dataset) and simplifies implementation. Defer server-side pagination integration until Phase 2.1 if performance requires it.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tanstack/svelte-query | 6.0.18 | Data fetching + caching | De facto standard for GraphQL/REST data in Svelte; official Svelte adapter |
| graphql-request | 7.4.0 | GraphQL client | Lightweight, type-safe GraphQL client that pairs well with TanStack Query |
| ag-grid-svelte5 | 1.0.3 | Data table (Svelte 5) | Community wrapper for AG Grid with Svelte 5 runes support |
| @ag-grid-community/core | 32.2.1 | AG Grid core | Bundled with ag-grid-svelte5; pinned to 32.2.x for compatibility |
| @ag-grid-community/client-side-row-model | 32.2.1 | AG Grid row model | Client-side data model for AG Grid |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| svelte-sonner | 1.0.7 | Toast notifications | Already integrated; use for loading/error feedback |
| @ag-grid-community/theming | 32.2.0 | AG Grid themes | themeQuartz for styling AG Grid with custom fonts |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TanStack Query | Direct GraphQL calls | Lose caching, loading states, refetch coordination |
| AG Grid | TanStack Table | AG Grid has Quick Filter, more features out-of-box; TanStack Table more customizable |
| Client-side pagination | Server-side pagination | Server-side scales better but adds complexity; defer until needed |
| Session storage | URL state | URL state more shareable but clutters URL; session storage cleaner for temp selections |

**Installation:**
All dependencies already installed in `package.json`. No additional packages needed.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   ├── queries/
│   │   ├── client.ts          # Existing GraphQL client
│   │   ├── content.ts         # Existing content queries
│   │   └── users.ts           # NEW: User queries (list all users)
│   ├── components/
│   │   ├── ActivityTable.svelte      # NEW: AG Grid wrapper for content
│   │   ├── UserSelector.svelte       # NEW: User dropdown with persistence
│   │   └── shadcn/
│   │       └── select/               # NEW: shadcn-svelte Select primitive
│   └── stores/
│       └── userSelection.svelte.ts   # NEW: Shared user state with session persistence
├── routes/
│   └── +page.svelte           # Activity page (replace placeholder)
└── tests/
    ├── components/
    │   ├── ActivityTable.test.ts     # NEW
    │   └── UserSelector.test.ts      # NEW
    └── unit/
        ├── queries-users.test.ts     # NEW
        └── stores-userSelection.test.ts  # NEW
```

### Pattern 1: TanStack Query with Cursor Pagination
**What:** Use `createQuery` with pagination variables, `keepPreviousData` for smooth transitions
**When to use:** Fetching paginated data from GraphQL API
**Example:**
```typescript
// Source: Existing pattern in fe (simplified)
import { createQuery } from '@tanstack/svelte-query';
import { graphqlClient } from '$lib/queries/client';
import { LIST_CONTENT } from '$lib/queries/content';

const contentQuery = createQuery({
  queryKey: ['content', { first: 50, sortBy: 'UPDATED_AT', sortOrder: 'DESC' }],
  queryFn: () => graphqlClient.request(LIST_CONTENT, {
    first: 50,
    sortBy: 'UPDATED_AT',
    sortOrder: 'DESC'
  }),
  staleTime: 60 * 1000, // 1 minute (from existing config)
  retry: 1 // from existing config
});

// Access with: contentQuery.data, contentQuery.isLoading, contentQuery.error
```

**Note:** For Phase 2, recommend fetching all content once (first: 50 or 100) and using client-side AG Grid pagination. This avoids cursor state management complexity while dataset is small.

### Pattern 2: AG Grid with Svelte 5 Runes
**What:** Use `$state()` for reactive rowData, bind to AgGridSvelte5Component
**When to use:** Displaying tabular data with sorting/filtering/pagination
**Example:**
```svelte
<!-- Source: frontend/src/lib/components/AGGridTest.svelte -->
<script lang="ts">
  import AgGridSvelte5Component from 'ag-grid-svelte5';
  import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model';
  import { themeQuartz } from '@ag-grid-community/theming';
  import type { GridOptions } from '@ag-grid-community/core';

  interface ContentRow {
    id: string;
    name: string;
    url: string;
    updatedAt: string;
    perspectiveCount: number; // from backend or derived
  }

  let rowData = $state<ContentRow[]>([]);
  const modules = [ClientSideRowModelModule];
  const theme = themeQuartz.withParams({ fontFamily: 'Inter, sans-serif' });

  const gridOptions: GridOptions<ContentRow> = {
    columnDefs: [
      { field: 'name', headerName: 'Title', flex: 2, filter: true, sortable: true },
      { field: 'updatedAt', headerName: 'Updated', width: 130, sortable: true },
      { field: 'perspectiveCount', headerName: 'Perspectives', width: 130, sortable: true }
    ],
    pagination: true,
    paginationPageSize: 10,
    paginationPageSizeSelector: [10, 25, 50],
    defaultColDef: { resizable: true },
    getRowId: (params) => params.data?.id ?? '',
    domLayout: 'autoHeight'
  };
</script>

<AgGridSvelte5Component {gridOptions} {rowData} {theme} {modules} />
```

### Pattern 3: Quick Filter for Multi-Column Text Search
**What:** Use AG Grid's built-in Quick Filter instead of backend text search
**When to use:** Initial implementation for text search across multiple columns
**Example:**
```svelte
<script lang="ts">
  import type { GridApi } from '@ag-grid-community/core';

  let gridApi = $state<GridApi | null>(null);
  let searchText = $state('');

  const gridOptions: GridOptions<ContentRow> = {
    // ... other options
    onGridReady: (params) => {
      gridApi = params.api;
    }
  };

  $effect(() => {
    if (gridApi) {
      gridApi.setGridOption('quickFilterText', searchText);
    }
  });
</script>

<input
  type="text"
  bind:value={searchText}
  placeholder="Search videos..."
/>
<AgGridSvelte5Component {gridOptions} {rowData} {theme} {modules} />
```

**Source:** [AG Grid Quick Filter documentation](https://www.ag-grid.com/javascript-data-grid/filter-quick/)

**Why this instead of backend text search:**
- Quick Filter searches all columns automatically (no need to specify which fields)
- Case-insensitive by default
- Works with client-side row model (no backend changes needed)
- Can add backend search in Phase 2.1 if dataset grows

### Pattern 4: Session Storage with Svelte 5 Runes
**What:** Use `$state()` in `.svelte.ts` file with session storage sync via `$effect()`
**When to use:** Persisting UI state (user selection) across navigation
**Example:**
```typescript
// Source: Svelte 5 runes global state pattern
// lib/stores/userSelection.svelte.ts
import { browser } from '$app/environment';

const STORAGE_KEY = 'selectedUserId';

function loadFromSession(): number | null {
  if (!browser) return null;
  const stored = sessionStorage.getItem(STORAGE_KEY);
  return stored ? parseInt(stored, 10) : null;
}

export const selectedUserId = $state<number | null>(loadFromSession());

$effect(() => {
  if (browser && selectedUserId !== null) {
    sessionStorage.setItem(STORAGE_KEY, String(selectedUserId));
  }
});
```

**Alternative (SvelteKit Snapshots):** More complex but better for form data. Use session storage for simple dropdown selection.

### Pattern 5: GraphQL Query Definitions
**What:** Define queries with `gql` tagged template, co-locate with domain
**When to use:** All GraphQL operations
**Example:**
```typescript
// Source: frontend/src/lib/queries/content.ts (existing pattern)
import { gql } from 'graphql-request';

export const LIST_USERS = gql`
  query ListUsers {
    users {
      id
      username
      email
    }
  }
`;

// Note: Backend schema currently has userByID and userByUsername but NOT a list users query.
// Need to add this query to schema.graphql or fetch users from perspectives data.
```

**CRITICAL:** Backend schema is missing a `users` list query. Options:
1. Add `users: [User!]!` query to backend schema (RECOMMENDED for Phase 2)
2. Derive users from existing content/perspectives data (workaround)

### Anti-Patterns to Avoid
- **Mixing client/server pagination:** Don't use AG Grid server-side row model with client-side Quick Filter. Pick one model and stick to it per table.
- **Reassigning arrays for reactivity:** With Svelte 5, mutate arrays directly (`rowData.push(item)` not `rowData = [...rowData, item]`). Only reassign when replacing entire dataset.
- **Using `$effect()` for derived state:** Use `$derived()` for computed values (e.g., `perspectiveCount`), not `$effect()`.
- **Installing ag-grid-community separately:** The ag-grid-svelte5 wrapper bundles AG Grid v32.x internally. Installing `ag-grid-community` separately causes version conflicts.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multi-column text search | Custom filter logic per column | AG Grid Quick Filter | Handles tokenization, case-insensitivity, column iteration automatically |
| Pagination state | Manual page/cursor tracking | TanStack Query `keepPreviousData` + AG Grid pagination | Avoids state sync bugs, handles loading states |
| Session storage sync | Manual sessionStorage.setItem calls | Svelte 5 `$effect()` with session storage | Automatic sync, SSR-safe with browser guard |
| GraphQL error handling | Try/catch everywhere | TanStack Query error states | Built-in retry, error boundaries, isError states |
| Loading spinners | Custom loading components | TanStack Query `isLoading` + `isFetching` | Distinguishes initial load from background refetch |

**Key insight:** AG Grid Quick Filter is dramatically simpler than backend text search for initial implementation. Only move search to backend when dataset exceeds ~1000 rows or when you need advanced search features (fuzzy matching, ranking, facets).

## Common Pitfalls

### Pitfall 1: AG Grid Version Conflicts
**What goes wrong:** Installing `ag-grid-community` separately from `ag-grid-svelte5` causes duplicate module errors or version mismatches.
**Why it happens:** The `ag-grid-svelte5` wrapper already bundles AG Grid v32.x core modules. Installing separately creates two copies.
**How to avoid:**
- Only install `ag-grid-svelte5` and explicit `@ag-grid-community/*` packages
- Pin to 32.2.x versions (not latest 32.3.x) to match wrapper compatibility
- Import from `@ag-grid-community/core` not `ag-grid-community`
**Warning signs:** TypeScript errors about duplicate types, grid not rendering, console errors about module registration

### Pitfall 2: TanStack Query SSR Execution
**What goes wrong:** Queries execute on server during SSG build, fail with "fetch is not defined" or connection errors.
**Why it happens:** Static adapter runs queries during pre-rendering, but GraphQL endpoint may not be accessible.
**How to avoid:**
- Already configured correctly in `+layout.svelte`: `enabled: browser` in QueryClient defaults
- For individual queries: add `enabled: browser` to query options
- Verify `import { browser } from '$app/environment'` is used for guards
**Warning signs:** Build fails with network errors, queries return null/undefined in production

### Pitfall 3: Cursor Pagination Complexity
**What goes wrong:** Managing cursor state (`after`, `before`, `endCursor`, `startCursor`) becomes complex when combined with AG Grid pagination.
**Why it happens:** AG Grid pagination expects page numbers or client-side data, not GraphQL cursors.
**How to avoid:**
- Phase 2: Use client-side pagination (fetch all data, AG Grid handles display)
- Defer server-side pagination to Phase 2.1 when dataset is large enough to justify it
- If implementing server-side: use AG Grid's Server-Side Row Model with custom datasource
**Warning signs:** Users click pagination but data doesn't update, cursors out of sync with page numbers

### Pitfall 4: Missing Backend List Users Query
**What goes wrong:** Frontend needs to populate user dropdown but backend only has `userByID` and `userByUsername` queries.
**Why it happens:** Backend schema was designed for single-user lookups, not listing all users.
**How to avoid:**
- Add `users: [User!]!` query to `schema.graphql` before starting frontend work
- Alternative: Add pagination to users query (`users(first: Int, after: String): PaginatedUsers!`) for future-proofing
- If schema change isn't possible: extract unique users from `perspectives` query results (workaround)
**Warning signs:** No way to fetch users list, dropdown is empty

### Pitfall 5: Session Storage Timing in Tests
**What goes wrong:** Tests fail because `sessionStorage` is accessed before `browser` guard check.
**Why it happens:** Vitest runs in jsdom but some code paths execute before guards.
**How to avoid:**
- Always guard session storage access with `if (!browser) return`
- Mock `sessionStorage` in test setup if needed
- Use SvelteKit's `$app/environment` for SSR-safe checks
**Warning signs:** Tests fail with "sessionStorage is not defined", works in browser

## Code Examples

Verified patterns from official sources:

### TanStack Query with GraphQL Request (Existing Pattern)
```typescript
// Source: frontend/src/lib/queries/content.ts + client.ts
import { createQuery } from '@tanstack/svelte-query';
import { graphqlClient } from '$lib/queries/client';
import { LIST_CONTENT } from '$lib/queries/content';

const contentQuery = createQuery({
  queryKey: ['content', { first: 50, sortBy: 'UPDATED_AT', sortOrder: 'DESC' }],
  queryFn: () => graphqlClient.request(LIST_CONTENT, {
    first: 50,
    sortBy: 'UPDATED_AT',
    sortOrder: 'DESC'
  })
});

// In template:
{#if contentQuery.isLoading}
  <p>Loading...</p>
{:else if contentQuery.error}
  <p>Error: {contentQuery.error.message}</p>
{:else if contentQuery.data}
  <ActivityTable items={contentQuery.data.content.items} />
{/if}
```

### AG Grid Quick Filter Integration
```svelte
<!-- Source: AG Grid official docs + Svelte 5 runes pattern -->
<script lang="ts">
  import AgGridSvelte5Component from 'ag-grid-svelte5';
  import type { GridApi, GridOptions } from '@ag-grid-community/core';

  let gridApi = $state<GridApi | null>(null);
  let searchText = $state('');

  const gridOptions: GridOptions = {
    // ... column defs, pagination, etc.
    onGridReady: (params) => {
      gridApi = params.api;
    }
  };

  // Update Quick Filter when searchText changes
  $effect(() => {
    if (gridApi) {
      gridApi.setGridOption('quickFilterText', searchText);
    }
  });
</script>

<div class="space-y-4">
  <input
    type="text"
    bind:value={searchText}
    placeholder="Search title, description..."
    class="px-4 py-2 border rounded"
  />
  <AgGridSvelte5Component {gridOptions} {rowData} {theme} {modules} />
</div>
```

### Session Storage with Svelte 5 Runes
```typescript
// Source: Svelte 5 documentation + session storage pattern
// lib/stores/userSelection.svelte.ts
import { browser } from '$app/environment';

const STORAGE_KEY = 'selectedUserId';

function loadFromSession(): number | null {
  if (!browser) return null;
  const stored = sessionStorage.getItem(STORAGE_KEY);
  return stored ? parseInt(stored, 10) : null;
}

export const selectedUserId = $state<number | null>(loadFromSession());

// Sync to session storage when value changes
if (browser) {
  $effect(() => {
    if (selectedUserId !== null) {
      sessionStorage.setItem(STORAGE_KEY, String(selectedUserId));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  });
}
```

**Usage in component:**
```svelte
<script lang="ts">
  import { selectedUserId } from '$lib/stores/userSelection.svelte';

  function handleUserChange(newUserId: number) {
    selectedUserId = newUserId; // Automatically persists to session storage
  }
</script>

<p>Selected user: {selectedUserId ?? 'None'}</p>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| AG Grid wrapper components | ag-grid-svelte5 with Svelte 5 runes | January 2025 | Native Svelte 5 support, no workarounds needed |
| Svelte 4 stores for session state | Svelte 5 `$state()` in `.svelte.ts` | Svelte 5 (2024) | Simpler syntax, better TypeScript support |
| Apollo Client for GraphQL | TanStack Query + graphql-request | 2023-2024 | Lighter weight, framework-agnostic, better caching control |
| Relay-style cursor pagination | GraphQL Cursor Connections Spec | Stable since 2015 | Industry standard, backend already implements it |

**Deprecated/outdated:**
- `export let` props: Use `let { prop } = $props()` (Svelte 5)
- `$:` reactive statements: Use `$derived()` or `$effect()` (Svelte 5)
- `<slot>`: Use `{@render children()}` (Svelte 5)
- Importing from `ag-grid-community`: Use `@ag-grid-community/core` (v32+)

## Open Questions

Things that couldn't be fully resolved:

1. **Backend users list query**
   - What we know: Schema has `userByID` and `userByUsername` but no `users` list query
   - What's unclear: Whether to add to schema or derive from perspectives data
   - Recommendation: Add `users: [User!]!` query to schema in Plan 02-01. Simple, no pagination needed for v1 (small user count).

2. **Perspective count per content**
   - What we know: Content model doesn't have `perspectiveCount` field
   - What's unclear: Whether to add to schema, compute in resolver, or fetch separately
   - Recommendation: Add resolver field `perspectiveCount: Int!` to Content type. Compute in resolver by counting perspectives for that content. Document in Plan 02-01 requirements.

3. **Default user selection**
   - What we know: User selector should persist across navigation
   - What's unclear: What to show when no user is selected (empty state vs. default user)
   - Recommendation: Show "Select a user" placeholder when null. Don't auto-select first user (lets user consciously choose).

4. **Server-side vs client-side pagination timing**
   - What we know: Client-side is simpler, server-side scales better
   - What's unclear: At what dataset size to switch
   - Recommendation: Use client-side for Phase 2. Switch to server-side in Phase 2.1 if dataset exceeds 100 content items or if Quick Filter performance degrades.

## Sources

### Primary (HIGH confidence)
- [GraphQL Schema](file:///Users/jamesjordan/GitHub/perspectize/backend/schema.graphql) - Backend schema with Content, User, Perspective types
- [TanStack Query Client](file:///Users/jamesjordan/GitHub/perspectize/frontend/src/lib/queries/client.ts) - Existing GraphQL client setup
- [Content Queries](file:///Users/jamesjordan/GitHub/perspectize/frontend/src/lib/queries/content.ts) - Existing query pattern
- [AG Grid Test Component](file:///Users/jamesjordan/GitHub/perspectize/frontend/src/lib/components/AGGridTest.svelte) - Validated AG Grid integration
- [GraphQL Resolvers](file:///Users/jamesjordan/GitHub/perspectize/backend/internal/adapters/graphql/resolvers/schema.resolvers.go) - Backend resolver patterns
- [Frontend CLAUDE.md](file:///Users/jamesjordan/GitHub/perspectize/frontend/CLAUDE.md) - Established patterns and conventions
- [AG Grid Quick Filter Documentation](https://www.ag-grid.com/javascript-data-grid/filter-quick/) - Official AG Grid feature documentation
- [Svelte 5 Runes Documentation](https://svelte.dev/docs/svelte/$state) - Official Svelte 5 state management
- [TanStack Query GraphQL Guide](https://tanstack.com/query/latest/docs/framework/react/graphql) - Official integration guide

### Secondary (MEDIUM confidence)
- [GraphQL Cursor Pagination Spec](https://relay.dev/graphql/connections.htm) - Relay specification (industry standard)
- [Apollo Cursor Pagination Docs](https://www.apollographql.com/docs/react/pagination/cursor-based) - Apollo's implementation guide
- [TanStack Query Paginated Queries](https://tanstack.com/query/latest/docs/react/guides/paginated-queries) - Official pagination patterns
- [SvelteKit Session Storage Pattern](https://rodneylab.com/sveltekit-session-storage/) - Community pattern (Rodney Lab)
- [Svelte 5 Global State with Runes](https://mainmatter.com/blog/2025/03/11/global-state-in-svelte-5/) - Mainmatter blog (Svelte experts)
- [Setting Up AG Grid in SvelteJS 5.0.0](https://dev.to/im_sonujangra/setting-up-ag-grid-in-sveltejs-390i) - Community integration guide

### Tertiary (LOW confidence)
- [TanStack Query Discussion #3130](https://github.com/TanStack/query/discussions/3130) - Community discussion on cursor pagination
- [AG Grid Server-Side Pagination](https://www.ag-grid.com/javascript-data-grid/server-side-model-pagination/) - Official docs (not implemented yet)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed and validated in Phase 1
- Architecture: HIGH - Patterns verified against existing codebase (GraphQL client, AG Grid test, resolvers)
- Pitfalls: HIGH - Based on actual project code (package.json, vite.config.ts, layout.svelte)

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (30 days - stable stack, no major version changes expected)
