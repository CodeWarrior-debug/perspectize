# AG Grid Power Features Toolbar — Research

**Project:** Perspectize v1.1
**Domain:** ActivityTable power user controls
**Researched:** 2026-02-16
**Overall confidence:** HIGH

## Executive Summary

AG Grid Community edition provides a comprehensive API for implementing power user features without requiring an Enterprise license. All features from the backlog (clear filters, column visibility, multi-sort, state persistence) are achievable using Community APIs. The primary implementation challenges are:

1. **Toolbar UI design** — shadcn-svelte has Button and Dropdown components but no Toolbar/Menubar component yet (can implement custom toolbar)
2. **State persistence strategy** — localStorage for anonymous users, backend database for authenticated users (requires new `user_preferences` table)
3. **Svelte 5 reactivity** — Using `$state` and `$effect` runes with gridApi requires careful effect dependency management

**Recommended approach:** Implement toolbar in Phase 1 with localStorage persistence, add backend sync in Phase 2 when user authentication is implemented.

---

## 1. AG Grid Community API Reference

### Filter API (Community Edition)

All filter methods are available in AG Grid Community without Enterprise license.

| Method | Description | Use Case |
|--------|-------------|----------|
| `gridApi.setFilterModel(null)` | Clears all column filters | "Clear all filters" button |
| `gridApi.setFilterModel(model)` | Restores saved filter state | Load saved filter view |
| `gridApi.getFilterModel()` | Returns current filter configuration | Save current filters |
| `gridApi.setColumnFilterModel(colId, null)` | Clears single column filter | "Clear this filter" per-column action |
| `gridApi.getColumnFilterModel(colId)` | Returns filter for specific column | Inspect individual filter state |
| `gridApi.isAnyFilterPresent()` | Checks if any filter is active | Show "Clear filters" button conditionally |
| `gridApi.onFilterChanged()` | Notifies grid after programmatic filter changes | Required after `setFilterModel` |

