# Control drive findings (generalist review, no design system)

## 1. Verdict

**C.** Tidy and coherent at rest in the default light theme. The navy header, serif item titles and card-like mobile layout are competent. The owner's hover complaint is real but only partly what the numbers show. The bigger problem is that the Activity grid does not follow the theme. In Midnight the grid stays light while the surrounding chrome goes dark, and the Item titles become nearly invisible. In Archive the grid's cool blue-white rows clash with the warm cream page. The table is also dense and repetitive: 100 rows, and several of them are mostly "--" and "—" placeholders, which is noisy and not calming. Fixing the theme-following grid and the hover contrast would move this to B or B+.

## 2. Part A results

Measured values are computed style. The hover overlay is a `::before` layer of rgba(26,54,93,0.06) on the row, not a row background, so `getComputedStyle(row).backgroundColor` alone never changes on hover.

| # | Observed | Issue |
|---|---|---|
| A1 | 1440x900, light default. Navy header, 2 YouTube rows, then many "Bible Passage" rows with "+", "—" and "--" placeholders. Zebra is very faint. | Placeholder rows dominate the first screen. The table fills the viewport, while Discover and Compare use a narrower container (112 to 1328 px) than Activity (32 to 1408 px). |
| A2 | Odd row (row-index 3, zebra): rest rgb(247,250,252). Hover adds a 6% navy overlay, giving about rgb(234,238,243). Visible in the screenshot as a slight grey-blue band. | Hover is subtle but visible on odd rows. |
| A3 | Even row (row-index 2, white): rest rgb(255,255,255). Hover overlay gives about rgb(241,243,245). | This is the owner's complaint. The hovered white row lands almost on the zebra colour (247,250,252), so it looks like a zebra row. |
| A4 | Method: composite the 6% overlay over the base, then take Euclidean RGB distance. Hover on even (241,243,245) vs zebra (247,250,252) is about 10.5, so it is nearly indistinguishable. Hover on odd (234,238,243) vs its own rest (247,250,252) is about 19. Hover on even vs its own rest is about 21. Zebra vs white is about 8.6. Hover steps are of the same order as the zebra step. | Hover delta (about 20) is only about 2x the zebra delta (about 9). The hover overlay is a fixed 6% and is hard to see. |
| A5 | Midnight: header, page and toolbar go dark, but the AG Grid does not. Rows stay white (255) and zebra (247,250,252), and hover overlay is still navy 6% on white. Item titles and row labels are light-coloured on white rows and are close to invisible ("Psalms 139:1-10" is a faint grey). The "+" affordances vanish. | **Serious.** The grid ignores the dark theme. There is unreadable text and a stark white slab on a dark page. |
| A6 | Archive (warm cream). Header and buttons turn brown. The grid header stays navy (does not follow). Rows stay cool white / blue-white against the warm cream page. Hover unchanged. | The grid's cool palette clashes with the warm theme, and the navy grid header does not follow the theme. |
| A7 | Tab reaches the logo and shows a clear white outline ring on navy. Column-dialog checkbox has a visible dark ring. Search field on Discover has a visible focus ring. I only tabbed two stops on Activity and did not reach cell focus. | The header focus indicator is fine in light. I did not verify grid cell focus or focus in dark. |
| A8 | 390x844 becomes a card list: thumbnail, serif title, channel and length, glasses or "+" on the right. Clean. The chat FAB sits over the bottom-right and overlaps the footer and the last card. Toolbar collapses to icon buttons. | The mobile layout is better than desktop. The FAB overlap is a minor problem. |
| A9 | Settings dialog: 5 preset themes (Reading Room, Archive, Garden, Midnight, Terminal) plus Customize. Card grid is orphaned with 2 items on row 2. Columns dialog: 9 checkboxes, Done button, note that choices apply to this session only. Both cancelled with Esc. | Fine. The columns dialog is long and plain. |
| A10 | Console: no errors from the app except two 404 resource loads. Warnings: Clerk dev keys, "AG Grid: no value for --ag-list-item-height" (styles load after grid init), and one form field without an id or name. Network: all GraphQL POSTs were 200. | The AG Grid CSS-ordering warning is a hint that theming variables are applied late. The 404s are unidentified. |

## 3. Findings, ranked by priority

