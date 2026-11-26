# Library View-State Module Implementation Plan

> **For agentic workers:** Executed inline by the implementing agent (native), test-first. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Library's URL-backed view state (data mode, sorts, filters, person filter, page, page size) and its cursor/page rules out of `ContentLibrary.svelte` into one module with an injected URL adapter, so mode, sort, filter, paging and card-list parity are tested through its interface with no AG Grid.

**Architecture:** A `.svelte.ts` module `libraryViewState.svelte.ts` built by `createLibraryViewState({ url, resetCursors })`. It reads the URL through `url.search()` on each access (plain getters, so the SvelteKit adapter's reactivity carries through), writes through `url.navigate(href, replace)`, and calls `resetCursors()` for every reorder. It holds two pieces of in-memory state: the Loaded-mode sort list (`loadedSorts`) and the grid's live filter model pending its debounced URL commit (`liveGridFilter`). Grid lifecycle, AG Grid events and `$effect`s stay in the component, which becomes a renderer that forwards events to the module.

**Tech Stack:** Svelte 5 runes (`.svelte.ts`), Vitest (jsdom unit project), TanStack Query (unchanged, in `useLibraryList`), AG Grid (unchanged).

**Spec:** This plan (the task brief in the session) plus `docs/glossary/browsing/GLOSSARY.md` (Data mode, Type filter, Card mode, Column view).

## Global Constraints

- No behaviour change, except the three items listed under "Decisions" below, each called out in the PR.
- Module imports limited to `#lib/utils/gridUrlState.js`, `#lib/utils/grid-config.js`, and type-only imports. No `$app/*`, no `svelte-clerk`, no `#lib/queries/*` runtime imports (keeps the module pure and cycle-free for #862).
- No `$effect` in the module.
- Files stay under 500 lines.
- Conventional Commits; comments describe the code as it stands.
- One shell command per Bash call; absolute paths; `git -C <worktree>`.

## Review Focus

1. Person filter typed or chosen while the grid filter debounce is pending: the commit must keep it (reads URL at fire time).
2. Stale client-only sort in the URL in All mode: must not be pushed back to the grid or rewrite the URL.
3. Next/previous page: must never reset the cursor stack (regression would stall paging).
4. Card-mode unmount during a pending filter debounce: the pending change must still commit.
5. Switching mode with a pending grid filter change: the Loaded-to-All switch must carry the grid's filters into the URL.

Each line is pinned by a test in Task 2 (listed there).

---

## Read/Write Inventory (ContentLibrary, before the refactor)

**Reads of view state**

| Read | Where | Moves to |
|---|---|---|
| `parseGridParams(page.url.search)` → `gridParams` | component line ~252 | `view.params` |
| `mode`, `sorts`, `pageNum`, `pageSize`, `searchText`, `filters` | ~255-260 | view getters |
| `columnView` (from `filters.type`) | ~262 | stays a pure call in component (`columnViewFor(view.filters.type)`) |
| `personFilter` | ~264 | `view.personFilter` |
| `hasActiveSort` (Loaded: `clientSorts`; All: URL sorts) | ~385 | `view.hasActiveSort` |
| `activeSorts` (Loaded: `clientSorts`; All: URL sorts) | ~393 | `view.activeSorts` (All: URL minus client-only) |
| `personChipLabel` (from `rowData`) | ~365 | stays in component, passed to `view.chips(label)` |
| `chipFilterModel` (grid `activeFilterModel` if grid, else URL, + person) | ~373 | `view.chips(label)` |
| `hasActiveFilters` | ~377 | `view.hasActiveFilters` |
| `sortedRowData` (card list, Loaded: filter + sort by hand) | ~400 | `view.cardRows(rowData)` |
| `totalCount` / `Math.ceil(totalCount / pageSize)` | template | `view.pageCount(total)` |
| `displayedRowCount`, `loadedItemsCount` | ~290 | stays (grid display, not view state) |
| `list.rows / totalCount / loading / isError / refetch` | ~334-363 | stays (`useLibraryList`) |

**Writes (all via `updateUrl`, `replace: true`)**

| # | Trigger | Current effect | Module method |
|---|---|---|---|
| W1 | `filterByPerson` (Cast cell) | reset cursors; filters + person; page 1 | `filterByPerson(id)` |
| W2 | `handleClearSorts`, All | reset; sorts `[]`; page 1 | `clearSorts()` |
| W3 | `handleClearSorts`, Loaded | `clientSorts = []`; grid clears sort (component) | `clearSorts()` + component grid call |
| W4 | `handleSortsApply`, All | reset; sorts; page 1 | `setSorts(s)` |
| W5 | `handleSortsApply`, Loaded | `clientSorts = s`; grid applies (component) | `setSorts(s)` + component grid call |
| W6 | `handleModeToggle` | reset; Loaded clears `clientSorts`; mode; page 1; Loaded→All carries grid filters into URL | `setMode(m)` |
| W7 | `handleNextPage` / `handlePrevPage` | page ±1, **no reset** | `nextPage(total)` / `prevPage()` |
| W8 | `handlePageSizeChange` | reset; pageSize; page 1 | `setPageSize(n)` |
| W9 | `onSortChanged`, Loaded | `clientSorts` mirror; no URL | `sortsFromGrid(s)` |
| W10 | `onSortChanged`, All | skip if `skipNextSortEvent`; else reset; sorts; page 1 | `sortsFromGrid(s)` (equality check replaces the flag) |
| W11 | `onFilterChanged` | immediate chip model; 500 ms debounce → filters from grid + person; no-op if equal; Loaded: URL only; All: reset + page 1 | `gridFilterChanged(model)` |
| W12 | chips `onRemove(key)` | reset; delete key; page 1 | `removeFilter(key)` |
| W13 | chips `onClearAll` | reset; filters `{}`; page 1 | `clearFilters()` |
| W14 | chips `onClearAllButType` | reset; filters `type` only; page 1 | `clearFiltersKeepType()` |
| W15 | `?open=<id>` effect | strips param, `replace` | stays in component (deep-link concern, not view state) |

**Grid-side effects that read URL state (stay in component):** All-mode sort sync (`applyColumnState` from `view.serverSorts`), sort-header sortability, item header, filter restore (`setFilterModel(urlParamsToFilter(view.filters))`), person external filter re-run, column visibility, export.

## Decisions (user review at PR)

- **D1, skip flag replaced by equality.** `sortsFromGrid` no-ops when the grid's sorts equal `serverSorts` (URL sorts minus `CLIENT_ONLY_SORT_COLS`). Same effect as the flag, and it removes the latent case where the flag stays set when `applyColumnState` emits no `sortChanged`, which would swallow the next real header click. Logged as a bug in the gitignored backlog.
- **D2, debounce cleanup.** `dispose()` cancels a pending filter commit on destroy. Today a pending commit can fire after teardown. Behaviour change (fix).
- **D3, client-only sorts dropped from the sort dialog in All mode.** `activeSorts` in All mode omits `CLIENT_ONLY_SORT_COLS`, so a stale URL client sort no longer shows in the dialog.
- **Kept exception:** a Loaded-mode filter commit does not reset page or cursors (as today).

---

## Interfaces

```ts
// libraryViewState.svelte.ts
export interface LibraryUrl {
  search(): string;                       // URL query string, no leading '?'
  pathname(): string;
  navigate(href: string, replace: boolean): void;
}
export interface LibraryViewDeps {
  url: LibraryUrl;
  resetCursors(): void;                   // list.resetCursors in prod
}
export interface LibraryViewState {
  readonly params: GridParams;            // parseGridParams(url.search()), for useLibraryList
  readonly mode: DataMode;
  readonly sorts: SortSpec[];             // URL sorts
  readonly serverSorts: SortSpec[];       // URL sorts minus CLIENT_ONLY_SORT_COLS
  readonly activeSorts: SortSpec[];       // Loaded: loadedSorts; All: serverSorts
  readonly hasActiveSort: boolean;
  readonly pageNum: number;
  readonly pageSize: number;
  readonly filters: Record<string, string>;
  readonly personFilter: PersonFilter | null;
  readonly hasActiveFilters: boolean;
  filterModel(): Record<string, unknown>; // liveGridFilter ?? urlParamsToFilter(filters)
  chips(personLabel: string): Record<string, unknown>;
  cardRows(rows: ContentItem[]): ContentItem[];
  pageCount(totalCount: number): number;
  setMode(mode: DataMode): void;
  setSorts(sorts: SortSpec[]): void;
  sortsFromGrid(sorts: SortSpec[]): void;
  clearSorts(): void;
  gridFilterChanged(model: Record<string, unknown>): void;
  removeFilter(key: string): void;
  clearFilters(): void;
  clearFiltersKeepType(): void;
  filterByPerson(personId: string): void;
  setPageSize(size: number): void;
  nextPage(totalCount: number): void;
  prevPage(): void;
  dispose(): void;
}
export function createLibraryViewState(deps: LibraryViewDeps): LibraryViewState;
```

Shared helpers inside the module (not exported): `commitHref(params, changes)` (serialize `{...params, ...changes}` against `url.pathname()`), `sameSorts(a, b)` (local, because `sortsEqual` in gridUrlState is private), `personMatches(row, person)` via the existing `rowMatchesPerson`.

`cardRows` in Loaded mode: `filterContentRows(rows, filterModel())`, then `rowMatchesPerson` when a person filter exists, then `compareContentBySorts` with `loadedSorts` (same source as the grid's filter and sort). In All mode it returns `rows` unchanged (the server filtered and sorted).

`DEBOUNCE_MS = 500`.

---

## Task 1: Lock the plan and the test seam

**Files:**
- Create: `docs/superpowers/plans/2026-11-25-library-view-state.md` (this file)

- [ ] **Step 1: Commit the plan first**

```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/1 add docs/superpowers/plans/2026-11-25-library-view-state.md
```

```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/1 commit -m "docs(library): plan the Library view-state module"
```

Expected: one commit on `chore/library-view-state`.

---

## Task 2: View-state module, test-first

**Files:**
- Create: `frontend/src/lib/components/library/libraryViewState.svelte.ts`
- Create: `frontend/tests/unit/library-view-state.test.ts`

**Interfaces:**
- Consumes: `parseGridParams`, `serializeGridParams`, `filterToUrlParams`, `filtersEqual`, `nonGridFilters`, `urlParamsToFilter`, `GridParams`, `SortSpec`, `DataMode` from `#lib/utils/gridUrlState.js`; `CLIENT_ONLY_SORT_COLS`, `PERSON_FILTER_KEY`, `parsePersonFilter`, `PersonFilter`, `rowMatchesPerson`, `filterContentRows`, `compareContentBySorts` from `#lib/utils/grid-config.js`; `ContentItem` type.
- Produces: `createLibraryViewState`, `LibraryViewState`, `LibraryUrl`, `LibraryViewDeps` (signatures above).

Fake adapter in the test: a closure over `let search` with `navigate` that records `{href, replace}` and updates `search`. Plain getters mean no `$state` is needed in the fake.

- [ ] **Step 1: Write the failing tests** (one `describe` per spec bullet, names as below)

```ts
// tests/unit/library-view-state.test.ts (skeleton; each `it` has the assertion described)
function fakeUrl(initial: string) { /* search(), pathname() => '/content-library', navigate() records calls, sets search */ }
function setup(initial = '') { const url = fakeUrl(initial); const resetCursors = vi.fn(); const view = createLibraryViewState({ url, resetCursors }); return { url, resetCursors, view }; }

// Mode
it('setMode(all) resets cursors once, writes mode=all and page 1', ...)      // T1
it('setMode(loaded) clears the Loaded sort list', ...)                        // T2

// Sort
it('setSorts in All writes sort to the URL, resets cursors, page 1', ...)     // T3: libraryListRequest(view.params, null).variables.sorts equals new sort
it('setSorts in Loaded does not navigate; activeSorts shows the new list', ...) // T4
it('sortsFromGrid in All with the server sorts does nothing (no navigate, no reset)', ...)  // T5 (replaces skip flag)
it('a stale client-only URL sort is dropped from serverSorts and activeSorts and not rewritten by sortsFromGrid(serverSorts)', ...) // T6, Review Focus 2

// Filters
it('gridFilterChanged updates chips at once but writes no URL until 500 ms', ...)  // T7, fake timers
it('the debounced commit keeps a person filter set inside the window', ...)        // T8, Review Focus 1
it('a Loaded-mode filter commit writes the URL without a page or cursor reset', ...) // T9, kept exception
it('dispose cancels a pending commit', ...)                                        // T10, D2
it('removeFilter / clearFilters / clearFiltersKeepType write the URL and reset', ...) // T13
it('filterByPerson writes f.person, resets cursors, page 1', ...)                 // T14
it('setMode(all) with a pending grid filter carries that filter into the URL', ...)  // Review Focus 5

// Paging
it('nextPage and prevPage move the page and never reset cursors', ...)            // T11, Review Focus 3
it('nextPage does nothing on the last page', ...)
it('setPageSize resets cursors and page 1', ...)                                  // T12

// Card list parity
it('cardRows in Loaded applies the column filter, the person filter and the Loaded sort', ...)  // T15
it('cardRows in All returns rows untouched', ...)                                 // T15b
it('chips(label) shows the person chip with the given label', ...)                // T17

// URL round trip
it('after each write, parseGridParams of the navigated href equals view.params', ...)  // T16
```

Expected: the file fails on import (module not found).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --dir /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/1/frontend exec vitest run tests/unit/library-view-state.test.ts`
Expected: FAIL, cannot resolve `libraryViewState.svelte`.

- [ ] **Step 3: Implement the module** in `libraryViewState.svelte.ts` to the Interfaces block. Key rules to get right:
  - `params` and all getters parse `url.search()` at read time.
  - `loadedSorts` and `liveGridFilter` are `$state`.
  - `setMode(all)`: if `liveGridFilter` is set, filters = `{...filterToUrlParams(live), ...nonGridFilters(params.filters)}`; then `resetCursors()`, `loadedSorts` cleared only when going to loaded; navigate with `{mode, page: 1[, filters]}`. Clear `liveGridFilter`.
  - `gridFilterChanged(model)`: `liveGridFilter = model`; `clearTimeout`; `setTimeout(commit, 500)` with `commit` capturing `model` but reading `params` at fire time: `urlFilters = {...filterToUrlParams(model), ...nonGridFilters(params.filters)}`; `liveGridFilter = null`; if `filtersEqual` return; if loaded, navigate without reset; else reset + page 1.
  - `sortsFromGrid(s)`: loaded → `loadedSorts = s`; all → if `sameSorts(s, serverSorts)` return; else `resetCursors()`, navigate `{sorts: s, page: 1}`.
  - `setSorts(s)`: loaded → `loadedSorts = s`; all → reset + navigate `{sorts: s, page: 1}`. Empty list writes `sort=none` (as today).
  - `clearSorts()`: `setSorts([])`, and in loaded also empties `loadedSorts` (same thing).
  - `cardRows(rows)`: described in Interfaces.
  - `dispose()`: `clearTimeout`.
  - `nextPage(total)`: if `pageNum < pageCount(total)` navigate page+1, no reset. `prevPage()`: if `pageNum > 1` navigate page-1, no reset.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --dir /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/1/frontend exec vitest run tests/unit/library-view-state.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/1 add frontend/src/lib/components/library/libraryViewState.svelte.ts frontend/tests/unit/library-view-state.test.ts
```

```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/1 commit -m "feat(library): add the Library view-state module"
```

---

## Task 3: Route ContentLibrary through the module

**Files:**
- Modify: `frontend/src/lib/components/library/ContentLibrary.svelte`
- Modify: `frontend/tests/components/ContentLibrary.test.ts` (delete the two `expect(true)` placeholders; the two source-text tests stay, see Step 3)

**Interfaces:**
- Consumes: `createLibraryViewState`, `LibraryViewState` from Task 2.
- Produces: none.

- [ ] **Step 1: Add the failing component-level check first**

Keep the existing rendering tests as the regression net; they already cover the request params for Loaded search, Type filter, `?open=`, and cursor-free mode. Run them before editing to confirm green:

Run: `pnpm --dir /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/1/frontend exec vitest run tests/components/ContentLibrary.test.ts tests/unit/webpageClickTargets.test.ts tests/components/LibraryPage.test.ts`
Expected: 36 passed (baseline).

- [ ] **Step 2: Replace the state code in the component**
  - Construct the view first, then the list:
    ```ts
    const view = createLibraryViewState({
      url: {
        search: () => page.url.search,
        pathname: () => page.url.pathname,
        navigate: (href, replace) => { goto(href, { replace, reset: false }); },
      },
      resetCursors: () => list.resetCursors(),
    });
    const list = useLibraryList(() => view.params);
    ```
  - Delete `gridParams`, `mode`, `sorts`, `pageNum`, `pageSize`, `searchText`, `filters`, `personFilter`, `clientSorts`, `activeFilterModel`, `hasActiveSort`, `activeSorts`, `chipFilterModel` (keep the chip label derivation), `sortedRowData` (use `view.cardRows`), `updateUrl`, all `handle*` URL writers (W1-W14) and `skipNextSortEvent`. Each handler becomes a one-line call to the module plus, where a grid exists, the grid call (W3, W5).
  - Remove `debounceTimer` and `skipNextSortEvent` (the module owns the debounce and the equality check). Add `view.dispose()` to the existing `onDestroy`.
  - Grid sort sync effect reads `view.serverSorts`. Filter restore effect reads `view.filters`.
  - `onFilterChanged`: `view.gridFilterChanged(event.api.getFilterModel())` plus `displayedRowCount` and `hover.close()`.
  - Chips: `onRemove` → `view.removeFilter(colId)`; `onClearAll` → `view.clearFilters()`; `onClearAllButType` → `view.clearFiltersKeepType()`.
  - Pagination markup: `view.pageCount(totalCount)`; `view.nextPage(totalCount)`, `view.prevPage()`.
  - `onCellClicked` Cast → `view.filterByPerson(personId)`.
  - Card list: `rowData={view.cardRows(rowData)}`.
  - Card-mode unmount path: no view change needed (pending commit is owned by the module, so it still fires).

- [ ] **Step 3: Replace source-text and placeholder tests**
  - Delete the two `expect(true)` tests in `ContentLibrary.test.ts` (`imports TanStack Query dependencies correctly`, `component code uses required TanStack Query patterns`). Their coverage is the module tests and the existing rendering tests.
  - The source-text test `passes the export and print handlers to the Export menu` reads the template. It is about export wiring, which stays in the component, so keep it and say so in the PR.
  - `tests/unit/webpageClickTargets.test.ts` reads the click handler source. The ◎ and Category handlers stay in the component, so keep it too.

- [ ] **Step 4: Run to verify green**

Run: `pnpm --dir /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/1/frontend exec vitest run tests/components/ContentLibrary.test.ts tests/unit/webpageClickTargets.test.ts tests/components/LibraryPage.test.ts tests/unit/library-view-state.test.ts`
Expected: all pass.

- [ ] **Step 5: Check the size and the import rules**

Run: `wc -l /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/1/frontend/src/lib/components/library/ContentLibrary.svelte`
Expected: well under 1,115 (record the number for the PR).

- [ ] **Step 6: Commit**

```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/1 add frontend/src/lib/components/library/ContentLibrary.svelte frontend/tests/components/ContentLibrary.test.ts
```

```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/1 commit -m "refactor(library): drive ContentLibrary's view state through the view-state module"
```

---

## Task 4: Verification, PR, slot release

- [ ] **Step 1:** `pnpm --dir <worktree>/frontend run check` (expect 0 errors; baseline 0).
- [ ] **Step 2:** `pnpm --dir <worktree>/frontend run test:run` (report counts).
- [ ] **Step 3:** `pnpm --dir <worktree>/frontend run test:browser --browser.headless=true` (grid integration; report counts).
- [ ] **Step 4:** Log bug D1's latent flag case in the gitignored `.planning/phases/bugs/BACKLOG.md` (create the file if absent) with severity and location.
- [ ] **Step 5:** Push the branch; open the PR with `gh api` against `main` using the template under `.github/`; Demo line: "No behaviour change; no video." Include Session Learnings.
- [ ] **Step 6:** `bash .claude/scripts/release-slot.sh 1` from `/Users/jamesjordan/GitHub/perspectize` after checking its usage.
