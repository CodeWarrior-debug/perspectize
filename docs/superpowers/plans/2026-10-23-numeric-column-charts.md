# Numeric Column Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users open a per-column chart popover on numeric movie columns in the Activity grid, showing one of ten chart types computed from the loaded rows.

**Architecture:** Pure statistics and binning functions in one utils module, a per-column chart registry, a small localStorage module for the per-column on/off flag, one SVG chart component that switches on chart type, and a popover that hosts the type picker. `ActivityTable.svelte` supplies the loaded rows (post-filter, post-sort, with grid value getters applied) and shows the header icon only for eligible columns in loaded mode.

**Tech Stack:** Svelte 5 (runes), TypeScript, AG Grid Community 32.3.9 (`ag-grid-svelte5`), Vitest + @testing-library/svelte, hand-built SVG. No new dependency.

**Spec:** [docs/superpowers/specs/2026-10-23-numeric-column-charts-design.md](../specs/2026-10-23-numeric-column-charts-design.md)

## Global Constraints

- Chart and std-dev data come only from loaded rows (`mode === 'loaded'`, currently the first 100). No charts in `mode === 'all'`.
- Charts run only for movie-type content (`isMovieOnlyTypeFilter`, `frontend/src/lib/utils/grid-config.ts` line 439).
- Chart on/off defaults to off for every column. Chart type is never persisted.
- Only `null` or `undefined` values count as empty. Zero is a value.
- Sample standard deviation uses n−1. It is shown only in the summary type.
- Std dev and all chart statistics are computed over the same row set the chart shows.
- Svelte 5 runes only. No `$effect` for derivation.
- No raw hex colours in `src/lib/components/**` (pre-commit guard). Use theme tokens.

## Review Focus

- **All values empty** (e.g. a column no movie in the list has): every chart shows "no values yet"; no NaN or divide-by-zero. Test: `columnStats.test.ts` empty-input cases, and `ColumnChart.test.ts` empty state.
- **Exactly one value, or all values identical:** histogram, box plot, and density must not produce zero-width bins or NaN. Summary shows the value; other charts show the short note. Test: `columnStats.test.ts` single-value and identical-value cases.
- **Filter yields zero rows:** popover says "no values yet", the header icon stays. Test: `ColumnChartPopover.test.ts` with an empty `values` prop.
- **Negative or very large values** (boxOffice in the billions): bins and axis labels stay finite, and labels use the grid's `formatCount`/currency formatter, not raw digits. Test: `columnStats.test.ts` large-value binning; `ColumnChart.test.ts` label formatting.
- **Top and bottom 10 with missing titles or fewer than 20 rows:** lists never repeat a row, and a missing title shows "Untitled". Test: `columnStats.test.ts` top-bottom overlap case.

---

### Task 1: Statistics and binning module

**Files:**
- Create: `frontend/src/lib/utils/columnStats.ts`
- Test: `frontend/tests/unit/columnStats.test.ts`

**Interfaces:**
- Produces:
  - `type Summary = { count: number; min: number; median: number; mean: number; max: number; stdDev: number }` (`stdDev` is sample, n−1; 0 when count < 2)
  - `summarize(values: number[]): Summary | null` (`null` for empty)
  - `type Bin = { lo: number; hi: number; count: number }`
  - `histogram(values: number[], binCount: number): Bin[]` (equal-width; a single distinct value yields one bin)
  - `frequencyPoints(bins: Bin[]): { x: number; y: number }[]` (bin midpoints)
  - `cumulative(values: number[]): { x: number; share: number }[]` (sorted ascending, share in 0–1)
  - `boxStats(values: number[]): { min: number; q1: number; median: number; q3: number; max: number; outliers: number[] } | null` (Tukey 1.5×IQR whiskers)
  - `density(values: number[], points: number): { x: number; y: number }[]` (Gaussian kernel, Silverman bandwidth; returns `[]` when fewer than 2 distinct values)
  - `pieSlices(bins: Bin[], cap: number): { label: string; count: number }[]` (first `cap` bins, then one "other" slice if more remain)
  - `coverage(total: number, withValue: number): { filled: number; empty: number }`
  - `topBottom<T>(rows: T[], value: (row: T) => number | null | undefined, title: (row: T) => string | null | undefined, n: number): { top: { title: string; value: number }[]; bottom: { title: string; value: number }[] }`. Rows with empty values are excluded. Lists are capped to `Math.min(n, floor(count/2))` each, so they never overlap. Missing titles become "Untitled". Ties sort by title.
- Consumes: nothing.

- [ ] **Step 1: Write failing tests**