1. **Grid does not follow dark themes; Item titles are unreadable in Midnight. [seen live]** Priority: Clear. Where: Activity AG Grid, Midnight theme (screenshot: white rows on a dark page, titles faint grey on white, thumbnails dark). Evidence: row bg stays rgb(255,255,255) and rgb(247,250,252) in Midnight. Fix: drive `--ag-background-color`, `--ag-odd-row-background-color`, `--ag-foreground-color` and the header colour from the app's theme tokens, so switching themes re-themes the grid too.
2. **Hover on even (white) rows is nearly the same colour as zebra. [seen live]** Priority: Clear. Where: Activity grid. Evidence: hover on even is about rgb(241,243,245) vs zebra rgb(247,250,252), distance about 10. Hover on odd is more visible. Fix: make hover a distinct, stronger tint that is not in the zebra family, for example a 10-12% accent overlay. Or drop zebra entirely and rely on 1px dividers, which is calmer and lets hover carry meaning. Also add a subtle left accent bar on the hovered row.
3. **Placeholder rows are noisy: "—", "--", "+" repeated over many columns. [seen live]** Priority: Calming. Where: Activity rows for Bible Passage (about half the visible rows). Two different empty markers ("—" and "--") are used. Fix: use a single quiet muted empty-state marker (or leave the cell blank), and give Bible Passage rows fewer visible empty columns or collapse them.
4. **Grid palette clashes with warm themes; header stays navy. [seen live]** Priority: Beautiful. Where: Archive and Garden themes. Fix: theme the grid header and row tones from the same tokens as the shell.
5. **Inconsistent page container width. [seen live]** Priority: Clear or Calming. Activity spans nearly the full width (x 32 to 1408). Discover, Compare and the header content sit at x 112 to 1328. The heading left edge jumps between pages. Fix: use one content width and gutter, or make the header align to Activity.
6. **Column headers are cluttered. [seen live]** Priority: Calming. Every column has a filter icon and a pipe separator, plus a sort affordance, so the header is busy. Fix: show the filter icon on hover or only for active filters, and remove the pipe separators.
7. **Chat FAB overlaps content, most visibly on mobile and beside the grid footer. [seen live]** Priority: Clear. Fix: reserve bottom padding or shrink the FAB on narrow screens.
8. **Settings preset grid has an orphaned second row (2 of 3 cells). [seen live]** Priority: Beautiful. Minor. Fix: 5 columns, or 2 rows of 3 with a "Custom" card in the last cell.
9. **Discover: search auto-focuses with a heavy focus ring and a long trending list of full-size cards. [seen live]** Priority: Calming. Fix: tone down the ring, and reduce card height.
10. **AG Grid warning and 404s in the console. [seen live]** Priority: Clear (engineering hygiene). Fix: load the grid styles before grid init, and identify the 404s.
11. **Compare page empty state is bare: one line of grey text at the top. [seen live]** Priority: Interesting. Fix: centred empty state with an icon and a link back to Activity.

## 4. Part B discoveries

- The theme picker's dark themes reveal the grid-theming break (Finding 1). Reading source alone would not have shown that titles turn unreadable.
- The hover overlay is a `::before` pseudo-element, so the "row background" reads as unchanged. I only saw this by measuring pseudo-elements.
- Container widths differ between Activity and Discover/Compare.
- Mobile Activity is nicer than desktop.
- Discover trending list was loaded and readable; the Add to Library buttons are consistent with the primary navy.

## 5. Path to B+ or better

1. Theme the AG Grid from the app tokens (light and dark, all themes). This fixes findings 1 and 4.
2. Strengthen row hover and remove the zebra/hover collision (Finding 2). Consider removing zebra.
3. Clean up placeholder cells (Finding 3), and declutter the header (Finding 6).
4. Unify the container width (Finding 5) and fix the FAB overlap (Finding 7).

Would not touch: the navy header, the serif item titles, the mobile card layout, the dialogs and the focus rings on the header.

## 6. Self-report

- Approach: control. I applied no design skill, system or checklist. I drove the app as a generalist, measured computed styles, and read a little source for the theme storage key only.
- Live driving revealed what source alone would not: the grid ignoring the dark theme, the pseudo-element hover, and the width mismatch.
- Not done: keyboard focus inside the grid and in dark theme, hover on the dark theme's grid beyond one row, the user menu and messages panel, and Terminal/Garden themes.
- Theme restored: original value was `null` (no key). I removed the key and confirmed `null` after reload.
- Screenshots taken: 13 (2 of them from the Midnight and Archive themes).
- Tab: my own page only, closed at the end.
