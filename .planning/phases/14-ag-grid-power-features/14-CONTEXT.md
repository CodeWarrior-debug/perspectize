# Phase 14: AG Grid Power Features — Context

## Phase Goal

Add toolbar with power-user controls for filter/column management. Persist user preferences.

## Problem Statement

From FEATURE_BACKLOG.md:

"Add a toolbar above ActivityTable with power-user grid controls. All features below use AG Grid Community APIs — no Enterprise license needed."

Power users need:
- Clear all filters at once (currently must clear each column)
- Show/hide columns without dev tools
- Persist their preferred layout across sessions
- Export data for offline analysis

## Research Summary

See `.planning/v1.1-research/AG-GRID-POWER-FEATURES.md` for full research.

**Key APIs (AG Grid Community):**
- `gridApi.setFilterModel(null)` — Clear all filters
- `gridApi.setColumnsVisible(['col1', 'col2'], true/false)` — Column visibility
- `gridApi.getColumnState()` / `gridApi.applyColumnState({state})` — Save/restore columns
- `gridApi.getFilterModel()` / `gridApi.setFilterModel(saved)` — Save/restore filters
- `gridApi.exportDataAsCsv()` — CSV export

**State persistence:** localStorage (MVP), backend sync (post-auth)
- localStorage: 10-15 hours implementation, works for anonymous
- Backend: Requires auth (Phase 12), adds 8-10 hours

**Toolbar components:** shadcn-svelte Button, DropdownMenu
- May need to add Separator, Badge

## Current Architecture

```svelte
<!-- ActivityTable.svelte (current) -->
<AgGridSvelte
    bind:gridApi
    columnDefs={columnDefs}
    rowData={data}
/>
```

No toolbar, no state persistence, no export.

## Target Architecture

```svelte
<!-- ActivityTable.svelte (target) -->
<div class="flex flex-col gap-2">
    <GridToolbar
        {gridApi}
        onClearFilters={() => gridApi.setFilterModel(null)}
        onExportCsv={() => gridApi.exportDataAsCsv()}
        onReset={() => restoreDefaults()}
    />
    <AgGridSvelte
        bind:gridApi
        columnDefs={columnDefs}
        rowData={data}
        onFilterChanged={saveFilterState}
        onColumnMoved={saveColumnState}
    />
</div>
```

## Component Design

```svelte
<!-- GridToolbar.svelte -->
<script lang="ts">
    import { Button, DropdownMenu } from '$lib/shadcn';

    let { gridApi, onClearFilters, onExportCsv, onReset } = $props();
</script>

<div class="flex items-center gap-2 px-2 py-1.5 bg-muted/50 rounded-t-lg border-b">
    <!-- Clear Filters -->
    <Button variant="ghost" size="sm" onclick={onClearFilters}>
        <FilterX class="h-4 w-4 mr-1" />
        Clear Filters
    </Button>

    <!-- Column Visibility -->
    <DropdownMenu>
        <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
                <Columns class="h-4 w-4 mr-1" />
                Columns
            </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
            {#each columnDefs as col}
                <DropdownMenuCheckboxItem
                    checked={!col.hide}
                    onCheckedChange={(checked) => toggleColumn(col.field, checked)}
                >
                    {col.headerName}
                </DropdownMenuCheckboxItem>
            {/each}
        </DropdownMenuContent>
    </DropdownMenu>

    <!-- Export -->
    <Button variant="ghost" size="sm" onclick={onExportCsv}>
        <Download class="h-4 w-4 mr-1" />
        Export CSV
    </Button>

    <div class="flex-1" />

    <!-- Reset -->
    <Button variant="ghost" size="sm" onclick={onReset}>
        <RotateCcw class="h-4 w-4 mr-1" />
        Reset
    </Button>
</div>
```

## State Persistence

```typescript
// localStorage keys
const FILTER_STATE_KEY = 'perspectize:grid:filters';
const COLUMN_STATE_KEY = 'perspectize:grid:columns';

// Save state
function saveFilterState() {
    const filterModel = gridApi.getFilterModel();
    localStorage.setItem(FILTER_STATE_KEY, JSON.stringify(filterModel));
}

function saveColumnState() {
    const columnState = gridApi.getColumnState();
    localStorage.setItem(COLUMN_STATE_KEY, JSON.stringify(columnState));
}

// Restore state on init
function restoreState() {
    const filters = localStorage.getItem(FILTER_STATE_KEY);
    if (filters) {
        gridApi.setFilterModel(JSON.parse(filters));
    }

    const columns = localStorage.getItem(COLUMN_STATE_KEY);
    if (columns) {
        gridApi.applyColumnState({ state: JSON.parse(columns) });
    }
}

// Reset to defaults
function restoreDefaults() {
    localStorage.removeItem(FILTER_STATE_KEY);
    localStorage.removeItem(COLUMN_STATE_KEY);
    gridApi.setFilterModel(null);
    gridApi.applyColumnState({ state: DEFAULT_COLUMN_STATE });
}
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+Shift+C | Clear all filters |
| Ctrl+Shift+E | Export CSV |
| Ctrl+Shift+R | Reset to defaults |

```typescript
// Global keyboard handler
$effect(() => {
    function handleKeydown(e: KeyboardEvent) {
        if (e.ctrlKey && e.shiftKey) {
            switch (e.key.toUpperCase()) {
                case 'C':
                    e.preventDefault();
                    gridApi?.setFilterModel(null);
                    break;
                case 'E':
                    e.preventDefault();
                    gridApi?.exportDataAsCsv();
                    break;
                case 'R':
                    e.preventDefault();
                    restoreDefaults();
                    break;
            }
        }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
});
```

## Requirements Covered

- GRID-01 through GRID-09 (all AG Grid power features)

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Filter clear clicks | N per column | 1 click |
| Column visibility | Dev tools only | UI picker |
| State persistence | None | localStorage |
| Export capability | None | CSV download |

## Dependencies

- None (can parallel with other phases)

## Risks

- **AG Grid Svelte 5 wrapper:** Already validated in v1.0, low risk
- **Reactivity loops:** Svelte 5 $effect needs careful management
- **localStorage limits:** ~5MB limit, but state is < 1KB

## Open Questions

1. Should multi-column sort be enabled by default (Ctrl+click)?
2. Should keyboard shortcuts be documented in UI (tooltip)?
3. Should we add "Saved Views" feature (name and manage layouts)?

---

*Context gathered: 2026-02-16*
