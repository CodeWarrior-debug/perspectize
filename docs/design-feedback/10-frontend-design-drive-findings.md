# Frontend-design drive findings (Perspectize, http://localhost:5173/)

## 1. Verdict

**C-** (agree with the owner, for slightly different reasons). The chrome is competent: navy header, Geist sans, a serif (item-title) accent in the grid, a clean mobile card layout. But the product has no point of view beyond "navy admin table", and two things actively break trust: (a) the grid ignores the theme system, so the shipped Midnight theme produces white rows with near-invisible light text, and Archive shows a cool-white grid on warm paper; (b) row hover is nearly indistinguishable from the zebra stripe. The theme feature promises identity (Reading Room, Archive, Garden, Midnight, Terminal) but the main surface delivers only one. The fix for B+ is mostly making the existing system true, not adding decoration.

## 2. Part A results

Default theme = `perspectize-theme` was absent from localStorage (null). Restored by removing the key and reloading; final read is null. (I also cleared the derived `perspectize-theme-applied` cache; the app regenerates it.)

| # | Observed | Issue |
|---|----------|-------|
| A1 | 1440x900 light: navy header, "Activity" H1, All Content/By User toggle, search, dense 10-col grid, footer bar. Rows 0-1 are YouTube; the rest are "Bible Passage" rows that are almost entirely empty ("—", "--", "+"). | Visual weight is 10 columns of mostly empty dashes. Duplicate empty markers ("—" vs "--") inconsistent. Search-field-options and column-picker icons sit right of search with no labels. |
| A2 | Hovered row-index 2 (even, base rgb(255,255,255)). Hover is a `::before` overlay rgba(26,54,93,0.06). Composite = about rgb(241,243,245). Screenshot: a barely-grey band. | Hover on white rows lands almost exactly on zebra colour. |
| A3 | Hovered row-index 3 (odd, base rgb(247,250,252)). Same overlay. Composite about rgb(234,238,243). | Visible here, so hover feedback is inconsistent by parity. |
| A4 | Method: composited overlay onto base, compared sRGB Euclidean distance. Even-row hover (241,243,245) vs zebra (247,250,252): distance about 11 (per-channel deltas 6/7/7), so hover on a white row looks like a zebra row. Odd-row hover vs its rest: about 22, weak but visible. Cause: `oddRowBackgroundColor: '#f7fafc'` and `rowHoverColor: 'rgba(26,54,93,0.06)'` hardcoded in `ActivityTable.svelte` lines 450-451. | Confirms the owner's complaint numerically. |
| A5 | Midnight: header, page and toolbar go dark, but grid rows stay rgb(255,255,255)/(247,250,252) with cell text rgb(23,23,23). The Item column text (titles) renders pale grey on white, and Bible-passage thumbnails become dark tiles: titles like "Psalms 139:1-10" are near-invisible. Hover unchanged. | Grid does NOT follow the theme. Severe legibility failure. |
| A6 | Archive (light, sepia): header/button/toggle go bronze, page is warm cream, but grid header stays navy and rows stay cool white; hover stays blue-grey. | Grid does not follow theme; clashing cool/warm palettes. |
| A7 | Tab focus on nav link shows a clear white ring on navy header (visible). Programmatic focus on grid cells/header cells reported `outline: none` (may be ag-grid's own :focus-visible styling; not proven with a real keyboard path into the grid). Dark check: focus ring on header is fine; grid focus not verified. | Grid keyboard focus indicator unverified/likely weak. Discover search field has a strong ring (good). |
| A8 | 390x844: grid collapses to bordered cards (thumbnail, title, channel, length, glasses/plus action). Clean and readable. | Card list sits inside an outer bordered container (card-in-card). Bible rows use a large grey placeholder tile. Otherwise good. |
| A9 | Settings dialog: five preset cards with swatch dots plus Customize; readable. Columns dialog: checkboxes, "Done", small ALL-CAPS "COLUMNS" label above a list already titled Columns. Both dismissed. | Redundant caps eyebrow; footnote text is small (about 11px). Dialogs are white regardless of theme? (Midnight dialog not inspected.) |
| A10 | Console: no errors from app code. Warning: AG Grid "no value for --ag-list-item-height" (styles loaded after grid init), Clerk dev-keys warning, a11y issue "form field needs id or name", and `Failed to load resource: 404` x2 (resource not identified). Network: all GraphQL POSTs 200; Clerk calls 200. | Minor: 404s and grid-init style ordering. |

## 3. Findings (ranked by Clear, Calming, Beautiful, Interesting)

1. **Grid ignores active theme; Midnight is broken [seen live]** (Clear). `ActivityTable.svelte` ~L450 hardcodes `oddRowBackgroundColor: '#f7fafc'`, hover and (per render) row/text colours. Evidence: Midnight shows white rows, rgb(23,23,23) cell text, pale titles unreadable. Fix: build the ag-grid theme params from the theme tokens (`--background`, `--card`, `--muted`, `--border`, `--foreground`), re-derive on theme change.
2. **Hover ~ zebra [seen live]** (Clear). Measured above. Fix: drop zebra (use hairline row dividers, already present) or make the stripe lighter (about 2% tint) and hover a distinct accent tint (navy at 10-12%) plus a 3px left accent bar on the hovered row so it reads on both parities. Take colours from `--accent`/`--primary`, not literals.
3. **Empty-cell noise on Bible Passage rows [seen live]** (Clear, Calming). Six of ten columns show "—"/"--" for passages. Fix: render one muted, consistent empty glyph (or nothing), and de-emphasise the "+" add controls until row hover; consider hiding N/A columns for non-video types.
4. **Inconsistent page gutters [seen live]** (Calming). Activity content starts at x=32 (full-bleed), Discover/Compare at x=112 and header logo at x=112. Fix: one container width and gutter for header and pages, or deliberately full-bleed only for the table with the H1 aligned to the header logo.
5. **Cool grid on warm themes [seen live]** (Beautiful). Follows from #1; Archive/Garden look mismatched. Same fix.
6. **Header nav contrast/active state [seen live]** (Beautiful). Inactive nav labels are light-grey on navy; active pill is low-contrast tint. Fine but timid; give active state a clear underline or filled pill from the primary token.
7. **Stray "--" tooltip [seen live]** (Calming). Hovering an empty cell shows a dark tooltip containing only "--". Fix: suppress tooltips for empty values.
8. **Compare empty state [seen live]** (Clear). Only a centred sentence at the top of a white page ("No content selected. Open Compare from a piece of content's details."). Fix: an actual empty state with one action (link to Activity) and left-align to the page gutter.
9. **All-caps "COLUMNS" eyebrow in the columns dialog and redundant header [seen live]** (Clear). Remove the eyebrow; use sentence case, move the session-only note into the description.
10. **Discover cards [seen live]** (Beautiful). Large, competent, but the description is raw YouTube boilerplate (links, hashtags) shown as body copy; it steals attention. Fix: truncate to one line or strip URLs; make the thumbnail smaller.
11. **Grid keyboard focus not confirmed [read from source only / partly live]** (Clear). Verify a real `:focus-visible` ring on header and cells in every theme.
12. **Console hygiene [seen live]** (minor): AG Grid style-order warning, two 404s, form-field a11y issue.
13. **Identity [seen live]** (Interesting). Interesting comes last: the app has a distinctive idea (perspectives, Bible passages next to video) but no visual moment. One memorable element: the item title in the serif face already hints at a reading-room voice; extend it to the H1 and the Discover titles rather than adding decoration.

## 4. Part B discoveries

- Theme picker works and persists; Midnight and Archive expose the hardcoded grid colours instantly, which source-reading did not make obvious.
- Discover: strong focus ring on search, auto-focus on load, "Showing Trending Content" helper text is fine; layout is roomy compared with the dense Activity page (two different densities in one app).
- Compare route with no selection is nearly empty.
- Mobile Activity is the best screen in the app.
- Initial route load shows an unstyled white "Loading..." page (Discover), which flashes white even before theme paint.

## 5. Path to B+ or better

1. Feed theme tokens into the ag-grid theme (fixes Midnight and warm themes; biggest single grade jump).
2. Redefine hover vs stripe: no zebra (or 2% stripe) and a clear hover tint with left accent bar.
3. Quiet the empty cells and hover-reveal the "+" actions; unify the empty glyph and suppress the "--" tooltip.
4. Unify gutters/container across Activity, Discover, Compare.
5. Real Compare empty state; remove caps eyebrow in dialogs; tidy console warnings.
6. Verify keyboard focus ring in the grid in all themes.

Would not touch: the mobile card layout, the header structure, the serif item titles, the theme preset list, the Discover search field and focus ring, the blue/navy primary.

## 6. Self-report

- Rules applied: design for the subject (a reading and annotation product) rather than generic admin chrome; visual structure must carry information (zebra plus hover currently encode nothing distinct); avoid all-caps eyebrows and redundant labels; spend boldness in one place (typography), keep the rest quiet; copy should name things plainly (empty states with a next action); quality floor (focus, responsive, contrast).
- Live driving revealed: the Midnight legibility failure, measured hover-vs-zebra composite values (overlay is a `::before` layer so `background` alone is misleading), the stray "--" tooltip, the gutter mismatch between screens, and the console/404s. Source alone showed only the hardcoded literals.
- Could not do: fully verify real keyboard focus inside the grid (only nav-link focus observed by real Tab; grid focus probed programmatically); did not inspect the Midnight dialog colours, Terminal/Garden themes, Messages panel, user menu, or dark-theme hover on real pixels beyond one screenshot; the two 404 resources were not identified.
- Screenshots taken: 12 (jpeg for later ones).
