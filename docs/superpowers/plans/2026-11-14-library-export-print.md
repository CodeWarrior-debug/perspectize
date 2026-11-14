# Library export and print Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Export menu to the Library grid that prints the page two ways (As seen, As list), downloads it as CSV and copies it for pasting into a spreadsheet.

**Architecture:** One pure table (`ExportTable`) is read from the live grid (`getCellValue` with the formatter, so cells match the screen) and feeds print-as-list, CSV and Copy. Print goes through the system dialog, driven by a `data-print` attribute on `<html>` plus `@media print` CSS. Tasks 1-7 are the shared base; the CSV/Copy step is built twice (Tasks 8, 9) on two branches and one is kept (Task 10).

**Tech Stack:** SvelteKit, Svelte 5 runes, AG Grid Community 32.3.9 (`@ag-grid-community/*`), shadcn-svelte (Dialog, Popover, Input, Button), svelte-sonner, Vitest + @testing-library/svelte.

**Spec:** `docs/superpowers/specs/2026-11-14-library-export-print-design.md`

**Branch note:** this plan and its spec were merged to `main` before any execution. Start from a fresh branch cut from `origin/main` in a numbered worktree slot, named `feature/content-export-print`; that branch is "the base" in Tasks 8-10.

## Global Constraints

- Export is offered on the desktop grid only; Card mode (under 860px) shows no Export button.
- Rows are what the grid displays after client filter and sort; columns are the shown columns in on-screen order, minus the action column (`perspectize`, empty header).
- CSV and Copy add one trailing **Link** column holding each row's `url`; Print leaves it out. If the admin `url` column ("Source URL") is already shown, add no second Link column.
- CSV: UTF-8 with a byte-order mark so Excel keeps accents; RFC 4180 quoting; CRLF line endings; file name like `perspectize-library-2026-11-14.csv`.
- Copy: tab-separated, header row included, tabs and line breaks inside a cell become spaces; toast on success ("Copied N rows") and on failure.
- Print: opens the system dialog (`window.print()`); **As seen** prints the live grid (header on page 1 only is accepted); **As list** is a plain table whose header repeats on every page, rows never split, page chrome hidden; options are a title (default "Library", editable) and spacing (compact, standard, roomy); item names are links.
- No new network request. No `.xlsx`, Google Sheets API, own PDF generator or mass export (all deferred).
- Repo rules: one shell command per Bash call (never `&&`); `pnpm --dir frontend ...`; icons are per-icon `@lucide/svelte/icons/<name>` imports; no raw hex/rgb in `src/lib/components/**` (theme tokens); new shadcn components go in `shadcn/` and its barrel; Conventional Commits; run only targeted tests while iterating, full suites once before pushing.

## Review Focus

1. A recipe title containing a comma, double quote or line break must stay one cell in Excel and Sheets (Task 8).
2. A title starting `=`, `+`, `-` or `@` must not run as a formula, yet a negative ROI like `-12%` must stay a number (Task 1).
3. A row with no `url` gets a blank Link; an admin who already shows Source URL gets no duplicate Link (Task 1).
4. Accented and non-Latin titles (`Crème brûlée`, `日本語`) survive the CSV download (Task 8).
5. Cancelling the print dialog must leave the grid in its normal layout and the page visible again (Task 4).

## File Structure

- Create `frontend/src/lib/utils/exportTable.ts`: pure table types, cell text, formula guard, `buildExportTable`.
- Create `frontend/src/lib/utils/exportGrid.ts`: reads the displayed rows and shown columns from the grid API.
- Create `frontend/src/lib/utils/printing.ts`: `runPrint` (the `data-print` attribute and `afterprint` cleanup).
- Create `frontend/src/lib/components/PrintListView.svelte`: the print-only table, portalled to `<body>`.
- Create `frontend/src/lib/components/PrintOptionsDialog.svelte`: title and spacing, then Print.
- Create `frontend/src/lib/components/ExportMenu.svelte`: the popover menu.
- Modify `frontend/src/app.css` (print rules), `frontend/src/lib/components/ActivityTable.svelte` (toolbar, state, handlers), `.claude/docs/ADDING_AG_GRID_COLUMN.md` (checklist line).
- Spike files (Tasks 8, 9 only): `frontend/src/lib/utils/exportActions.ts`, and in Task 8 `exportSerialize.ts`.
- Tests: `frontend/tests/unit/{exportTable,exportGrid,export-text-parity,printing,exportSerialize,exportActions}.test.ts`, `frontend/tests/components/{PrintListView,PrintOptionsDialog,ExportMenu}.test.ts`.

