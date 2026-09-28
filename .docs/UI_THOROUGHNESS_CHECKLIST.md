# UI Thoroughness Checklist

A cake with a missing layer looks fine from the top. Every UI-facing change here passes through the same stack of layers and surfaces. This checklist makes each PR cover every layer, or say in writing why it doesn't.

It was built from the gaps in [UI_GAP_AUDIT.md](UI_GAP_AUDIT.md). The `(#N)` tags point to the real gap each item would have caught.

**How to use it**
- **Author:** before opening the PR, copy the short PR block (§4) into the description and tick each item, or mark it `n/a — reason`.
- **Reviewer:** check the ticks against the diff. An unticked item with no `n/a` reason blocks the review.
- **Planning** (superpowers plans/specs): list the affected layers in the spec, so the plan's tasks cover them from the start (§5).

---

## 1. The layer stack

A column, field, filter, sort, setting or content type touches some of these layers. Find the ones your change touches, then check every **surface** in §2 that shows that data.

### A. Backend contract
- [ ] **Schema:** a field on the type, plus `ContentSortBy` / `ContentFilter` / `ContentSearchField` entries if it should be sortable, filterable or searchable. (#7: `PERCENT_LIKED` missing)
- [ ] **Clearable:** an optional field in an `Update*Input` can be *cleared*, not just left out. Use gqlgen `omittable` or a `clearX` flag, and have the service handle it. (#2)
- [ ] Domain, GORM model, mapper, sort/filter rules in `helpers.go`, resolver/dataloader.
- [ ] Migration **written only**. The PR says it needs a manual `migrate up` in each environment.
- [ ] Pagination: every list field a new consumer relies on has an explicit `first`, and the consumer knows the default (10) and the max (100). (#4)

### B. Frontend data layer
- [ ] The field is selected in **every** query document whose screens should show it: `LIST_CONTENT`, `GET_CONTENT`, `LIST_ACTIVITY_PERSPECTIVES`, `PERSPECTIVE_FIELDS`, creation mutations, and so on. (#8)
- [ ] The TS response type is updated to match.
- [ ] **Query keys:** a new list query gets its own key branch. Optimistic `setQueriesData` targets only lists **with the same row shape and the same privacy scope**; others are invalidated, not patched. (#3)
- [ ] Optimistic updates treat "cleared" as `null`, not `?? previous`. (#2)

### C. Grid (ActivityTable)
Until the column-metadata refactor in §3 lands, a new column has to be added to **every** one of these by hand:
- [ ] Column definition in `ActivityTable.svelte`: `colId`, `headerName`, `hide`, `sortable`, `filter`.
- [ ] Renderer or formatter in `formatting.ts`, **using theme tokens only** (see F).
- [ ] Tooltip/copy spec in `activityTooltipSpecs.ts` (#390 popover), or a note that the column doesn't need one.
- [ ] The responsive tier lists in the `ActivityTable` effect (`smCols` / `mdCols` / …).
- [ ] **Column picker:** `DATA_COLUMNS`, or `INTERNAL_COLUMNS` if admin-only. (#1)
- [ ] **Sort:** `SORTABLE_COLUMNS`, `SORT_VALUE_GETTERS` (mobile/Loaded sort) and `COL_TO_SORT` / `SORT_TO_COL` (server sort). If there is no server sort, the column must not be sortable in All mode. (#7)
- [ ] **Filter:** `COL_TO_FILTER_KEY`, `urlParamsToFilter`, `urlParamsToGraphQLFilter`, `FilterChips` `COLUMN_LABELS` and its value formatter. (#10, #17)
- [ ] **Search scope,** if searchable: `SearchScopeKey`, `SCOPE_TO_GQL_FIELD`, `+page.svelte` `SCOPE_LABELS`.
- [ ] **One label** everywhere: header, picker, sort picker, chip, modal and card all show the same string. (#13)
- [ ] The column works in **both** data modes (Loaded = client-side, All = server-side) for sort, filter and search.

### D. Other surfaces (§2 lists them all)
- [ ] Every surface that shows this entity either shows the new data, or the PR says why it doesn't.

### E. State and navigation
- [ ] New view state (tabs, views, modes) is saved in the URL like the existing grid state, or the PR explains why it's session-only. (#9)
- [ ] A new route has a way in (nav link or a clear entry point) and a **useful empty state**, not a dead end. (#14)
- [ ] A new user preference or mutation has a UI that sets it *and* can undo it. (#15)
- [ ] Interactions on the same element don't overlap: hover popover versus click action, focus traps, z-index. (#16)

### F. Visual system
- [ ] **No hex/rgb values in components, renderers or third-party theme params.** Use `var(--color-*)` or `color-mix()` with tokens. (#6)
- [ ] Checked with **every theme preset**, including at least one dark one (Midnight or Terminal). (#6)
- [ ] Empty, loading and error states exist for every surface and **both** data modes.
- [ ] Missing values look the same everywhere: pick "—" or "hide the segment" and use it consistently. (#10)

### G. Tests and docs
- [ ] **Parity test:** a new list entry is covered by a test that compares it with its source of truth (see §3). Tests that only check a list's own shape don't count. (#1)
- [ ] Unit tests for the new `grid-config` / `gridUrlState` / `FilterChips` entries.
- [ ] A component or browser test for any mobile/card-mode behaviour. (#5)
- [ ] `ADDING_AG_GRID_COLUMN.md` / `ADDING_CONTENT_TYPE.md` updated if the change adds a new list or step. (#21)
- [ ] Dead code left over from the change is removed: old components, unused imports, superseded lists. (#18, #20)

---

## 2. Surface matrix

For each entity your PR touches, fill in the row. Each cell is ✅ (shown), ➖ (not shown on purpose, with a reason in the PR) or ❌ (gap, which blocks the PR).

| Entity | Grid (desktop) | Card list (<860px) | Details modal | By-User feed | Compare | Perspective editor | Filter chips | Sort picker | Column picker |
|---|---|---|---|---|---|---|---|---|---|
| Content field | | | | | ➖ | ➖ | | | |
| Perspective field | ➖ | ➖ | | | | | ➖ | ➖ | ➖ |
| Content type | | | | | | ➖ | | ➖ | ➖ |

And for every surface:

| Surface | Desktop | Mobile | Loaded mode | All mode | Light theme | Dark theme | Empty | Error |
|---|---|---|---|---|---|---|---|---|
| (each changed surface) | | | | | | | | |

The mobile column matters most: #5 and #10 were both desktop-only changes that nobody checked at <860px.

---

## 3. Structural fixes so the checklist gets shorter

Every hand-kept list is a layer that can go missing. These changes remove whole groups of checklist items:

1. **One column-metadata array** (e.g. `lib/grid/columns.ts`):
   ```ts
   export const COLUMNS = [
     { colId: 'category', label: 'Category', togglable: 'all', tier: 'sm', cardVisible: true,
       sort: null, filterKey: 'category', tooltip: true },
     { colId: 'percentLiked', label: '% Liked', togglable: 'all', tier: 'lg', cardVisible: false,
       sort: { server: null, getter: (r) => (r.viewCount ? r.likeCount / r.viewCount : null) } },
     …
   ] as const satisfies readonly ColumnMeta[];
   ```
   Build `DATA_COLUMNS`, `INTERNAL_COLUMNS`, `SORTABLE_COLUMNS`, `SORT_VALUE_GETTERS`, `COL_TO_SORT`, `COL_TO_FILTER_KEY`, `COLUMN_LABELS`, the tier lists and the header names from it. Section C then shrinks to "add one entry and one column definition".
2. **Parity tests** as a backstop, until the refactor lands or for lists it can't absorb:
   - column definitions ⇄ picker lists (see audit #1 for a ready-made `?raw` test),
   - `SORTABLE_COLUMNS` ⇄ `SORT_VALUE_GETTERS` ⇄ `COL_TO_SORT` (all or nothing, or explicitly marked client-only),
   - `ContentSortBy` enum ⇄ `COL_TO_SORT` values (read `backend/schema.graphql` as text),
   - `STANDARD_DIMENSIONS` ⇄ `AddFieldSearch` ⇄ `DEFAULT_FIELDS` (#19).
3. **A pre-commit hook blocking hex colours** in `frontend/src/lib/components/**` and `formatting.ts` — implemented in `.hooks/pre-commit` (activated via `make install-hooks`), not CI: it diffs staged changes to files in scope and blocks the commit if an *added* line matches `#[0-9a-fA-F]{3,8}\b|rgba?\(`. Only new lines are checked, so it doesn't retroactively block the handful of pre-existing raw colours already in the codebase. An intentional exception (e.g. a brand colour like YouTube red) is allowlisted inline with a same-line `hex-ok: <reason>` comment. Self-test: `sh .hooks/test-pre-commit-hex-check.sh`.
4. **Query-key shape rule:** each differently shaped list gets its own key branch, so a prefix filter can never cover two row shapes.

---

## 4. Short block for PR descriptions

Paste this under **Test Plan** in `.github/PULL_REQUEST_TEMPLATE/feature.md` and `bugfix.md` (for UI changes):

```markdown
### UI thoroughness ([checklist](.docs/UI_THOROUGHNESS_CHECKLIST.md))
<!-- Tick, or write "n/a — reason". Unticked without a reason = not ready for review. -->
- [ ] **Contract:** schema/sort/filter/search enums; optional fields can be cleared; pagination `first` explicit
- [ ] **Data:** field selected in every query that feeds a surface showing it; query keys/optimistic patches scoped to one shape
- [ ] **Grid:** column def, renderer, tooltip spec, tier, column picker, sort (3 lists), filter (4 places), search scope, one label
- [ ] **Surfaces:** grid · mobile cards · details modal · By-User feed · Compare · editor — each ✅ or ➖ with reason
- [ ] **Modes:** Loaded + All · desktop + <860px · light + dark preset · empty/loading/error
- [ ] **State/nav:** URL-saved view state; new route has an entry point + useful empty state; new prefs are reversible
- [ ] **Tokens:** no hex/rgb in components, renderers or AG Grid params
- [ ] **Tests/docs:** parity test for any new list entry; ADDING_* guides updated; dead code removed
```

---

## 5. Where else to use it

| Step | How |
|---|---|
| **Spec / plan** (`superpowers:writing-plans`) | Add a required "Layers & surfaces" section listing §1 A–G and the §2 matrix rows the feature touches. Each ❌ becomes a plan task. |
| **PR template** | Add the §4 block to `feature.md` and `bugfix.md`. |
| **Claude review** (`/code-review`, `code-reviewer` agent, Claude Code Review) | Add a `REVIEW.md` rule (or a `frontend/CLAUDE.md` section) saying "For UI changes, verify each §1 layer against the diff; any list entry added in one registry but not its siblings is a blocking finding." |
| **Self-verification** (`.docs/VERIFICATION.md`) | Add to the local browser pass: resize to 375px, switch to Midnight, and toggle Loaded/All on every changed surface. |
| **CI** | Parity tests (§3.2). |
| **Pre-commit hook** | The hex-colour check (§3.3) — `.hooks/pre-commit`, activated per checkout via `make install-hooks`. |
| **Monthly maintenance** | Re-run this audit, feeding the new PRs since the last audit to the lead reviewer, and add the results to `UI_GAP_AUDIT.md`. |