Write one `describe` per exported function in `columnStats.test.ts`. Assert these exact values:

```ts
expect(summarize([2, 4, 4, 4, 5, 5, 7, 9])).toEqual({
  count: 8, min: 2, median: 4.5, mean: 5, max: 9,
  stdDev: expect.closeTo(2.138, 3),
});
expect(summarize([])).toBeNull();
expect(summarize([7]).stdDev).toBe(0);
expect(histogram([1, 1, 1], 4)).toHaveLength(1);
expect(cumulative([3, 1, 2])).toEqual([
  { x: 1, share: 1 / 3 }, { x: 2, share: 2 / 3 }, { x: 3, share: 1 },
]);
expect(topBottom([{ t: 'a', v: 1 }], (r) => r.v, (r) => r.t, 10)).toEqual({
  top: [], bottom: [],
});
```

Also cover: empty input for every function returns its empty value; identical values for `density` returns `[]`; `topBottom` with 20 rows yields 10 top and 10 bottom with no shared title; `null` titles become "Untitled".

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir frontend exec vitest run tests/unit/columnStats.test.ts`
Expected: FAIL, module `$lib/utils/columnStats` not found.

- [ ] **Step 3: Implement `frontend/src/lib/utils/columnStats.ts`**

Implement each function per the Interfaces block. Use `Number.isFinite` to drop non-finite inputs. The median of an even count is the mean of the two middle values. Use the Silverman rule (`0.9 * min(sd, IQR/1.34) * n^-0.2`) for density bandwidth, with a floor so identical values return `[]`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir frontend exec vitest run tests/unit/columnStats.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/utils/columnStats.ts frontend/tests/unit/columnStats.test.ts
git commit -m "feat(charts): add column statistics and binning"
```

---

### Task 2: Chart registry and eligibility

**Files:**
- Create: `frontend/src/lib/utils/columnCharts.ts`
- Test: `frontend/tests/unit/columnCharts.test.ts`

**Interfaces:**
- Produces:
  - `const CHART_TYPES = ['histogram', 'line', 'pie', 'box', 'cumulative', 'summary', 'density', 'strip', 'topBottom', 'coverage'] as const`
  - `type ChartType = (typeof CHART_TYPES)[number]`
  - `const CHART_TYPE_LABELS: Record<ChartType, string>` (human labels, e.g. `'Histogram'`, `'Pie'`, `'Top and bottom 10'`)
  - `const CHART_ELIGIBLE_COLS: ReadonlySet<string>` = `views`, `likes`, `percentLiked`, `duration`, `boxOffice`, `vsBudget`, `tmdbScore`, `budget`, `votes` (use the `colId` values from `grid-config.ts`; confirm them while doing Task 6)
  - `const DEFAULT_CHART_TYPE: Record<string, ChartType>`: every eligible column maps to `'histogram'`. Developers change individual entries here.
  - `defaultChartType(colId: string): ChartType`
  - `isChartEligible(colId: string, typeFilter: string | undefined): boolean` (true only for eligible columns when `isMovieOnlyTypeFilter(typeFilter)` is true)
- Consumes: `isMovieOnlyTypeFilter` from `$lib/utils/grid-config`.

- [ ] **Step 1: Write failing tests**

Test that `CHART_TYPES` has exactly 10 entries, that `released` is not eligible, that every eligible column has a default, and that `isChartEligible('views', 'movie')` is true while `isChartEligible('views', 'youtube')` is false. Use the actual filter values `isMovieOnlyTypeFilter` accepts (read it first).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir frontend exec vitest run tests/unit/columnCharts.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `frontend/src/lib/utils/columnCharts.ts`** per the Interfaces block.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir frontend exec vitest run tests/unit/columnCharts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/utils/columnCharts.ts frontend/tests/unit/columnCharts.test.ts
git commit -m "feat(charts): add chart type registry and eligibility"
```

---

### Task 3: Persisted per-column chart flag

**Files:**
- Create: `frontend/src/lib/utils/columnChartSettings.ts`
- Test: `frontend/tests/unit/columnChartSettings.test.ts`

**Interfaces:**
- Produces:
  - `const CHART_SETTINGS_KEY = 'perspectize.columnCharts'`
  - `loadChartFlags(): Record<string, boolean>`: returns `{}` on missing, malformed, wrong-version, or unavailable storage. Never throws.
  - `setChartFlag(colId: string, on: boolean): void`: writes `{ version: 1, flags }`. Wraps the write in try/catch.
  - `isChartOn(colId: string): boolean` (default `false`).
- Consumes: nothing.

**Why a separate key:** the existing column-layout value at `COLUMN_LAYOUTS_KEY` (`frontend/src/lib/utils/columnLayouts.ts`) is a per-view visibility map that `loadLayout` validates. A second shape in that object would break its parser, so this flag gets its own key. This is a deliberate change from the design doc's "joins the existing column settings object", and the design doc should be updated to match.

- [ ] **Step 1: Write failing tests**

Cover: missing key returns `{}`; malformed JSON returns `{}`; `{version: 2, ...}` returns `{}`; a successful `setChartFlag('views', true)` then `isChartOn('views') === true`; `localStorage.setItem` throwing does not throw from `setChartFlag`. Do not touch `COLUMN_LAYOUTS_KEY`; assert it is unchanged after a write.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir frontend exec vitest run tests/unit/columnChartSettings.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `frontend/src/lib/utils/columnChartSettings.ts`** following the try/catch pattern in `columnLayouts.ts` (lines 41–57).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir frontend exec vitest run tests/unit/columnChartSettings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/utils/columnChartSettings.ts frontend/tests/unit/columnChartSettings.test.ts
git commit -m "feat(charts): persist per-column chart flag"
```