---

### Task 1: Export table and cell text

**Files:**
- Create: `frontend/src/lib/utils/exportTable.ts`
- Test: `frontend/tests/unit/exportTable.test.ts`

**Interfaces:**
- Produces:
  - `type ExportMode = 'spreadsheet' | 'print'`
  - `interface ExportColumn { colId: string; header: string }`
  - `interface ExportTable { columnIds: string[]; headers: string[]; rows: string[][]; rowUrls: (string | null)[] }` (`columnIds` aligns with `headers`; the Link column's id is `'link'`)
  - `const RENDERED_TEXT_COLIDS = ['item', 'category', 'cast'] as const` and `const EXPORT_EXCLUDED_COLIDS = ['perspectize'] as const`
  - `neutralizeFormula(text: string): string`
  - `exportCellText(row: ContentItem, colId: string, gridValue: unknown): string`
  - `buildExportTable(input: { columns: ExportColumn[]; rows: ContentItem[]; cellText: (row: ContentItem, colId: string) => string; mode: ExportMode }): ExportTable`

- [ ] **Step 1: Write the failing tests** in `exportTable.test.ts`:
  - `neutralizeFormula`: `'=SUM(A1)'` → `"'=SUM(A1)"`; `'+1 555 0100'` → `"'+1 555 0100"`; `'@mention'` → `"'@mention"`; `'-evil'` → `"'-evil"`; `'\t=x'` → `"'\t=x"`; unchanged: `'-12%'`, `'-3.5'`, `'+5'`, `'Crème brûlée'`, `''`.
  - `exportCellText`: item returns `displayTitle` when set, else `name` (`{name:'Lasagna', displayTitle:"Nonna's Lasagna"}` → `"Nonna's Lasagna"`); category returns `primaryCategory.label`, `''` when null; cast returns director names then cast by `order`, comma-joined (`'Greta Gerwig, Margot Robbie'`; build the fixture from `moviePeople`/`movieResponse` in `formatting.ts`); any other column returns `String(gridValue)`, `''` for `null`/`undefined`, and `''` when the text equals `EMPTY_VALUE` (`'—'`).
  - `buildExportTable` mode `'spreadsheet'`: headers are the columns' headers then `'Link'`; each row ends with the row's `url` or `''`; a cell `'=cmd'` becomes `"'=cmd"`; if a column has `colId: 'url'` no `Link` column is added. Mode `'print'`: no Link column, no neutralizing (`'=cmd'` unchanged). `rowUrls` holds each row's `url` in both modes. Zero rows → headers only, `rows: []`.
- [ ] **Step 2: Run to verify failure:** `pnpm --dir frontend exec vitest run tests/unit/exportTable.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the interfaces above in `exportTable.ts`. The formula guard triggers on a leading `=`, `+`, `-`, `@`, tab or carriage return and exempts text matching `/^[-+]?\d+([.,]\d+)*%?$/`; the prefix is a single quote.
- [ ] **Step 4: Run to verify pass:** same command. Expected: PASS.
- [ ] **Step 5: Commit:** `git add frontend/src/lib/utils/exportTable.ts frontend/tests/unit/exportTable.test.ts`, then `git commit -m "feat(frontend): add export table and cell text for the Library grid"` (separate Bash calls).

---

### Task 2: Read the table from the grid, and a drift guard

**Files:**
- Create: `frontend/src/lib/utils/exportGrid.ts`
- Modify: `.claude/docs/ADDING_AG_GRID_COLUMN.md` (add a line to the "Registries a column must be added to" checklist)
- Test: `frontend/tests/unit/exportGrid.test.ts`, `frontend/tests/unit/export-text-parity.test.ts`

**Interfaces:**
- Consumes: Task 1's `buildExportTable`, `exportCellText`, `ExportTable`, `ExportMode`, `EXPORT_EXCLUDED_COLIDS`, `RENDERED_TEXT_COLIDS`.
- Produces:
  - `interface ExportGridApi { getAllDisplayedColumns(): { getColId(): string; getColDef(): { headerName?: string } }[]; forEachNodeAfterFilterAndSort(cb: (node: { data?: ContentItem }) => void): void; getCellValue(p: { rowNode: unknown; colKey: string; useFormatter: boolean }): unknown }`
  - `readExportTable(api: ExportGridApi, mode: ExportMode): ExportTable`

- [ ] **Step 1: Write the failing tests.** `exportGrid.test.ts` with a stub api: columns `perspectize` (empty header), `item`, `views` come back as `item`, `views` only; rows follow the callback's order and skip nodes with no `data`; `getCellValue` is called with `useFormatter: true`; a column named in `EXPORT_EXCLUDED_COLIDS` or with an empty `headerName` is dropped; `mode` is passed through (Link present for `'spreadsheet'`). `export-text-parity.test.ts` reads `ActivityTable.svelte?raw` (as `column-registry-parity.test.ts` does), splits it on `colId: '`, and asserts that every colDef block having `cellRenderer:` but no line matching `/^\s*(valueGetter|field):/m` has its colId in `[...RENDERED_TEXT_COLIDS, ...EXPORT_EXCLUDED_COLIDS]`.
- [ ] **Step 2: Run to verify failure:** `pnpm --dir frontend exec vitest run tests/unit/exportGrid.test.ts tests/unit/export-text-parity.test.ts`. Expected: FAIL. (The parity test will pass once the module exists; it must fail first on the missing import.)
- [ ] **Step 3: Implement `readExportTable`** in `exportGrid.ts`: one pass over `forEachNodeAfterFilterAndSort` collecting rows and a row→node map, then `buildExportTable` with a `cellText` that calls `api.getCellValue({ rowNode, colKey: colId, useFormatter: true })` and passes the result to `exportCellText`.
- [ ] **Step 4: Run to verify pass:** same command. Expected: PASS.
- [ ] **Step 5: Add the checklist line** to `ADDING_AG_GRID_COLUMN.md`: "`cellRenderer` with no `valueGetter`/`field`: add its text to `exportCellText` and `RENDERED_TEXT_COLIDS` in `exportTable.ts` (`export-text-parity.test.ts` fails otherwise)".
- [ ] **Step 6: Commit** `feat(frontend): read the Library export table from the grid API`.

---

### Task 3: Print-only list view

**Files:**
- Create: `frontend/src/lib/components/PrintListView.svelte`
- Modify: `frontend/src/app.css` (an `@media print` block, base rules only)
- Test: `frontend/tests/components/PrintListView.test.ts`

**Interfaces:**
- Consumes: `ExportTable` (Task 1).
- Produces: `PrintListView` with props `{ table: ExportTable; title: string; spacing: 'compact' | 'standard' | 'roomy' }`. Root element has class `print-root` and attribute `data-spacing`; it moves itself to be a direct child of `document.body` on mount and removes itself on destroy. Shown only under `html[data-print='list']`.

- [ ] **Step 1: Write the failing tests:** an `<h1>` with the title when non-empty and none when `title` is `''`; `<thead>` holds one row with the `headers`; `<tbody>` has one `<tr>` per row; the cell whose `columnIds` entry is `'item'` is an `<a href=url>` when `rowUrls[i]` is non-null and plain text when null; `data-spacing` equals the prop for each of the three values; after mount `document.body.querySelector(':scope > .print-root')` exists and is gone after unmount; `app.css?raw` contains `table-header-group` and `break-inside: avoid`.
- [ ] **Step 2: Run to verify failure:** `pnpm --dir frontend exec vitest run tests/components/PrintListView.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the component** (a small `use:` action does the body portal) and the `app.css` rules: `.print-root { display: none }` on screen; under `@media print`, `html[data-print='list'] body > :not(.print-root) { display: none !important }`, `html[data-print='list'] .print-root { display: block }`, `.print-root thead { display: table-header-group }`, `.print-root tr { break-inside: avoid }`, and cell padding from `[data-spacing]` (compact 2px, standard 6px, roomy 12px vertical). Black text on white, no theme colours.
- [ ] **Step 4: Run to verify pass:** same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): add the print-only list view`.

---

### Task 4: The print runner and As-seen CSS

**Files:**
- Create: `frontend/src/lib/utils/printing.ts`
- Modify: `frontend/src/app.css`
- Test: `frontend/tests/unit/printing.test.ts`

**Interfaces:**
- Produces: `runPrint(mode: 'list' | 'grid', hooks: { before: () => void | Promise<void>; after: () => void }, win?: Pick<Window, 'print' | 'addEventListener' | 'removeEventListener'>, doc?: Document): Promise<void>`

- [ ] **Step 1: Write the failing tests** (stub `win` with a controllable `afterprint`): `html` gets `data-print="list"` before `print` is called and `before` has run first; dispatching `afterprint` removes `data-print` and runs `after` once; a second `afterprint` does nothing; if `win.print` throws, the attribute is cleared, `after` runs and the error rethrows; a cancelled dialog (`afterprint` with no other signal) restores everything (Review Focus 5); `app.css?raw` contains the As-seen rule `html[data-print='grid'] body *:not(.activity-grid):not(.activity-grid *):not(:has(.activity-grid))`.
- [ ] **Step 2: Run to verify failure:** `pnpm --dir frontend exec vitest run tests/unit/printing.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `runPrint`** and add the As-seen rule under `@media print` (`display: none !important`), plus `html[data-print='grid'] .activity-grid { height: auto !important }`.
- [ ] **Step 4: Run to verify pass:** same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): add the print runner with afterprint cleanup`.

---

### Task 5: Print options dialog

**Files:**
- Create: `frontend/src/lib/components/PrintOptionsDialog.svelte`
- Test: `frontend/tests/components/PrintOptionsDialog.test.ts`

**Interfaces:**
- Produces: props `{ open?: boolean (bindable); onPrint: (opts: { title: string; spacing: 'compact' | 'standard' | 'roomy' }) => void }`. Built on shadcn `Dialog`, `Input`, `Button`.

- [ ] **Step 1: Write the failing tests:** closed renders nothing; open shows the title input with value `Library` and Standard selected; editing the title then clicking Print calls `onPrint({ title: 'Mom\'s favourites', spacing: 'standard' })`; selecting Compact and Roomy each reach `onPrint`; an empty title is sent as `''`; Print closes the dialog (`open` becomes false).
- [ ] **Step 2: Run to verify failure:** `pnpm --dir frontend exec vitest run tests/components/PrintOptionsDialog.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the component** (radio group for spacing; local `$state` reset to the defaults each time it opens).
- [ ] **Step 4: Run to verify pass:** same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): add the print options dialog`.

---

### Task 6: Export menu and toolbar wiring (print items)

**Files:**
- Create: `frontend/src/lib/components/ExportMenu.svelte`
- Modify: `frontend/src/lib/components/ActivityTable.svelte` (toolbar next to Columns / Edit sorts, state, handlers)
- Test: `frontend/tests/components/ExportMenu.test.ts`; extend the existing ActivityTable component test (find the "Choose columns" test with grep and mirror it)

**Interfaces:**
- Consumes: `readExportTable` (Task 2), `runPrint` (Task 4), `PrintListView` (Task 3), `PrintOptionsDialog` (Task 5).
- Produces: `ExportMenu` props `{ disabled: boolean; onPrintAsSeen: () => void; onPrintAsList: () => void; onDownloadCsv?: () => void; onCopy?: () => void }`. Items "Download CSV" and "Copy for spreadsheet" render only when their handler is given.

- [ ] **Step 1: Write the failing tests:** closed shows only the trigger; opening shows "Print as seen…" and "Print as list…"; no CSV/Copy items when those handlers are absent, and both present when given; `disabled` prevents opening; clicking an item calls its handler and closes the menu. In the ActivityTable test: the Export button is absent in Card mode, disabled until the grid is ready, while loading, and with zero rows.
- [ ] **Step 2: Run to verify failure:** `pnpm --dir frontend exec vitest run tests/components/ExportMenu.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `ExportMenu`** on shadcn `Popover`, icons `printer`, `download`, `copy`, `chevron-down` (per-icon imports), button styled like the neighbouring toolbar buttons. In `ActivityTable.svelte`: `exportDisabled = !gridReady || loading || rowData.length === 0`; As seen calls `runPrint('grid', { before: () => gridApi.setGridOption('domLayout','print'), after: () => gridApi.setGridOption('domLayout','normal') })`; As list opens the dialog, and its `onPrint` sets `{ table: readExportTable(gridApi, 'print'), title, spacing }`, awaits `tick()`, then `runPrint('list', { before: mountView, after: unmountView })`.
- [ ] **Step 4: Run to verify pass:** the new tests plus `pnpm --dir frontend exec vitest run tests/components/ActivityTable.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): add the Library Export menu with print`.

---

### Task 7: Check printing in a real browser

**Files:** none (evidence only).

- [ ] **Step 1:** Take the verification slot with the `pr-verification` skill, then serve this worktree's frontend in demo mode (recipe in `frontend/CLAUDE.md`, "Cloud-feasible visual check") with a mocked `ListContent` returning 50 rows.
- [ ] **Step 2:** In Chrome, emulate print media and render to PDF for both modes. Expected: **As list** has the header row on every page, no row cut across a page break, no nav/toolbar/pagination, the title on top; **As seen** shows the grid only, header on page 1. If a wide column set runs off the page in As seen, add `@page { size: landscape }` inside the `html[data-print='grid']` rules and re-check; if pinned columns still overflow, note it in the PR as a known limit.
- [ ] **Step 3:** Cancel the system print dialog from the UI once. Expected: the page and grid look normal again.
- [ ] **Step 4:** Save the PDFs and a screenshot as `sv-` evidence in `~/Downloads/screenshots/`. Release the slot. Fix anything found in the owning task's files and re-run its tests.

---

### Task 8: CSV spike A, our own serializer (own branch)

**Branch:** `feature/content-export-print-csv-own`, cut from the base after Task 7.

**Files:**
- Create: `frontend/src/lib/utils/exportSerialize.ts`, `frontend/src/lib/utils/exportActions.ts`
- Modify: `frontend/src/lib/components/ActivityTable.svelte` (the menu wiring, in a separate commit)
- Test: `frontend/tests/unit/exportSerialize.test.ts`, `frontend/tests/unit/exportActions.test.ts`

**Interfaces:**
- Consumes: `readExportTable`, `ExportGridApi`, `ExportTable`.
- Produces (**the fork surface; Task 9 must match these exactly**):
  - `exportActions.ts`: `downloadLibraryCsv(api: ExportGridApi, now?: Date): void` and `copyLibraryTable(api: ExportGridApi, clipboard?: Pick<Clipboard, 'writeText'>): Promise<number>` (resolves to the row count; rejects if the clipboard refuses)
  - `exportSerialize.ts`: `serializeCsv(table: ExportTable): string`, `serializeTsv(table: ExportTable): string`, `csvFileName(now: Date): string`, `downloadCsv(csv: string, fileName: string, doc?: Document): void`

- [ ] **Step 1: Write the failing tests:** `serializeCsv([['a,b','say "hi"','l1\nl2']])` yields `"a,b","say ""hi""","l1\nl2"` with CRLF between rows; header row comes first; `Crème brûlée` and `日本語` pass through unchanged (Review Focus 1, 4); `serializeTsv` turns tabs and line breaks inside cells into single spaces and ends rows with `\n`; `csvFileName(new Date(2026, 10, 14))` is `perspectize-library-2026-11-14.csv`; `downloadCsv` creates a Blob whose first three bytes are `0xEF 0xBB 0xBF` and clicks a temporary anchor with that file name (stub `URL.createObjectURL`); `copyLibraryTable` writes the TSV and resolves to the row count, and rejects when `writeText` rejects.
- [ ] **Step 2: Run to verify failure:** `pnpm --dir frontend exec vitest run tests/unit/exportSerialize.test.ts tests/unit/exportActions.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement both files**; `exportActions` uses `readExportTable(api, 'spreadsheet')`.
- [ ] **Step 4: Run to verify pass:** same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): add CSV and Copy export with our own serializer`.
- [ ] **Step 6: Wire the menu in its own commit:** in `ActivityTable.svelte` pass `onDownloadCsv={() => downloadLibraryCsv(gridApi)}` and `onCopy` that awaits `copyLibraryTable(gridApi)` then `toast.success('Copied N rows')`, or `toast.error('Could not copy. Your browser blocked clipboard access.')` on rejection (`toast` from `svelte-sonner`). Add a component test per outcome. Commit `feat(frontend): wire CSV and Copy into the Export menu`.

---

### Task 9: CSV spike B, AG Grid's csv-export module (own branch)

**Branch:** `feature/content-export-print-csv-module`, cut from the base after Task 7.

**Files:**
- Modify: `frontend/package.json` and the lockfile (`pnpm --dir frontend add @ag-grid-community/csv-export@32.3.9 --save-exact`), `ActivityTable.svelte` (`const modules = [ClientSideRowModelModule, CsvExportModule]`)
- Create: `frontend/src/lib/utils/exportActions.ts` (same exports as Task 8), `frontend/tests/unit/exportActions.test.ts`

**Interfaces:**
- Produces: exactly Task 8's `downloadLibraryCsv` and `copyLibraryTable` signatures, so the menu wiring is unchanged.

- [ ] **Step 1: Write the failing tests** against a stub api: `downloadLibraryCsv` calls `api.exportDataAsCsv` with `fileName` from the date (`perspectize-library-2026-11-14.csv`), `columnKeys` equal to the shown column ids plus the Link column's key, and a `processCellCallback` that returns `exportCellText` then `neutralizeFormula`; `copyLibraryTable` calls `api.getDataAsCsv` with `columnSeparator: '\t'` and writes the result to the clipboard. Note in the commit message which behaviours could not be tested in jsdom.
- [ ] **Step 2: Run to verify failure:** `pnpm --dir frontend exec vitest run tests/unit/exportActions.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `exportActions.ts`** on the module. **The Link column is the open question:** try a hidden grid column first; if that needs a column outside `COLUMNS`, or the module cannot add it, record that and fall back to adding the Link in `getDataAsCsv`'s output. Either way, tabs and line breaks inside cells must become spaces for Copy, and the byte-order mark must be present in the download.
- [ ] **Step 4: Run to verify pass:** same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): add CSV and Copy export with AG Grid's csv-export module`.
- [ ] **Step 6: Bring over the wiring:** `git cherry-pick` Task 8's wiring commit (found with `git log feature/content-export-print-csv-own`). Resolve conflicts only in `ActivityTable.svelte`'s `modules` line. Run `pnpm --dir frontend exec vitest run tests/components/ExportMenu.test.ts tests/components/ActivityTable.test.ts`. Expected: PASS.

