# Visual bug sweep — Activity page (localhost:5173)

Date: 2026-09-10
Branch: `bugfix/visual-sweep` (worktree `.claude/worktrees/1`)
Method: Chrome DevTools MCP, click/hover/keyboard-driven exploration of the Activity table (headers, sort, filters, popovers, pagination, responsive breakpoints) and the Discover page.

**Unit test philosophy applied below** (per project owner): a UI element with only one possible state doesn't need a test — you can just look at it. An element that *has* state, or *triggers* state changes, needs each distinct state exercised by a test, so a regression in a specific state can't silently slip through unnoticed.

**False alarms ruled out during this sweep** (noted so they aren't re-investigated): a `fullPage:true` screenshot of the virtualized grid produces a stitching artifact that looks like overlapping column text — not reproducible with a plain viewport screenshot, so it isn't a real bug. Lazy-loaded thumbnails appearing blank in an early screenshot were just late image loads. A 404 on one video's `hqdefault.jpg` (private YouTube video) is a known, already-tracked case — excluded here per the user.

---

## 1. [P1] "Loaded N Items" count doesn't update when a column filter narrows the client-side view

**Where:** `frontend/src/lib/components/ActivityTable.svelte:931` (`<DataModeToggle {mode} loadedCount={rowData.length} .../>`) and the `onFilterChanged` handler at `ActivityTable.svelte:690-694`.

**Repro:** Activity page, in default "Loaded N Items" (client-side) mode → open the "Channel" column filter → type "Peterson".

**Actual:** the grid correctly narrows to the 2 matching rows, but the footer still reads **"93 total"** and the toggle button still reads **"Loaded 93 Items"** — both stuck at the unfiltered count:
![actual](sv-05-stale-total-count-clientside-actual.png)

**Expected (for comparison — the same filter in "All Items"/server mode updates the count correctly to "2 total"):** confirmed working correctly in that mode during this sweep; only client-side "Loaded" mode has the stale-count problem.

**Root cause:** `onFilterChanged` explicitly no-ops for `mode === 'loaded'` (`ActivityTable.svelte:694`, "AG Grid handles client-side filter — skip URL update") — reasonable for not touching the URL, but as a side effect nothing ever recomputes a filtered row count. The `DataModeToggle` button is passed `loadedCount={rowData.length}` (`ActivityTable.svelte:931`), which is the full unfiltered array length, not AG Grid's actual displayed/filtered row count. Given the button's own accessibility description is "Sort, filter, and search within the currently loaded page only," showing "Loaded 93 Items" while 2 rows are visible actively misinforms the user about how many items their filter matched.

**Suggested fix:** track the grid's live displayed row count and use it for both labels while a client-side filter is active, e.g.:
```ts
let displayedRowCount = $state(rowData.length);

onFilterChanged: (event: FilterChangedEvent) => {
  activeFilterModel = event.api.getFilterModel();
  displayedRowCount = event.api.getDisplayedRowCount(); // NEW

  if (mode === 'loaded') return;
  // ...
},
```
```svelte
<DataModeToggle {mode} loadedCount={displayedRowCount} onToggle={handleModeToggle} />
```
(and decide whether the separate `{totalCount} total` label should keep showing the whole-library total, or also reflect the active filter — worth clarifying intent with design, since the two labels currently mean different things but sit right next to each other.)

**Worth a unit test?** Yes — this is squarely a stateful-UI case per the project's testing philosophy: "no filter" vs "filter narrows results" are two distinct states of the same counter, and a regression here silently shows a wrong number rather than crashing anything. `grid-config.ts` already exists for extracting pure, testable AG Grid logic (per `frontend/CLAUDE.md`) — a good place for a `getDisplayedCountLabel()`-style helper that can be unit tested directly, backed by a Vitest Browser Mode/Playwright test that types into a column filter and asserts the "Loaded N Items" label matches the actual visible row count.

---

## 2. [P2] Sorting a short-named column truncates its own header label ("Length" → "Le…")

**Where:** `frontend/src/lib/components/ActivityTable.svelte` header, any sortable+filterable column with a short name (repro'd on "Length").

**Repro:** Activity page → click the "Length" column header to sort ascending.

**Actual:**
![actual](sv-04-sorted-header-truncation-actual.png)

**Expected** (unsorted state, for comparison — full label renders fine):
See `sv-02-date-column-truncation-expected-1600w.png` header row, or simply the pre-sort screenshot — "Length" renders in full before any sort is applied.

**Root cause:** `headerMinWidth()` in `frontend/src/lib/utils/formatting.ts` estimates a column's minimum width from the header text length plus fixed em-budgets for the sort icon (`sortIconEm = 1.2`) and filter icon (`filterIconEm = 1.5`). Measured live in the browser, once a sort is actually active the rendered label area (`.ag-header-cell-label`) is only **64px** wide inside a **112px** header cell — too small for "Length" at the grid's font size, so AG Grid ellipsizes it to "Le…". The estimate doesn't leave enough real margin once the sort indicator is actually painted (vs. just reserved for).

**Suggested fix:** pad the formula's assumed icon width (e.g. bump `sortIconEm` or add a small fixed safety buffer in px), or give short-named sortable/filterable columns (`Length`, `Date`, `Views`, `Likes`, `Type`) an explicit `minWidth` override the way `Item`/`channel`/`description` already do at `ActivityTable.svelte:396,587,598,609`, instead of relying purely on the em-based estimate:
```ts
// formatting.ts — headerMinWidth()
// widen the reserved icon budget so it matches what's actually painted
// once a sort indicator is shown, not just what's reserved for it
const sortIconEm = 1.6; // was 1.2
```

**Worth a unit test?** Yes. This is a genuinely stateful UI element — the header has at least 3 distinct states (unsorted / ascending / descending) with different icon layouts, and a regression here silently truncates a label without anything else breaking. AG Grid doesn't render in jsdom (per this repo's existing gotcha), so this belongs in Vitest Browser Mode or Playwright: assert `header.scrollWidth <= header.clientWidth` (no overflow) for each short-named column in each sort state.

---

## 3. [P2] "Date" column truncates full dates at common desktop widths

**Where:** `frontend/src/lib/components/ActivityTable.svelte:495-507` (`publishDate` colDef).

**Repro:** Activity page at 1280px viewport width (a standard desktop breakpoint per this repo's own `.docs/VERIFICATION.md` screenshot convention).

**Actual (1280px — dates truncate, e.g. "Sep 9, 2…"):**
![actual](sv-02-date-column-truncation-actual-1280w.png)

**Expected (1600px — same data, full dates render, e.g. "Sep 9, 2023"):**
![expected](sv-02-date-column-truncation-expected-1600w.png)

**Root cause:** the `publishDate` colDef relies on `minWidth: col.minWidth ?? headerMinWidth(col.headerName ?? '', ...)` (`ActivityTable.svelte:618`), and `headerMinWidth('Date', true)` sizes the column only from the 4-character header label "Date" — not from the actual formatted cell content ("Sep 9, 2023", ~11 characters). Once other columns compete for flex space at moderate widths, the Date column shrinks to a width that fits its header but not its own data, and every date gets an ellipsis.

**Suggested fix:** give `publishDate` (and any other column whose displayed *value* is reliably longer than its header) an explicit `minWidth`, the same way `Item`/`channel`/`description` already override the generic estimate:
```ts
{
  colId: 'publishDate',
  field: 'publishedAt',
  headerName: 'Date',
  flex: 1,
  maxWidth: 150,
  minWidth: 130, // fits "Sep 9, 2023"-style formatted dates, not just the header label
  ...
}
```

**Worth a unit test?** Borderline — this is less a toggleable UI state and more a single layout parameter (a fixed date format at a range of viewport widths). Still, viewport width is effectively the "state" this column must handle, and it's already visibly wrong at a width this project explicitly tests at (1280px, per `VERIFICATION.md`). A lightweight assertion is worth adding if/when `headerMinWidth` is touched again: verify computed `minWidth` for date-like columns against a sample formatted value, not just the header text length. Not worth a dedicated new test file on its own.

---

## 4. [P4] Category-search popover has no visual anchor and fully covers the row beneath it

**Where:** `frontend/src/lib/components/ActivityTable.svelte` (`categoryPopoverPosition` / category cell click handler, ~line 644-659).

**Repro:** Activity page → click any cell in the "Category" column.

**Observed:** the Wikidata search popover opens flush against the bottom-left of the clicked cell with no arrow/caret and no backdrop dimming, so it renders as an opaque box directly on top of the *next* row's Item thumbnail/title/category — that row is fully hidden while the popover is open, with nothing visually tying the popover back to the cell that opened it.

**Suggested fix:** either add a small pointer/caret to the popover pointing at its origin cell (many popover libs support this, including the shadcn `Popover` primitive already used elsewhere in this codebase — worth switching to instead of the manual `{x, y}` rect math), or bias the popover's vertical offset so it doesn't fully occlude the next row when there's a row directly below.

**Worth a unit test?** No — this is a single visual state (a fixed-position popup relative to one click), nothing here is toggled or has distinct behavioral variants to regress against. A quick look is enough to catch a future regression.

---

## 5. [P1] The Column picker lets you hide the "Item" column, leaving rows with no way to identify which video they are

**Where:** `frontend/src/lib/components/ColumnPickerDialog.svelte` (no protected/required columns) and the `item` colDef in `ActivityTable.svelte:392-406`.

**Repro:** Activity page → Columns → uncheck "Item" → Done.

**Actual:** every row loses its only identifying content (thumbnail + title). What's left is a bare `+`/perspective icon, a Type icon, Category, Length, Likes, %Liked, Date, Channel and Tags — for a busy channel like "Bite-sized Philosophy" or "Jordan Peterson Rules for Life" with many same-length videos, there is now no way to tell which row is which video without re-enabling the column:
![actual](sv-08-item-column-removable.png)

**Why this matters:** every other hideable column is supplementary (Views, Likes, Tags, Description, …) — losing any one of them still leaves the video identifiable. "Item" is the only column carrying the title, so it's structurally different from the rest of the list and shouldn't be offered as an equal, freely-togglable checkbox.

**Suggested fix:** exclude "Item" from the column picker's checkbox list entirely (simplest), or mark it `disabled`/always-checked with a short note ("required") the way some grid column-chooser UIs pin an identity column. `ColumnPickerDialog.svelte`'s list is driven by the same column-metadata array the checkboxes map over — filtering `colId !== 'item'` out of that list (or before it) resolves this without touching AG Grid column defs.

**Worth a unit test?** Yes — this is a stateful list-of-toggles component (each column has a checked/unchecked state), and "Item must never reach the unchecked state" is exactly the kind of invariant that silently regresses if someone later refactors the picker to loop over all columns generically. A unit test on the column-picker's configuration (e.g. `getPickerColumns()` in `grid-config.ts` never includes `item`, or the rendered checkbox for Item is `disabled`) is cheap and durable.

---

## 6. [P3] Hiding several columns leaves a large unfilled void on the right instead of stretching remaining columns

**Where:** `ActivityTable.svelte` column `flex` configuration / grid width recalculation.

**Repro:** Activity page → Columns → uncheck "Views" and "Item" (or any couple of wide columns) → Done.

**Actual:** measured live, the grid container (`.ag-root`) is 1212px wide but the header's content only fills 907px — a ~305px (25%) blank strip on the right where no column renders, instead of the remaining columns' `flex` values growing to fill the container:
![actual](sv-08-item-column-removable.png)

**Suggested fix:** this is likely the same "Re-evaluate flex column widths when the grid container resizes" `$effect` mentioned in `ActivityTable.svelte` (~line 864) not also re-running when the *set of visible columns* changes (only on container resize) — trigger the same flex recalculation from `handleColumnToggle`/`setColumnsVisible` calls, not just `ResizeObserver`.

**Worth a unit test?** No strong case — this is a layout-fill behavior with one real state worth checking (columns hidden vs. not), best caught visually. If `grid-config.ts` grows a pure helper for flex recalculation, a quick assertion that total flex-basis fills container width would be cheap to add, but not worth a dedicated new test file on its own.

---

## 7. [P2] "Tags" column header tooltip shows "No tags" instead of a column description

**Where:** `frontend/src/lib/components/TagsTooltip.ts` and the `tags` colDef in `ActivityTable.svelte:521-533`.

**Repro:** Activity page → hover the "Tags" column header.

**Actual:** every other header shows a static description on hover (e.g. "Channel name from YouTube API", "Wikidata category") — Tags instead shows **"No tags"**:
![actual](sv-07-tags-header-tooltip-wrong.png)

**Root cause:** the colDef correctly sets `headerTooltip: 'Tags from YouTube API'` (`ActivityTable.svelte:532`), same as every other column — but it also sets `tooltipComponent: TagsTooltip` (a component meant for *cell* tooltips, rendering a tag-chip list). AG Grid applies a column's `tooltipComponent` to its header tooltip too, unless told otherwise. `TagsTooltip.init()` reads `params.data?.tags ?? []` (`TagsTooltip.ts:10`); on a header hover there's no row `data`, so it falls into the empty-tags branch and renders the literal string `'No tags'` — silently overriding the intended `headerTooltip` text.

**Suggested fix:** guard `TagsTooltip` against the header case, e.g. render the static header text when `params.data` is undefined:
```ts
init(params: ITooltipParams) {
  this.el = document.createElement('div');
  this.el.className = 'tags-tooltip';

  if (!params.data) {
    this.el.textContent = 'Tags from YouTube API'; // header hover — no row context
    return;
  }
  const tags: string[] = params.data?.tags ?? [];
  ...
```
(or check whatever `ITooltipParams` field distinguishes header vs. cell in the AG Grid version this repo pins, and use that instead of inferring from missing `data`).

**Worth a unit test?** Yes — `TagsTooltip` is a small, pure-ish class with two real states (row-context tooltip vs. header-context tooltip) that render completely different content; a unit test instantiating it with `data: undefined` vs. `data: {tags: [...]}` and asserting the rendered text is cheap and would have caught this directly, no AG Grid/browser harness needed.

---

## 8. [P3] The leftmost "perspective" and "Item" header tooltips render differently from the other 8 columns and overlap row content

**Where:** `ActivityTable.svelte`, `perspectize` and `item` colDefs (`headerComponent: PerspectiveHeaderRenderer` for the former).

**Repro:** Activity page → hover the leftmost icon-only header, then hover "Item".

**Observed:** both tooltips render directly over the row(s) immediately below the header — e.g. hovering "Item" shows "Video title and thumbnail from YouTube API" positioned so it visually covers the first data row's own title text:
![actual](sv-06-item-header-tooltip-overlap.png)

The other 8 columns' tooltips (Type, Length, Views, Likes, %Liked, Date, Channel, Category) render as a compact chip that sits clear of row content. This pair is more likely to occlude real data because Item/perspective sit at the far left where the first row starts almost immediately below the header.

**Note:** on a first-ever hover after page load, the Item tooltip additionally appeared in a distinctly lighter/wider style before settling into the normal dark chip on subsequent hovers — possibly a one-time style/paint-order quirk. Only the overlap-with-content issue reproduced consistently; treat the style-flash note as a low-confidence secondary observation, not a separate confirmed bug.

**Worth a unit test?** No — single visual/positioning state, quickest to verify by eye.

---

## 9. [P2] Truncated "Category" cells show no tooltip revealing the full value, unlike every other truncated column

**Where:** the `category` colDef, `ActivityTable.svelte:424-432`.

**Repro:** Activity page → hover a truncated Category cell (e.g. "bodybuil…").

**Actual:** no tooltip appears at all, even after waiting past the grid's `tooltipShowDelay: 1000`:
![actual](sv-09-category-cell-no-tooltip.png)

**Expected (for comparison — the adjacent truncated Channel cell in the same row correctly reveals its full value on hover):**
![expected](sv-09-channel-cell-tooltip-expected.png)

Channel, Tags, and Item all show a tooltip with the full untruncated value when hovered. Category is the odd one out — a category like "nutritional science" or "bodybuilding" that gets cut to "nutrition…"/"bodybuil…" in the 150px-wide column has no way to be read in full without opening the category-edit popover.

**Root cause:** `defaultColDef` provides a grid-wide fallback (`ActivityTable.svelte:628-634`): `tooltipValueGetter: (params) => params.valueFormatted ?? params.value ?? ''`. That works for Channel (`field: 'channelTitle'`, so `params.value` is a real string) and for columns with an explicit `tooltipField`/`tooltipComponent` (Tags, Item). But the `category` colDef has no `field` at all — it renders entirely through `cellRenderer: categoryCellRenderer` reading `data.primaryCategory` directly — so `params.value` and `params.valueFormatted` are both `undefined` for this column, and the inherited tooltipValueGetter returns `''`, i.e. no tooltip.

**Suggested fix:** give the `category` colDef an explicit `tooltipValueGetter` that reads the same field the cell renderer uses:
```ts
{
  colId: 'category',
  headerName: 'Category',
  headerTooltip: 'Wikidata category',
  width: 150,
  sortable: false,
  filter: false,
  cellRenderer: categoryCellRenderer,
  tooltipValueGetter: (params) => params.data?.primaryCategory?.label ?? '', // NEW
  hide: true,
}
```
(adjust the field path to whatever `categoryCellRenderer` actually reads).

**Worth a unit test?** Borderline-yes — this is a small, deterministic gap (tooltip present vs. absent) rather than a multi-state UI, but it's exactly the kind of thing a pure `tooltipValueGetter` function is trivial to unit test in isolation (call it with a sample row, assert non-empty string) without needing AG Grid or a browser at all. Cheap enough to add alongside the fix.

---

## 10. [P3, needs confirmation] Grid scroll position isn't reset when switching "Loaded" ↔ "All Items" data mode

**Where:** `frontend/src/lib/components/ActivityTable.svelte`, the `$effect` that reacts to `mode`/page changes.

**Repro:** Activity page → scroll the table down → click "All Items" (or "Loaded N Items") to switch data mode.

**Observed:** at a small residual `.ag-body-viewport` scrollTop (confirmed misrendering at 36px), the newly-loaded first row renders half-hidden underneath the sticky header row instead of scrolling back to the top.

**Caveat:** my repro scrolled the grid via a large programmatic jump (`viewport.scrollTop = 2200`) rather than genuine mouse-wheel/trackpad scrolling before toggling mode — I did not confirm a real user's scroll-then-toggle produces the same residual offset. **Recommend a human spot-check** (scroll the table a few rows down with the mouse wheel, then click "All Items"/"Loaded N Items") before prioritizing a fix.

**Suggested fix, if confirmed:** in the effect that swaps row data on `mode`/page change, explicitly reset scroll after the swap:
```ts
// after applying new rowData / mode
gridApi.ensureIndexVisible(0, 'top');
```

**Worth a unit test?** Yes, if confirmed — "Loaded" vs "All Items" are two distinct, real states of this component, and a scroll-reset regression is exactly the kind of thing that could silently break again later. Covered via Vitest Browser Mode/Playwright (per this repo's existing AG Grid testing conventions): scroll down, toggle mode, assert the first row's top edge is fully below the header's bottom edge.

---

## Summary

| # | Priority | Issue | Test recommended? |
|---|----------|-------|--------------------|
| 1 | P1 | "Loaded N Items"/total count stale after client-side filter | Yes — stateful (filtered vs unfiltered) |
| 2 | P2 | Sorted column header truncates ("Length" → "Le…") | Yes — stateful (sort states) |
| 3 | P2 | Date column truncates at 1280px | Optional/lightweight — mostly static layout |
| 4 | P4 | Category popover has no anchor, covers row below | No — single visual state |
| 5 | P1 | "Item" column can be hidden, rows become unidentifiable | Yes — stateful (picker checkbox invariant) |
| 6 | P3 | Hiding columns leaves unfilled blank space on the right | No strong case — visual layout-fill check |
| 7 | P2 | "Tags" header tooltip shows "No tags" instead of description | Yes — cheap, pure two-state unit test |
| 8 | P3 | Item/perspective header tooltips overlap row content, style differs from other columns | No — single visual state |
| 9 | P2 | Truncated Category cells show no tooltip (Channel/Tags/Item do) | Borderline — cheap pure-function test |
| 10 | P3 (unconfirmed) | Scroll position not reset on data-mode switch | Yes, if confirmed — stateful (mode toggle) |

**Verified clean, no action needed:** every column-header tooltip except Tags (#7) shows correct, consistent static text; all numeric filter operators (`=`, `≠`, `>`, `≥`, `<`, `≤`, Between) render their correct symbol in the filter chip and filter correctly; the "All Items" (server) mode's total count updates correctly when filtered (only "Loaded" mode has issue #1).

Per plan: this `visual-sweep/` folder (screenshots + this report) should be deleted as the last commit once the above are fixed.