---

### Task 4: SVG chart component

**Files:**
- Create: `frontend/src/lib/components/charts/ColumnChart.svelte`
- Test: `frontend/tests/components/ColumnChart.test.ts`

**Interfaces:**
- Props: `{ type: ChartType; values: number[]; labels?: { title: string; value: number }[]; format: (n: number) => string }` (`labels` is used only by `topBottom`, which takes pre-computed `topBottom` output via a `top`/`bottom` shape. Pass the full `topBottom` result as `ranked?: { top; bottom }`; use `ranked` in place of `labels`.)
- Consumes: every function from `columnStats.ts`, `ChartType` from `columnCharts.ts`.
- Behaviour: one branch per `ChartType`. When `values` has no entries, render the text "no values yet" for every type. When there is one value or all values are identical, render the summary and a note in place of the other types.

- [ ] **Step 1: Write failing component tests**

One test per chart type: render with a fixed `values` array and assert the expected SVG element or text is present (for example, `histogram` renders `rect` count equal to the bin count, `pie` renders `path` count equal to `pieSlices` length, `summary` renders "Median" with the formatted value, `topBottom` renders titles from `ranked`). Add one test for the empty state and one for the identical-values note. Give each chart type its own test, since each is a distinct state.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir frontend exec vitest run tests/components/ColumnChart.test.ts`
Expected: FAIL, component not found.

- [ ] **Step 3: Implement `ColumnChart.svelte`**

Use one `{#if type === '…'}` block per chart type. Derive all data with `$derived` from `columnStats.ts`. Use `viewBox` with fixed dimensions, and CSS colour tokens (`var(--color-primary)`, `var(--color-muted-foreground)`) for fills and strokes. Give the SVG `role="img"` and an `aria-label` naming the chart type.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir frontend exec vitest run tests/components/ColumnChart.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/components/charts/ColumnChart.svelte frontend/tests/components/ColumnChart.test.ts
git commit -m "feat(charts): add SVG column chart component"
```

---

### Task 5: Popover with live type picker

**Files:**
- Create: `frontend/src/lib/components/charts/ColumnChartPopover.svelte`
- Test: `frontend/tests/components/ColumnChartPopover.test.ts`

**Interfaces:**
- Props: `{ colId: string; label: string; values: number[]; ranked?: { top; bottom }; format: (n: number) => string; open: boolean; onClose: () => void }`
- Consumes: `ColumnChart` (Task 4), `CHART_TYPES`, `CHART_TYPE_LABELS`, `defaultChartType` (Task 2).
- Behaviour: opens with `defaultChartType(colId)` selected. Choosing a type re-renders `ColumnChart` in place and does not persist the choice. Closing the popover resets the type to the default on the next open. Shows "based on N loaded movies" using `values.length`.

Build on the existing popover primitive used elsewhere in the app. Find it first (grep `bits-ui` or `Popover` under `frontend/src/lib/components/shadcn/popover`).

- [ ] **Step 1: Write failing tests**

Test: opens with the default type selected; selecting `pie` changes the rendered chart without writing to localStorage (assert `localStorage.setItem` not called with the chart key); re-opening after close shows the default again; the "based on N loaded movies" text matches `values.length`; `Escape` closes via `onClose`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir frontend exec vitest run tests/components/ColumnChartPopover.test.ts`
Expected: FAIL, component not found.

- [ ] **Step 3: Implement `ColumnChartPopover.svelte`**

Keep the chosen type in a local `$state` that is reset from `defaultChartType(colId)` when `open` turns true. Do not write it to `localStorage`. For the Escape key, follow the bits-ui capture-phase note in the frontend CLAUDE.md only if the popover is inside a dialog.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir frontend exec vitest run tests/components/ColumnChartPopover.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/components/charts/ColumnChartPopover.svelte frontend/tests/components/ColumnChartPopover.test.ts
git commit -m "feat(charts): add column chart popover with type picker"
```

---

### Task 6: Header icon and grid wiring

**Files:**
- Create: `frontend/src/lib/components/charts/ChartHeaderRenderer.ts` (follow the `PerspectiveHeaderRenderer` class pattern in `frontend/src/lib/utils/formatting.ts` line 542: class with `init()` and `getGui()`)
- Modify: `frontend/src/lib/components/ActivityTable.svelte` (`columnDefs` near line 629; the `$effect` near line 240 for visibility)
- Modify: `frontend/src/lib/components/ColumnPickerDialog.svelte` (add the per-column chart switch)
- Test: `frontend/tests/browser/column-charts.test.ts` (Vitest Browser Mode, with `vi.hoisted(() => vi.stubEnv('VITE_DEMO_MODE', 'true'))` at the top)

**Interfaces:**
- Consumes: `isChartEligible`, `isChartOn`, `setChartFlag`, `ColumnChartPopover`, the grid's `gridApi`.
- Produces in `ActivityTable.svelte`: a `chartRows(colId)` helper that returns `{ values: number[]; ranked }` from `gridApi.forEachNodeAfterFilterAndSort`, applying the colDef's `valueGetter` (if present) to each node's data, so the numbers match what the grid shows.

**Rules:**
- The header icon shows only when all of these hold: `mode === 'loaded'`, `!cardMode`, `isChartEligible(colId, typeFilter)`, the column is visible, and `isChartOn(colId)`.
- Turning the chart on or off is a switch in `ColumnPickerDialog`, next to each eligible column. It writes through `setChartFlag` and bumps `layoutVersion`, following the pattern of `handleColumnToggle` (line 240).
- Eligible numeric columns use `headerComponent: ChartHeaderRenderer` in their colDef, which renders the title plus the icon. Non-eligible columns are unchanged.
- The mobile card list (`cardMode`) never renders charts.
- Column minimum widths: the icon sits in the header, so check `headerMinWidth` (`formatting.ts`) still fits the 1212px grid. The frontend CLAUDE.md warns that extra header room can clip the last column.

- [ ] **Step 1: Write failing browser test**

With demo mode on, load the Activity page in loaded mode with a movie type filter. Assert: no chart icon on the views header by default; after the switch is turned on in the column picker, the icon appears; clicking it opens the popover with "based on N loaded movies"; the rendered row count equals the grid's visible row count. Use `expect.poll` for cell counts, as the frontend CLAUDE.md requires.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir frontend run test:browser --browser.headless=true column-charts`
Expected: FAIL, icon not found.

- [ ] **Step 3: Implement the renderer, the colDef changes, the picker switch, and the `chartRows` helper.**

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir frontend run test:browser --browser.headless=true column-charts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/components/charts/ChartHeaderRenderer.ts frontend/src/lib/components/ActivityTable.svelte frontend/src/lib/components/ColumnPickerDialog.svelte frontend/tests/browser/column-charts.test.ts
git commit -m "feat(charts): wire chart icon and popover into activity grid"
```

---

### Task 7: Full verification and visual check

**Files:** none changed unless a check fails.

- [ ] **Step 1: Type-check**

Run: `pnpm --dir frontend run check`
Expected: zero errors. Report the summary line.

- [ ] **Step 2: Unit and component tests**

Run: `pnpm --dir frontend run test:run`
Expected: all pass. Report the summary line.

- [ ] **Step 3: Build**

Run: `pnpm --dir frontend run build`
Expected: builds. Check the output has no PWA `warnings`.

- [ ] **Step 4: Visual evidence**

Run the dev server and capture a clip or screenshots of the popover for one column per chart type, using the video-capture tool in the user's global rules. Name them with the `sv-` prefix. Do not upload them anywhere without asking.

- [ ] **Step 5: Commit any fixes**

Commit only changes made in this task. Do not commit the screenshots.

---

## Notes for the executor

- Run `pnpm --dir frontend install` once in this worktree before Task 1. Dependencies are not copied into worktrees.
- The main checkout is claimed by another session. Do all work in this worktree.
- `graphify` is not available in this worktree. Use Grep and Read for code navigation.
