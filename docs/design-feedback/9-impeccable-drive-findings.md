# Impeccable drive findings (reviewer 9)

Note: the impeccable context loader reported no PRODUCT.md or DESIGN.md. I used the frontend source and the live app as evidence instead. The task said not to interview anyone. The skill's edit-time steps (craft-floor, detector) were not needed because this was review only.

## 1. Verdict

**Grade: C-.** I agree with the owner.

The bones are decent: a restrained navy/paper palette, a serif for the titles in the grid, and a mobile card layout that is genuinely calm. The desktop grid undermines all of that.

1. It is themed in a separate, hard-coded world (`ActivityTable.svelte` lines 447-462 use hex and rgba literals). The header is always navy and the body always white, whatever theme is chosen.
2. In Midnight, the Item titles render pale text on a white body and are nearly invisible.
3. The hover tint is about 6% navy alpha. On an even row it lands within roughly 7 RGB units of the zebra colour, which is exactly the owner's complaint.

The fixes are token plumbing plus one hover decision, not a redesign. B+ is reachable.

## 2. Part A results

| # | Observed | Issue |
|---|---|---|
| A1 | 1440x900, default theme (`localStorage` `perspectize-theme` was null, meaning the default). Navy header bar, white grid with a navy header row, 64px rows, a mix of thumbnail rows and Bible-passage rows. Passage rows are mostly "--" and "—" filler cells. The grid sits nearly full-bleed (32px margin). | Many empty cells make the table feel sparse and noisy. Header dividers "\|" sit next to filter icons and add clutter. |
| A2 | AG Grid row-index 1 (odd) background is rgb(247,250,252) at rest. Hover uses rowHoverColor rgba(26,54,93,.06). AG Grid paints hover as an overlay, so the row's computed background stays the same. The screenshot shows only a faint grey-blue wash on the hovered row. Computed hover colour: 247,250,252 blended gives about rgb(234,238,243). | Hover on odd rows is faintly visible: a distance of about 13 from the row's rest colour. |
| A3 | Even rows (index 0, 2, 4) rest at rgb(255,255,255). Hover blends to about rgb(241,243,245). | Hover on an even row is about 7 units from the zebra colour (247,250,252). That is the owner's complaint. |
| A4 | Method: manual alpha compositing, then max-channel and Euclidean RGB distance. Zebra vs white is (8,5,3), distance about 10. Hover on even vs white is (14,12,10), distance about 21. Hover on even vs zebra is (6,7,7), distance about 12. Hover on odd vs zebra is (13,12,9), distance about 19. Every one of these is below 3:1 luminance contrast (all about 1.05:1 to 1.15:1). | Hover is effectively the same as zebra on alternating rows. Hover must be clearly stronger than zebra, or zebra must be dropped and hover given a stronger hue. |
| A5 | Midnight: the header bar and page follow the theme. The grid does not: white body, navy header, light-white Item titles unreadable (about 1.2:1) on the white body. Row text in other cells is still dark. Row text colour is rgb(23,23,23). | Serious bug and the worst issue: the theme does not reach AG Grid. Titles are illegible, Bible-passage icons lose their tile, and hover on dark is meaningless. |
| A6 | Archive (light sepia): page and header turn sepia. The grid stays white, with a navy header. It is legible but looks like a foreign object on a sepia page. Mobile cards did follow the theme. | Grid ignores theme in light themes too. Desktop and mobile disagree with each other. |
| A7 | Tab lands first on the header "Activity" link with a visible double ring (dark outline plus white ring), visible in the sepia theme. I did not tab into the grid cells. Only the Archive theme was tested for focus (I did not re-check default or dark). | Header focus ring is good. Grid-cell focus was not verified. Not a finding. |
| A8 | 390x844: rows become stacked cards with thumbnail, title, channel and length, and an action icon. Toggle, search and columns control fit on one row. Cards follow the theme (sepia). No horizontal scroll. Calm. | Mobile is better than desktop. The card and grid worlds should feel more like siblings. |
| A9 | Columns dialog: a clean checkbox list (Type, Length, Views, Likes, % Liked, Published, Channel, Tags, Description) with a Done button. Item and Category are not listed even though Category is a column. Settings dialog: "Customize Theme" with 5 presets (Reading Room, Archive, Garden, Midnight, Terminal) and a Customize button. Both closed with Escape. | Category column has no toggle. The theme dialog is fine. |
| A10 | Console: a Clerk development-keys warning (expected in dev). An AG Grid warning "no value for --ag-list-item-height" (styles loaded after grid init). A 404 resource load, twice, on the first load. A form-field issue "should have an id or name attribute". Network: all GraphQL calls returned 200. No failed requests other than the 404 above. | AG Grid init-order warning suggests the theme and CSS load timing is fragile. |

## 3. Findings (ranked: Clear, Calming, Beautiful, Interesting)