---

### Task 10: Compare the spikes and decide

**Files:**
- Modify: `docs/superpowers/specs/2026-11-14-library-export-print-design.md` (a "Decision" section) on the winning branch.

- [ ] **Step 1: Measure the build size.** On the base, then each spike branch: `pnpm --dir frontend run build`, then gzip each file in `frontend/.svelte-kit/output/client/_app/immutable/chunks/` that contains the AG Grid code (`gzip -c <file> | wc -c`). Record the delta per branch.
- [ ] **Step 2: Fill the comparison** from the design doc's four criteria: (1) did the Link column work without a hidden column outside `COLUMNS`; (2) what could be unit-tested in jsdom, and what needed a browser; (3) the size delta; (4) any other wrinkle (lines written, surprises).
- [ ] **Step 3: Ask the owner** to confirm the pick, then keep the winner as `feature/content-export-print` and, after they say so, delete the losing branch and any worktree made for it.

---

### Task 11: Final checks on the kept branch

- [ ] **Step 1:** `pnpm --dir frontend run check`. Expected: no new errors.
- [ ] **Step 2:** `pnpm --dir frontend run test:run`. Expected: all pass (the known-flaky AddVideoDialog test may time out under the full suite; rerun it alone before reporting).
- [ ] **Step 3:** Stale references: grep the repo for `csv-export` and `exportActions` mentions left from the losing spike. Query budget: no change, since export reads loaded rows (state this in the PR).
- [ ] **Step 4:** Record a short demo clip of the Export menu, CSV opening in a spreadsheet, and the print preview (`sv-` prefix, `needs-demo-video`). This is a local session: push, but open the PR only when asked.