**Source:** [AG Grid Filter API](https://www.ag-grid.com/javascript-data-grid/filter-api/)

### Column State API (Community Edition)

Column visibility, width, sort, and order are fully supported in Community.

| Method | Description | Use Case |
|--------|-------------|----------|
| `gridApi.getColumnState()` | Returns state of all columns | Save layout (width, order, sort, visibility) |
| `gridApi.applyColumnState(params)` | Restores column configuration | Load saved layout |
| `gridApi.setColumnsVisible(keys, visible)` | Shows/hides columns by colId | Column picker toggles |
| `gridApi.resetColumnState()` | Resets to original columnDefs | "Reset to default" button |
| `gridApi.getColumns()` | Returns all column objects | Build column visibility picker |
| `gridApi.getColumn(key)` | Returns specific column | Check individual column state |

**ColumnState object structure:**
```typescript
interface ColumnState {
  colId: string;
  hide?: boolean;          // visibility
  width?: number;          // pixel width
  flex?: number;           // proportional sizing
  sort?: 'asc' | 'desc';   // sort direction
  sortIndex?: number;      // multi-sort priority
  pinned?: 'left' | 'right';
  // ... other properties
}
```

**Source:** [AG Grid Column State](https://www.ag-grid.com/javascript-data-grid/column-state/)

### Multi-Column Sort (Community Edition)

Multi-column sorting is built into AG Grid Community — no Enterprise license required.

**Configuration:**
```typescript
const gridOptions: GridOptions = {
  multiSortKey: 'ctrl',  // Use Ctrl+click (default is Shift+click)
  alwaysMultiSort: false, // Set true to remove modifier key requirement
};
```

**Programmatic control:**
```typescript
// Get current sort state
const columnState = gridApi.getColumnState();
const sortedCols = columnState
  .filter(col => col.sort)
  .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));

// Apply multi-sort programmatically
gridApi.applyColumnState({
  state: [
    { colId: 'publishDate', sort: 'desc', sortIndex: 0 },
    { colId: 'views', sort: 'desc', sortIndex: 1 }
  ],
  defaultState: { sort: null } // Clear other sorts
});
```

**User behavior:**
- Default: Shift+click headers for multi-sort
- Configured: Ctrl+click (or Command on Mac)
- Visual indicator: Sort index appears on headers (1, 2, 3...)

**Source:** [AG Grid Multi-Column Sorting](https://www.ag-grid.com/javascript-data-grid/row-sorting/#multi-column-sorting)

### Export API (Community Edition)

CSV export is fully available in Community. Excel export requires Enterprise.

| Method | Description | Parameters |
|--------|-------------|------------|
| `gridApi.exportDataAsCsv(params?)` | Downloads CSV file | `fileName`, `columnKeys`, `skipColumnHeaders`, `onlySelected`, `allColumns`, `suppressQuotes` |
| `gridApi.getDataAsCsv(params?)` | Returns CSV as string | Same as above |

**Example:**
```typescript
// Export all data
gridApi.exportDataAsCsv({
  fileName: 'perspectize-content.csv',
  allColumns: true,  // Include hidden columns
});

// Export filtered/sorted data only
gridApi.exportDataAsCsv({
  fileName: 'filtered-content.csv',
  onlySelected: false,
  skipColumnHeaders: false,
});
```

**Important:** Exports use value getters, NOT cell renderers. Custom formatting requires value formatters.

**Source:** [AG Grid CSV Export](https://www.ag-grid.com/javascript-data-grid/csv-export/)

### Clipboard API (Enterprise Only)

**LIMITATION:** Copy/paste to clipboard is Enterprise-only in AG Grid.

**Community workarounds:**
1. **Browser text selection:** `enableCellTextSelection: true` allows manual text selection
2. **Custom copy function:** Implement `sendToClipboard(params)` callback with `navigator.clipboard.writeText()`
3. **Export to CSV:** Use CSV export as alternative to clipboard

**Recommendation:** Do NOT implement clipboard features in v1.1. Use CSV export instead.

**Source:** [AG Grid Clipboard](https://www.ag-grid.com/javascript-data-grid/clipboard/)

### Keyboard Shortcuts (Community Edition)

AG Grid Community includes extensive built-in keyboard navigation.

| Shortcut | Action | Context |
|----------|--------|---------|
| **Arrow keys** | Navigate cells | Grid body |
| **Ctrl+←/→** | Jump to line start/end | Grid body |
| **Page Up/Down** | Scroll by page | Grid body |
| **Home/End** | First/last row | Grid body |
| **Enter** | Toggle sort | Column header |
| **Shift+Enter** | Add to multi-sort | Column header |
| **Alt+↓** | Open column menu | Column header |
| **Space** | Select row | Grid body (with rowSelection) |

**Custom shortcuts:** Not built-in. Implement using browser `keydown` events and `gridApi` calls.

**Source:** [AG Grid Keyboard Navigation](https://www.ag-grid.com/javascript-data-grid/keyboard-navigation/)

---

## 2. Toolbar Component Design

### Current shadcn-svelte Components

**Available in Perspectize:**
- ✅ Button
- ✅ Dropdown Menu
- ✅ Popover
- ✅ Select
- ✅ Dialog
- ✅ Input
- ✅ Label

**NOT available (would need to add):**
- ❌ Menubar (horizontal toolbar layout)
- ❌ Toolbar (button group component)
- ❌ Separator (visual divider)
- ❌ Command (keyboard shortcut display)

**Source:** Local codebase inspection + [shadcn-svelte Components](https://www.shadcn-svelte.com/docs/components)

### Recommended Toolbar Layout

```svelte
<!-- Toolbar above ActivityTable -->
<div class="toolbar flex items-center gap-2 px-4 py-2 border-b border-border">
  <!-- Filter controls -->
  <div class="flex items-center gap-1">
    <Button variant="outline" size="sm" on:click={clearAllFilters}>
      <FilterX class="h-4 w-4 mr-1" />
      Clear Filters
    </Button>
    {#if hasActiveFilters}
      <Badge variant="secondary">{filterCount}</Badge>
    {/if}
  </div>

  <Separator orientation="vertical" class="h-6" />

  <!-- Column visibility -->
  <Dropdown.Root>
    <Dropdown.Trigger asChild let:builder>
      <Button variant="outline" size="sm" builders={[builder]}>
        <Columns class="h-4 w-4 mr-1" />
        Columns
      </Button>
    </Dropdown.Trigger>
    <Dropdown.Content>
      {#each allColumns as col}
        <Dropdown.CheckboxItem bind:checked={col.visible}>
          {col.headerName}
        </Dropdown.CheckboxItem>
      {/each}
    </Dropdown.Content>
  </Dropdown.Root>

  <!-- Saved views -->
  <Dropdown.Root>
    <Dropdown.Trigger asChild let:builder>
      <Button variant="outline" size="sm" builders={[builder]}>
        <Save class="h-4 w-4 mr-1" />
        Views
      </Button>
    </Dropdown.Trigger>
    <Dropdown.Content>
      <Dropdown.Item on:click={openSaveViewDialog}>
        Save current view...
      </Dropdown.Item>
      <Dropdown.Separator />
      {#each savedViews as view}
        <Dropdown.Item on:click={() => loadView(view)}>
          {view.name}
        </Dropdown.Item>
      {/each}
    </Dropdown.Content>
  </Dropdown.Root>

  <Separator orientation="vertical" class="h-6" />

  <!-- Export -->
  <Button variant="outline" size="sm" on:click={exportToCSV}>
    <Download class="h-4 w-4 mr-1" />
    Export CSV
  </Button>

  <!-- Spacer -->
  <div class="flex-1"></div>

  <!-- Reset -->
  <Button variant="ghost" size="sm" on:click={resetToDefaults}>
    <RotateCcw class="h-4 w-4 mr-1" />
    Reset
  </Button>
</div>
```

**Missing components to add:**
1. **Separator** — Visual divider between toolbar sections (can use `<div class="border-r border-border h-6 mx-2"></div>` as temporary solution)
2. **Badge** — Filter count indicator (can use shadcn badge if available, or custom `<span>`)
3. **Icons** — lucide-svelte for toolbar icons (FilterX, Columns, Save, Download, RotateCcw)

**Source:** [shadcn-svelte Dropdown Menu](https://www.shadcn-svelte.com/docs/components/dropdown-menu)

### Column Visibility Picker Implementation

Two approaches:

**Option 1: Dropdown with checkboxes (recommended)**
```svelte
<script lang="ts">
  import { Popover, PopoverContent, PopoverTrigger, Button } from '$lib/components/shadcn';

  let columnVisibility = $state<Record<string, boolean>>({
    item: true,
    type: true,
    duration: true,
    views: false,
    likes: false,
    // ...
  });

  $effect(() => {
    if (!gridApi) return;
    const hiddenCols = Object.entries(columnVisibility)
      .filter(([_, visible]) => !visible)
      .map(([colId]) => colId);
    gridApi.setColumnsVisible(hiddenCols, false);
    const visibleCols = Object.entries(columnVisibility)
      .filter(([_, visible]) => visible)
      .map(([colId]) => colId);
    gridApi.setColumnsVisible(visibleCols, true);
  });
</script>
```

**Option 2: Dialog with checklist (for many columns)**
- Use Dialog component for full-screen column picker
- Group columns by category (Content Info, Metadata, Dates)
- Bulk actions (Show All, Hide All)

**Recommendation:** Start with Popover approach. Switch to Dialog if column count exceeds 15.

---

## 3. State Persistence Options

### Comparison Matrix

| Method | Persistence | Cross-Device | Cross-Browser | Size Limit | Auth Required |
|--------|-------------|--------------|---------------|------------|---------------|
| **localStorage** | Permanent | ❌ No | ❌ No | ~5-10MB | No |
| **sessionStorage** | Tab session | ❌ No | ❌ No | ~5-10MB | No |
| **Backend DB** | Permanent | ✅ Yes | ✅ Yes | Unlimited | Yes |

**Sources:**
- [LocalStorage vs SessionStorage vs Cookies](https://www.geeksforgeeks.org/javascript/difference-between-local-storage-session-storage-and-cookies/)
- [Client-Side Storage Guide](https://www.frontendtools.tech/blog/client-side-storage-guide-localstorage-sessionstorage-indexeddb)

### Recommended Hybrid Approach

**Phase 1: localStorage only (v1.1 initial release)**
- Fast to implement, no backend changes
- Works for anonymous users
- Per-device preferences

**Phase 2: Backend sync (post-auth implementation)**
- Migrate to `user_preferences` table
- Sync localStorage → backend on login
- Cross-device preference sync

### localStorage Implementation

**Storage key structure:**
```typescript
const STORAGE_KEYS = {
  FILTER_STATE: 'perspectize:activityTable:filters',
  COLUMN_STATE: 'perspectize:activityTable:columns',
  SAVED_VIEWS: 'perspectize:activityTable:views',
  DEFAULT_PAGE_SIZE: 'perspectize:activityTable:pageSize',
} as const;
```

**Save/load functions:**
```typescript
// Save filter state
function saveFilterState() {
  if (!gridApi) return;
  const filterModel = gridApi.getFilterModel();
  localStorage.setItem(STORAGE_KEYS.FILTER_STATE, JSON.stringify(filterModel));
}

// Load filter state
function loadFilterState() {
  if (!gridApi) return;
  const saved = localStorage.getItem(STORAGE_KEYS.FILTER_STATE);
  if (saved) {
    const filterModel = JSON.parse(saved);
    gridApi.setFilterModel(filterModel);
  }
}

// Save column state
function saveColumnState() {
  if (!gridApi) return;
  const columnState = gridApi.getColumnState();
  localStorage.setItem(STORAGE_KEYS.COLUMN_STATE, JSON.stringify(columnState));
}

// Load column state
function loadColumnState() {
  if (!gridApi) return;
  const saved = localStorage.getItem(STORAGE_KEYS.COLUMN_STATE);
  if (saved) {
    const columnState = JSON.parse(saved);
    gridApi.applyColumnState({ state: columnState });
  }
}

// Save named view
function saveView(name: string) {
  if (!gridApi) return;
  const views = getSavedViews();
  views.push({
    name,
    filterState: gridApi.getFilterModel(),
    columnState: gridApi.getColumnState(),
    createdAt: new Date().toISOString(),
  });
  localStorage.setItem(STORAGE_KEYS.SAVED_VIEWS, JSON.stringify(views));
}

// Load view
function loadView(view: SavedView) {
  if (!gridApi) return;
  gridApi.setFilterModel(view.filterState);
  gridApi.applyColumnState({ state: view.columnState });
}
```

**Auto-save strategy:**
```typescript
// Debounced auto-save
let saveTimer: ReturnType<typeof setTimeout>;

const gridOptions: GridOptions = {
  onFilterChanged: () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveFilterState(), 1000);
  },
  onColumnVisible: () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveColumnState(), 1000);
  },
  onSortChanged: () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveColumnState(), 1000);
  },
};
```

**Limitations:**
- 5-10MB storage limit (ActivityTable state ~10KB, safe for 100+ saved views)
- Browser-specific (clearing browser data loses preferences)
- No cross-device sync

**Best practices:**
- Namespace keys with `perspectize:` prefix to avoid collisions
- Use JSON.stringify/parse for structured data
- Handle parse errors gracefully (corrupted localStorage)
- Provide "Clear all preferences" option in toolbar

### Backend Database Schema

**When user authentication is implemented**, add `user_preferences` table:

```sql
-- Migration: 000011_add_user_preferences.up.sql
CREATE TABLE public.user_preferences (
  id serial NOT NULL,
  user_id integer NOT NULL,
  preference_key varchar(255) NOT NULL,
  preference_value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT user_preferences_pk PRIMARY KEY(id),
  CONSTRAINT user_preferences_unique_key UNIQUE(user_id, preference_key),
  CONSTRAINT user_preferences_users_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE INDEX idx_user_preferences_user_id ON public.user_preferences(user_id);

-- Trigger for updated_at
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

**Preference keys:**
- `activityTable.filters` — Filter model JSON
- `activityTable.columns` — Column state JSON
- `activityTable.savedViews` — Named views array
- `activityTable.pageSize` — Default page size

**GraphQL schema:**
```graphql
type UserPreference {
  id: ID!
  preferenceKey: String!
  preferenceValue: JSON!
  updatedAt: Time!
}

extend type Mutation {
  setUserPreference(key: String!, value: JSON!): UserPreference!
  deleteUserPreference(key: String!): Boolean!
}

extend type Query {
  getUserPreference(key: String!): UserPreference
  listUserPreferences: [UserPreference!]!
}
```

**Migration strategy (localStorage → backend):**
1. User logs in
2. Frontend checks localStorage for preferences
3. If found, call `setUserPreference` for each key
4. Clear localStorage after successful sync
5. Subsequent loads use backend API

**Source:** [Storing User Settings in a Relational Database](https://culttt.com/2015/02/02/storing-user-settings-relational-database)

---

## 4. Keyboard Shortcuts

### Built-in AG Grid Shortcuts (Community)

These work out-of-the-box without configuration:

| Shortcut | Action |
|----------|--------|
| **Enter** (header) | Toggle sort |
| **Shift+Enter** (header) | Add to multi-sort |
| **Arrows** | Navigate cells |
| **Ctrl+Arrow** | Jump to edge |
| **Page Up/Down** | Scroll viewport |
| **Home/End** | First/last row |

### Custom Shortcuts for Toolbar

Implement using `keydown` listener on window:

```typescript
import { onMount } from 'svelte';

onMount(() => {
  function handleKeydown(e: KeyboardEvent) {
    // Ctrl+Shift+F — Clear all filters
    if (e.ctrlKey && e.shiftKey && e.key === 'F') {
      e.preventDefault();
      clearAllFilters();
    }

    // Ctrl+Shift+C — Open column picker
    if (e.ctrlKey && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      // Toggle column picker dropdown
    }

    // Ctrl+Shift+E — Export CSV
    if (e.ctrlKey && e.shiftKey && e.key === 'E') {
      e.preventDefault();
      exportToCSV();
    }

    // Ctrl+Shift+R — Reset to defaults
    if (e.ctrlKey && e.shiftKey && e.key === 'R') {
      e.preventDefault();
      resetToDefaults();
    }
  }

  window.addEventListener('keydown', handleKeydown);
  return () => window.removeEventListener('keydown', handleKeydown);
});
```

**Keyboard shortcut display:**
```svelte
<Button variant="outline" size="sm" on:click={clearAllFilters}>
  Clear Filters
  <kbd class="ml-2 text-xs">Ctrl+Shift+F</kbd>
</Button>
```

**Accessibility:** Add `aria-keyshortcuts` attribute to toolbar buttons.

---

## 5. Export Functionality

### CSV Export (Community Edition)

**Basic implementation:**
```typescript
function exportToCSV() {
  if (!gridApi) return;
  gridApi.exportDataAsCsv({
    fileName: `perspectize-content-${new Date().toISOString().split('T')[0]}.csv`,
    allColumns: false,  // Export only visible columns
    skipColumnHeaders: false,
    suppressQuotes: false,
  });
}
```

**Advanced options:**

```typescript
// Export with custom processing
function exportFilteredData() {
  gridApi.exportDataAsCsv({
    fileName: 'filtered-content.csv',
    onlySelected: false,
    processCellCallback: (params) => {
      // Custom formatting per column
      if (params.column.getColId() === 'tags') {
        return formatTags(params.value);
      }
      return params.value;
    },
    processHeaderCallback: (params) => {
      // Custom header names
      return params.column.getColDef().headerName ?? params.column.getColId();
    },
  });
}
```

**Security warning:** CSV injection risk. Spreadsheets execute formulas starting with `+`, `-`, `=`, `@`. Sanitize in `processCellCallback`.

**Alternative: Get as string**
```typescript
function copyToClipboard() {
  const csvString = gridApi.getDataAsCsv({
    allColumns: false,
    skipColumnHeaders: false,
  });
  navigator.clipboard.writeText(csvString);
  toast.success('Data copied to clipboard');
}
```

**Excel export:** Requires Enterprise license. Not available in Community.

---

## 6. Svelte 5 Integration Patterns

### Reactive State with gridApi

**Pattern 1: Store gridApi in $state**
```svelte
<script lang="ts">
  import type { GridApi } from '@ag-grid-community/core';

  let gridApi = $state<GridApi | null>(null);

  const gridOptions: GridOptions = {
    onGridReady: (params) => {
      gridApi = params.api;
      loadFilterState();
      loadColumnState();
    },
  };
</script>
```

**Pattern 2: Reactive toolbar state**
```svelte
<script lang="ts">
  let hasActiveFilters = $state(false);
  let filterCount = $state(0);

  function updateFilterState() {
    if (!gridApi) return;
    hasActiveFilters = gridApi.isAnyFilterPresent();
    const filterModel = gridApi.getFilterModel();
    filterCount = Object.keys(filterModel).length;
  }

  const gridOptions: GridOptions = {
    onFilterChanged: () => {
      updateFilterState();
    },
  };
</script>
```

**Pattern 3: $effect for loading state**
```svelte
<script lang="ts">
  let gridApi = $state<GridApi | null>(null);

  // Load preferences when gridApi becomes available
  $effect(() => {
    if (gridApi) {
      loadFilterState();
      loadColumnState();
    }
  });
</script>
```

**Pattern 4: Column visibility state**
```svelte
<script lang="ts">
  let columnVisibility = $state<Record<string, boolean>>({
    item: true,
    type: true,
    duration: true,
    views: false,
    // ...
  });

  // Sync visibility changes to grid
  $effect(() => {
    if (!gridApi) return;
    Object.entries(columnVisibility).forEach(([colId, visible]) => {
      gridApi.setColumnsVisible([colId], visible);
    });
  });

  // Sync grid changes back to state
  const gridOptions: GridOptions = {
    onColumnVisible: () => {
      if (!gridApi) return;
      const state = gridApi.getColumnState();
      state.forEach(col => {
        if (col.colId) {
          columnVisibility[col.colId] = !col.hide;
        }
      });
    },
  };
</script>
```

**Warning:** Avoid infinite loops. If `$effect` calls `gridApi.setColumnsVisible()`, which triggers `onColumnVisible`, which updates state, which triggers `$effect` again, you'll have an infinite loop.

**Solution:** Use tracking variables:
```svelte
let isUpdatingFromGrid = false;
let isUpdatingFromState = false;

$effect(() => {
  if (!gridApi || isUpdatingFromGrid) return;
  isUpdatingFromState = true;
  gridApi.setColumnsVisible(Object.keys(columnVisibility), true);
  isUpdatingFromState = false;
});

const gridOptions: GridOptions = {
  onColumnVisible: () => {
    if (isUpdatingFromState) return;
    isUpdatingFromGrid = true;
    // Update columnVisibility state
    isUpdatingFromGrid = false;
  },
};
```

**Sources:**
- [ag-grid-svelte5-extended](https://github.com/bn-l/ag-grid-svelte5-extended)
- [Understanding Svelte 5 Runes](https://www.htmlallthethings.com/blog-posts/understanding-svelte-5-runes-derived-vs-effect)

### Performance Considerations

**1. Debounce auto-save:**
```typescript
let saveTimer: ReturnType<typeof setTimeout>;

function debouncedSave(fn: () => void, delay: number = 1000) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(fn, delay);
}

const gridOptions: GridOptions = {
  onFilterChanged: () => debouncedSave(saveFilterState),
};
```

**2. Batch grid API calls:**
```typescript
// BAD: Multiple API calls
gridApi.setColumnsVisible(['col1'], true);
gridApi.setColumnsVisible(['col2'], true);
gridApi.setColumnsVisible(['col3'], true);

// GOOD: Single batched call
gridApi.setColumnsVisible(['col1', 'col2', 'col3'], true);
```

**3. Use applyColumnState with defaultState:**
```typescript
// Only update sort, leave other column properties unchanged
gridApi.applyColumnState({
  state: [{ colId: 'views', sort: 'desc' }],
  defaultState: { sort: null },  // Clear other sorts
  applyOrder: false,  // Don't reorder columns
});
```

---

## 7. User Preference Schema (Backend)

### Database Design

**Table: `user_preferences`**

```sql
CREATE TABLE public.user_preferences (
  id serial NOT NULL,
  user_id integer NOT NULL,
  preference_key varchar(255) NOT NULL,
  preference_value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT user_preferences_pk PRIMARY KEY(id),
  CONSTRAINT user_preferences_unique_key UNIQUE(user_id, preference_key),
  CONSTRAINT user_preferences_users_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE INDEX idx_user_preferences_user_id ON public.user_preferences(user_id);
```

**Design rationale:**
- **Property Bag pattern** — Each preference is a key-value pair (flexible schema)
- **JSONB value** — Allows complex nested preferences without schema changes
- **Unique constraint** — One value per (user, key) pair
- **Cascade delete** — Preferences deleted when user is deleted
- **Index on user_id** — Fast lookups for all user preferences

**Source:** [Storing User Settings in a Relational Database](https://culttt.com/2015/02/02/storing-user-settings-relational-database)

### GraphQL Schema

```graphql
"""
User preference key-value storage.
Supports nested JSON values for complex preferences.
"""
type UserPreference {
  id: ID!
  preferenceKey: String!
  preferenceValue: JSON!
  createdAt: Time!
  updatedAt: Time!
}

input SetUserPreferenceInput {
  preferenceKey: String!
  preferenceValue: JSON!
}

extend type Query {
  """
  Get a single user preference by key.
  Returns null if preference does not exist.
  """
  getUserPreference(key: String!): UserPreference

  """
  List all preferences for the current user.
  """
  listUserPreferences: [UserPreference!]!
}

extend type Mutation {
  """
  Set or update a user preference.
  Creates if key doesn't exist, updates if it does.
  """
  setUserPreference(input: SetUserPreferenceInput!): UserPreference!

  """
  Delete a user preference by key.
  Returns true if deleted, false if key didn't exist.
  """
  deleteUserPreference(key: String!): Boolean!

  """
  Delete all preferences for the current user.
  Returns count of deleted preferences.
  """
  clearUserPreferences: Int!
}
```

### Domain Model (Go)

```go
// internal/core/domain/user_preference.go
package domain

import "time"

type UserPreference struct {
  ID             int
  UserID         int
  PreferenceKey  string
  PreferenceValue map[string]interface{} // JSONB stored as map
  CreatedAt      time.Time
  UpdatedAt      time.Time
}

// Predefined preference keys
const (
  PrefKeyActivityTableFilters   = "activityTable.filters"
  PrefKeyActivityTableColumns   = "activityTable.columns"
  PrefKeyActivityTableSavedViews = "activityTable.savedViews"
  PrefKeyActivityTablePageSize  = "activityTable.pageSize"
)
```

### Repository Interface (Go)

```go
// internal/core/ports/repositories/user_preference_repository.go
package repositories

import (
  "context"
  "github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

type UserPreferenceRepository interface {
  // GetByKey retrieves a preference by user ID and key
  GetByKey(ctx context.Context, userID int, key string) (*domain.UserPreference, error)

  // ListByUserID retrieves all preferences for a user
  ListByUserID(ctx context.Context, userID int) ([]*domain.UserPreference, error)

  // Set creates or updates a preference
  Set(ctx context.Context, pref *domain.UserPreference) error

  // Delete removes a preference by user ID and key
  Delete(ctx context.Context, userID int, key string) error

  // DeleteAllByUserID removes all preferences for a user
  DeleteAllByUserID(ctx context.Context, userID int) (int64, error)
}
```

### Frontend Integration

**TypeScript types:**
```typescript
// lib/types/preferences.ts
export interface ActivityTablePreferences {
  filters: Record<string, any> | null;
  columns: ColumnState[];
  savedViews: SavedView[];
  pageSize: number;
}

export interface SavedView {
  id: string;
  name: string;
  filterState: Record<string, any>;
  columnState: ColumnState[];
  createdAt: string;
}
```

**GraphQL queries:**
```typescript
// lib/queries/preferences.ts
import { gql } from 'graphql-request';

export const GET_USER_PREFERENCE = gql`
  query GetUserPreference($key: String!) {
    getUserPreference(key: $key) {
      preferenceKey
      preferenceValue
      updatedAt
    }
  }
`;

export const SET_USER_PREFERENCE = gql`
  mutation SetUserPreference($input: SetUserPreferenceInput!) {
    setUserPreference(input: $input) {
      preferenceKey
      preferenceValue
      updatedAt
    }
  }
`;
```

**Preference sync service:**
```typescript
// lib/services/preferenceSync.ts
import { graphqlClient } from '$lib/queries/client';
import { GET_USER_PREFERENCE, SET_USER_PREFERENCE } from '$lib/queries/preferences';

export class PreferenceSync {
  /**
   * Load preference from backend, fallback to localStorage
   */
  static async load<T>(key: string, localStorageKey: string): Promise<T | null> {
    try {
      const response = await graphqlClient.request(GET_USER_PREFERENCE, { key });
      if (response.getUserPreference) {
        return response.getUserPreference.preferenceValue as T;
      }
    } catch (error) {
      console.warn('Failed to load preference from backend, using localStorage', error);
    }

    // Fallback to localStorage
    const local = localStorage.getItem(localStorageKey);
    return local ? JSON.parse(local) : null;
  }

  /**
   * Save preference to backend AND localStorage
   */
  static async save<T>(key: string, localStorageKey: string, value: T): Promise<void> {
    // Save to localStorage immediately (optimistic)
    localStorage.setItem(localStorageKey, JSON.stringify(value));

    // Sync to backend (async, don't block)
    try {
      await graphqlClient.request(SET_USER_PREFERENCE, {
        input: { preferenceKey: key, preferenceValue: value }
      });
    } catch (error) {
      console.error('Failed to sync preference to backend', error);
      // localStorage still has the value, so user experience is not affected
    }
  }
}
```

---

## 8. Implementation Steps

### Phase 1: Toolbar with localStorage (v1.1)

**Step 1: Add missing shadcn components**
```bash
# Add Separator component (if not available)
npx shadcn-svelte@latest add separator

# Add Badge component (for filter count)
npx shadcn-svelte@latest add badge
```

**Step 2: Create Toolbar component**
- File: `frontend/src/lib/components/ActivityTableToolbar.svelte`
- Sections: Filters, Columns, Views, Export, Reset
- Props: `gridApi`, `onClearFilters`, `onExportCSV`, `onResetDefaults`

**Step 3: Implement localStorage persistence**
- File: `frontend/src/lib/services/gridStateManager.ts`
- Functions: `saveFilterState`, `loadFilterState`, `saveColumnState`, `loadColumnState`, `saveView`, `loadView`
- Storage keys: `perspectize:activityTable:*`

**Step 4: Add toolbar to ActivityTable**
- Import `ActivityTableToolbar`
- Pass `gridApi` and callback functions
- Load saved state in `onGridReady`

**Step 5: Implement toolbar actions**
- Clear all filters: `gridApi.setFilterModel(null)`
- Column visibility picker: Dropdown with checkboxes
- Save/load views: Dialog with view name input
- Export CSV: `gridApi.exportDataAsCsv()`
- Reset to defaults: `gridApi.resetColumnState()` + `gridApi.setFilterModel(null)`

**Step 6: Add keyboard shortcuts**
- Window keydown listener
- Ctrl+Shift+F (clear filters), E (export), R (reset)

**Testing checklist:**
- [ ] Clear all filters button clears filters
- [ ] Clear filters button hidden when no filters active
- [ ] Column picker toggles visibility correctly
- [ ] Column visibility persists on page reload
- [ ] Save view dialog saves filter + column state
- [ ] Load view restores filter + column state
- [ ] Export CSV downloads file with correct columns
- [ ] Reset button clears all state
- [ ] Keyboard shortcuts work
- [ ] localStorage keys namespaced correctly

### Phase 2: Backend Sync (post-authentication)

**Step 1: Database migration**
- File: `backend/migrations/000011_add_user_preferences.up.sql`
- Table: `user_preferences` with JSONB value

**Step 2: Domain model**
- File: `backend/internal/core/domain/user_preference.go`
- Struct: `UserPreference` with PreferenceValue as `map[string]interface{}`

**Step 3: Repository**
- File: `backend/internal/core/ports/repositories/user_preference_repository.go` (interface)
- File: `backend/internal/adapters/repositories/postgres/gorm_user_preference_repository.go` (implementation)

**Step 4: Service**
- File: `backend/internal/core/services/user_preference_service.go`
- Methods: `GetPreference`, `SetPreference`, `DeletePreference`, `ListPreferences`

**Step 5: GraphQL schema**
- File: `backend/schema.graphql`
- Types: `UserPreference`, `SetUserPreferenceInput`
- Queries: `getUserPreference`, `listUserPreferences`
- Mutations: `setUserPreference`, `deleteUserPreference`

**Step 6: Resolvers**
- File: `backend/internal/adapters/graphql/resolvers/user_preference_resolver.go`

**Step 7: Frontend integration**
- File: `frontend/src/lib/queries/preferences.ts` (GraphQL queries)
- File: `frontend/src/lib/services/preferenceSync.ts` (Sync service)
- Update `ActivityTable.svelte` to use PreferenceSync instead of direct localStorage

**Step 8: Migration strategy**
- On login, check localStorage for preferences
- If found, sync to backend
- Clear localStorage after successful sync
- Subsequent loads use backend API

**Testing checklist:**
- [ ] Preference saved to database on change
- [ ] Preference loaded from database on page load
- [ ] localStorage migrated to backend on login
- [ ] Cross-device sync works (login on different browser)
- [ ] Preference deleted from database when user deleted (cascade)

---

## 9. Open Questions & Risks

### Questions

1. **Multi-sort indicator:** AG Grid shows sort index (1, 2, 3...) on headers. Is this sufficient UX or should toolbar show active sorts?
2. **View management:** Should saved views be per-user or shareable? (v1.1: per-user only)
3. **Mobile toolbar:** Should toolbar collapse into dropdown on mobile? (Perspectize already hides most columns on mobile)
4. **Export format:** CSV only or add JSON/Excel (Enterprise) later?
5. **Keyboard shortcut conflicts:** Ctrl+Shift+F conflicts with browser find in some cases. Use different shortcuts?

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **localStorage quota exceeded** | Low | Medium | 10KB per state × 100 views = 1MB (well under 5MB limit) |
| **ag-grid-svelte5-extended breaking changes** | Medium | High | Pin version, test updates in feature branch |
| **Infinite loop in $effect** | Medium | High | Use tracking variables, careful dependency management |
| **CSV injection vulnerability** | Low | High | Sanitize cell values in `processCellCallback` |
| **Backend migration complexity** | Medium | Medium | Implement localStorage first, add backend later |

---

## 10. Conclusion & Recommendations

### What to Build in v1.1

**MVP Toolbar (Phase 1):**
1. ✅ Clear all filters button
2. ✅ Column visibility dropdown
3. ✅ Export to CSV button
4. ✅ Reset to defaults button
5. ✅ localStorage persistence for filters, columns, page size
6. ✅ Keyboard shortcuts (Ctrl+Shift+F, E, R)

**Defer to later:**
- ❌ Saved views (complex UX, requires Dialog component)
- ❌ Backend sync (requires authentication)
- ❌ Clipboard copy (Enterprise only)
- ❌ Excel export (Enterprise only)

### Recommended Implementation Order

1. **Add Toolbar skeleton** (1-2 hours)
   - Create `ActivityTableToolbar.svelte`
   - Add to `ActivityTable.svelte` above grid
   - Wire up gridApi prop

2. **Implement Clear Filters** (1 hour)
   - Button with onClick → `gridApi.setFilterModel(null)`
   - Reactive filter count badge
   - Hide button when no filters active

3. **Implement Column Visibility** (3-4 hours)
   - Dropdown with checkbox items
   - Sync column visibility state with gridApi
   - Avoid infinite loops with tracking variables

4. **Implement localStorage persistence** (2-3 hours)
   - Create `gridStateManager.ts` service
   - Save/load filter state on change (debounced)
   - Save/load column state on change (debounced)
   - Load state in `onGridReady`

5. **Implement Export CSV** (1 hour)
   - Button with onClick → `gridApi.exportDataAsCsv()`
   - Custom filename with timestamp
   - Export only visible columns

6. **Implement Reset** (1 hour)
   - Clear filters, reset column state
   - Clear localStorage
   - Confirmation dialog (optional)

7. **Add keyboard shortcuts** (1-2 hours)
   - Window keydown listener
   - Ctrl+Shift+F, E, R shortcuts
   - Display shortcuts in button tooltips

**Total estimated effort:** 10-15 hours (2-3 days)

### Success Metrics

- [ ] Toolbar visible above ActivityTable
- [ ] All toolbar buttons functional
- [ ] Filter/column state persists on page reload
- [ ] No console errors or infinite loops
- [ ] CSV export downloads correctly
- [ ] Keyboard shortcuts work
- [ ] Mobile-responsive (toolbar collapses if needed)

### Sources

**AG Grid Documentation:**
- [Filter API](https://www.ag-grid.com/javascript-data-grid/filter-api/)
- [Column State API](https://www.ag-grid.com/javascript-data-grid/column-state/)
- [Multi-Column Sorting](https://www.ag-grid.com/javascript-data-grid/row-sorting/#multi-column-sorting)
- [CSV Export](https://www.ag-grid.com/javascript-data-grid/csv-export/)
- [Clipboard](https://www.ag-grid.com/javascript-data-grid/clipboard/)
- [Keyboard Navigation](https://www.ag-grid.com/javascript-data-grid/keyboard-navigation/)
- [Grid API Reference](https://www.ag-grid.com/javascript-data-grid/grid-api/)

**State Persistence:**
- [LocalStorage vs SessionStorage vs Cookies](https://www.geeksforgeeks.org/javascript/difference-between-local-storage-session-storage-and-cookies/)
- [Client-Side Storage Guide](https://www.frontendtools.tech/blog/client-side-storage-guide-localstorage-sessionstorage-indexeddb/)
- [Storing User Settings in a Relational Database](https://culttt.com/2015/02/02/storing-user-settings-relational-database)

**shadcn-svelte:**
- [Dropdown Menu](https://www.shadcn-svelte.com/docs/components/dropdown-menu)

**Svelte 5:**
- [ag-grid-svelte5-extended](https://github.com/bn-l/ag-grid-svelte5-extended)
- [Understanding Svelte 5 Runes: $derived vs $effect](https://www.htmlallthethings.com/blog-posts/understanding-svelte-5-runes-derived-vs-effect)