1. **[seen live] Clear: row hover matches the zebra stripe.** Where: `frontend/src/lib/components/ActivityTable.svelte` lines 447-462 (`oddRowBackgroundColor: '#f7fafc'`, `rowHoverColor: 'rgba(26, 54, 93, 0.06)'`). Evidence: hover on an even row composites to about (241,243,245) against zebra (247,250,252), about 7 units apart and under 1.1:1 contrast. Fix: raise hover to roughly 12-16% accent alpha. Add a 3px left inset accent bar (`box-shadow: inset 3px 0 0 var(--color-primary)`) on the hovered row so the state does not depend on tint alone. Keep the zebra at 2-3% or drop it, since row borders already separate rows.

2. **[seen live] Clear: the grid ignores the theme.** In Midnight the Item titles are pale text on a white body, nearly invisible; other cells stay dark. Header is always #1a365d. Evidence: `.ag-root-wrapper` background rgb(255,255,255) in Midnight, screenshot with unreadable titles. Fix: derive the AG params from the CSS variables (`var(--color-background)`, `--color-foreground`, `--color-primary`, and so on). Use `themeQuartz.withParams` with `var()` values or set `--ag-*` variables on the grid wrapper. Add derived tokens for zebra and hover for each preset in `derive.ts` (`--grid-zebra`, `--grid-hover`, `--grid-header-bg`).

3. **[seen live] Calming: the grid visually shouts against the page.** A navy header row and a white body sit against paper or sepia pages, and in Archive it looks pasted on. Fix: after item 2, make the header a quiet tint (a muted surface, not the full-strength primary) with bold label text. Drop the always-navy header.

4. **[seen live] Clear: filler cells.** Bible-passage rows show "--", "—" and "+" in nearly every column, plus the duplicate leading "+" and a Category "+". Fix: render empty as blank, or one muted en-dash in a lighter tint. Keep a single add affordance.

5. **[seen live] Clear: two per-column separators.** The vertical "|" dividers sit beside the filter icons in every header cell. Fix: hover-only filter icon, no dividers.

6. **[seen live] Beautiful: inconsistent content widths.** Activity is full width (32px gutter) while Discover and the header logo align to a 112px gutter. Fix: pick one gutter or one max-width for all pages.

7. **[seen live] Beautiful: desktop and mobile disagree.** Mobile cards follow the theme and look calm. Desktop grid does not. Fix: item 2 resolves most of it.

8. **[read from source only] Clear: the Columns dialog cannot hide Category.** Not verified against source beyond the dialog list. Fix: list every hideable column.

9. **[seen live] Interesting: Compare empty state is a single line of text at the top of a blank page.** Fix: centred message with a small illustration or a button to Activity. Low priority.

10. **[seen live] Clear: Discover has the accent-bordered search field with strong focus ring.** This is good, not a defect. No change.

## 4. Part B discoveries

- The hover complaint is really two problems: the stripe is too strong and the hover too weak, and both are hard-coded outside the theme system.
- The grid not following Midnight only appears live. The source shows hex literals, but the pale-on-white titles (a mix of themed and unthemed text colours) only show in the browser.
- The Discover page is calm and well proportioned, with a clear primary action ("Add to Library" in the theme's accent). It is the best screen in the app.
- Compare with no selection is an empty page with one line of text, which fits the priority "Clear" but is not "Beautiful".
- The header follows the theme correctly in every preset, so the token system works. Only the grid bypasses it.
- The header focus ring is well visible.

## 5. Path to B+ or better

1. Feed the theme tokens to AG Grid (findings 2 and 3). This is the single biggest change: it fixes Midnight, Terminal, Garden, and Archive at once.
2. Redefine hover and zebra (finding 1): stronger hover with a left accent bar, zebra at 2-3% or removed.
3. Blank out the filler cells and remove the header dividers (findings 4 and 5).
4. Unify page gutters (finding 6).
5. Only after those, polish Compare's empty state.

Would not touch: the header, the theme presets, the Discover layout, the mobile card layout, the dialogs, and the serif titles.

## 6. Self-report

- Rules applied: evidence before opinion (measured, not guessed), theme tokens over hard-coded colours, state changes must be visibly distinct (hover vs zebra), calm over loud, and consistency between desktop and mobile.
- What live driving revealed that source-reading alone would not: illegible Midnight titles, the grid never following any theme, and the Archive theme clash. Also the AG Grid init-order console warning.
- Could not do: tab into the grid cells to check the focus indicator there. I did not measure hover with a real cursor for both parities (I computed the composite from the theme values and confirmed the rest colours live). I did not check Midnight hover with a computed style. I did not open the messages panel or the user menu. The keyboard check was done in Archive only. `impeccable` had no PRODUCT.md, so no context-based critique was run.
- Theme restored: `perspectize-theme` was null originally and is null now (confirmed by reload). `perspectize-theme-applied` was `{"dataThemeId":null,"vars":null}` originally and was set back to the same value.
- Screenshots taken: 10 (A1, hover, Midnight, Archive, keyboard focus, mobile, Columns dialog, Settings dialog, Discover, Compare), plus 3 accessibility snapshots.
