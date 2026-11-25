# Library column definitions (C1) Implementation Plan

> Written without the superpowers planning skill loaded in this session: the plan follows the superpowers:writing-plans shape (goal, architecture, file map, ordered tasks with test-first steps) but was authored directly.

**Goal:** Define each Library column once, in one deep module, and derive every consumer from it: column and sort pickers, sort maps, URL-to-filter conversion, GraphQL filter building, Loaded-mode filtering and sorting, AG Grid ColDefs, export text, default visibility and chart eligibility.

**Architecture:** A `LibraryColumn` entry (in `frontend/src/lib/utils/libraryColumns/`) carries a column's facts: label, header tooltip, sort rule, filter rule, view tiers, export text, chart views and renderer hooks. `index.ts` is the module's interface and exposes derived lists and maps. Five seams sit on top of it: the grid builder (`components/library/columns.ts`), the URL codec (`gridUrlState.ts`), the client rows engine (`libraryColumns/clientRows.ts`), the export table (`exportTable.ts`) and chart gating (`columnCharts.ts`). `grid-config.ts` keeps only the pure helpers that do not depend on the column list, which avoids an import cycle: `contentTypeFilter.ts` imports `grid-config.ts`, so `grid-config.ts` must not import the new module.

**Tech stack:** SvelteKit (Svelte 5 runes), TypeScript, Vitest (unit and Browser Mode), AG Grid (`ag-grid-svelte5`, v32).

**Vocabulary.** Module, interface, depth, seam, adapter, leverage and locality follow the codebase-design skill. Browsing terms follow `docs/glossary/browsing/GLOSSARY.md`: Item column, Column picker, Column view, Column relevance callout, Type filter, Data mode ("All" and "Loaded"), Age rating, Creator, Responsive tier, Card mode.

---

## Task 1: Golden master before the change

- [x] Write a golden-master test (`tests/unit/library-columns-golden.test.ts`) that snapshots the pre-refactor picker lists, sort and filter maps, visibility for every tier, view and solo type, view and item-header mapping, export text and ColDef shape. Functions are reduced to their kind so the snapshot is stable.
- [x] Generate the baseline snapshot from the pre-refactor source, then compare the post-refactor output with it semantically (Task 6). The snapshot and test were removed after review and are not kept in the PR.

## Task 2: Introduce the column module

- [x] Add `definition.ts` (`LibraryColumn`, `SortRule`, `FilterRule`, `ViewTiers`, `RowValue`, `LIBRARY_VIEWS`).
- [x] Add `filterCodec.ts` as a leaf module (no import of `grid-config.ts` or `index.ts`): set, number-range and date-range parsing, and the `textField` helper.
- [x] Add the four column files: `columnsGeneral.ts`, `columnsMovie.ts`, `columnsBookWeb.ts`, `columnsInternal.ts`. Each entry is one `LibraryColumn`.
- [x] Move `libraryTooltipSpecs.ts` to `libraryColumns/tooltips.ts` with `git mv` (history kept). It exports `TIP`.
- [x] Add `index.ts`: `LIBRARY_COLUMNS` (picker order), `libraryColumn()`, `RETIRED_COL_IDS`, the derived lists and maps, `exportCellText`, `defaultColumnVisibility`, `initiallyHidden`, `isChartEligible`, `chartableColIds`.

## Task 3: Rewire the consumers (each is a seam)

- [x] Grid builder: `components/library/columns.ts` builds ColDefs from `LIBRARY_COLUMNS`. It keeps the header-width floor (`headerMinWidth`) and the chart hooks. `HEADER_COMPONENTS` maps the perspective header renderer.
- [x] URL codec: `gridUrlState.ts` converts filters both ways. Server filter building loops over each column's `filter.server` rule. Only `PERSON_FILTER_KEY` is special-cased.
- [x] Client rows: `clientRows.ts` owns `compareContentBySorts` and `filterContentRows`, moved out of `grid-config.ts`.
- [x] Export: `exportTable.ts` keeps only the pure table builder and number formatting. `exportGrid.ts` and `exportCellText` read the module's export lists.
- [x] Charts: `columnCharts.ts` derives its chart types from `CHART_ELIGIBLE_COLS`. `columnCharts.svelte.ts` picks chartable columns through `chartableColIds`.
- [x] Pickers and filter chips: `ColumnPickerDialog.svelte`, `SortPickerDialog.svelte` and `FilterChips.svelte` import their labels and lists from the module.
- [x] `ContentLibrary.svelte` changes only its import block and call sites (it must not grow; it was 1115 lines before and after).

## Task 4: Deletions and shrinkage

- `grid-config.ts`: 1075 lines to 307. Removed `COLUMNS`, `ColumnMeta`, `RETIRED_COL_IDS`, `NUMERIC_COL_IDS`, `defaultColumnVisibility`, `TogglableColumn`, `DATA`/`INTERNAL`/`SORTABLE` lists, `sortableColumnsFor`, the sort and column maps, `COLUMN_LABELS`, `compareContentBySorts` and `filterContentRows`.
- `gridUrlState.ts`: 817 lines to about 330.
- `components/library/columns.ts`: 745 lines to about 65.

## Task 5: Replace the source-parity tests with interface tests

The three regex parity tests read source text and compared it with patterns. They are replaced by `tests/unit/library-columns.test.ts`, which goes through the module and the real grid builder.

- Deleted: `column-registry-parity.test.ts`, `column-label-parity.test.ts`, `export-text-parity.test.ts`, `library-columns-golden.test.ts` (and its snapshot, after review).
- Deleted: the source-text blocks in `bookColumns.test.ts` and `movieColumns.test.ts` (min-width checks read from `columns.ts` source). The same checks now read real ColDefs.
- New: `library-columns.test.ts` asserts that every column is defined once, that each ColDef exists, that every filterable column has a server mapping or is marked `clientOnly` (the server-or-client-only rule), that the pickers and sort maps match the module, that default sets fit the 1212px grid, that comparators are wired, that numeric and chart rules hold, and that client rows and exports behave.

## Task 6: Golden review (intended differences only)

The golden master was compared semantically (arrays as sets, so reordering does not count). Results:

- Visibility sets are identical for every tier, view and solo type.
- Intended change: Book pages and rating become `rightAligned`, numeric, and chartable in Book view (`headerComponentParams` gains the chart template).
- Initial `hide` flips: `category` (now shown from sm up in general) and `user` (now always hidden initially). The visibility effect in `ContentLibrary` sets the real state on grid ready, so the initial flag does not change what a person sees.
- Column order in the grid now follows the picker order. Visible arrays are reordered, not changed in membership.

## Decisions for review

1. **Client-only sorts with no server key.** `effectiveDate`, `evaluateBy` and `webSite` are sortable with no server key and are not marked `clientOnly`. Kept as-is in this PR; marking them would hide working header sorts in "All" mode, which is a behaviour change.
2. **Client-only filters are not hidden in All Items mode.** Webpage Site, Published and Author are marked `filter.clientOnly`. Behaviour is unchanged (they were silently dropped in All Items mode before). Hiding the controls is a UI change left for a decision.
3. **Book pages and rating** become numeric, right-aligned and chartable. This is the one intended visible change.
4. **Follow-up:** map Webpage Site, Published and Author to the server after #870 deploys; #865 closes with that follow-up.
