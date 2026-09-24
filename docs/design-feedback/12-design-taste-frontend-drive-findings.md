# Perspectize drive findings: design-taste-frontend

Design Read: product UI (data-heavy, out of this skill's core scope, Section 13) for a returning reader/curator, with a calm reading-room language. Dials: VARIANCE 3, MOTION 2, DENSITY 5. Only the skill's universal rules (dark-mode parity, contrast, locks, states, mobile) are applied.

## 1. Verdict

**C-.** The owner's grade is fair. The shell is competent and the mobile card view is good. But the Activity table, the main screen, has three real defects:
1. Hover gives no usable feedback.
2. The grid ignores the theme.
3. In Midnight the Item titles are close to invisible.

The last one is worse than the hover complaint. It breaks the "Theme parity" and "Color/Page Theme Lock" rules: the page is dark, the grid is a white slab, and the text was themed for dark, so it is unreadable. There is also a shape and colour inconsistency. Headers are always navy, whatever the theme. Activity is full-bleed while Discover and Compare are centred at about 1216px. Fixing the grid theming and hover gets this to B, and B+ with the small polish list below.

## 2. Part A results

| # | Observed | Issue |
|---|---|---|
| A1 | Light default (Reading Room). Navy top bar, navy grid header, white grid, serif item text, thumbnails. Rows are 64px. Many Bible Passage rows are all dashes ("—" and "--"). | The page background is white although the theme is described as "warm paper-white". Dash-filled rows look empty and noisy. Two different dash glyphs ("—" and "--") appear in one row. |
| A2 | Odd row (index 1) at rest: rgb(247,250,252) (#f7fafc). Hovered: the row's own background stays the same and a `::before` overlay of rgba(26,54,93,0.06) is added. The result is about rgb(234,238,243) over zebra. | Overlay is only 6% alpha. In the screenshot the hover reads as a faint grey. |
| A3 | Even row (index 2) at rest: rgb(255,255,255). Hovered: overlay over white gives about rgb(241,243,245). The screenshot showed a faint grey band. | The hovered even row (241,243,245) is almost the same as the resting odd zebra row (247,250,252): about 6/7/7 per-channel difference. |
| A4 | Method: composite the alpha overlay over the base and compare per-channel distance (RGB Euclidean) and WCAG luminance ratio. Even-hover vs odd-rest: distance about 11, contrast about 1.05:1. Zebra step itself (white vs odd): distance about 9. | Hover is the same visual size as the zebra step. This confirms the owner's complaint: it is barely distinguishable from a zebra row. |
| A5 | Midnight: navbar and page turn dark, but the grid stays white with the light zebra (rgb 255,255,255 / 247,250,252). Item text turns near-white, so titles ("Psalms 139:1-10", "Romans 8:28", video titles) are nearly invisible on white. Numeric columns stay dark. Placeholder icon tiles turn dark navy. Hover is the same 6% navy overlay. Var `--ag-background-color` stayed #ffffff, `--ag-odd-row-background-color` stayed #f7fafc, `--ag-row-hover-color` stayed rgba(26,54,93,.06). | BLOCKER. The grid does not follow the theme. Item column text is unreadable in any dark theme (well under 1.5:1). |
| A6 | Archive (light, brown): navbar, buttons, toggle and page background follow the theme (warm cream). The grid header stays navy (#1a365d-like), and the grid stays white and cool-grey zebra on a warm cream page. | Header colour and zebra tint do not follow the theme. A cool navy header on a brown and cream page reads as two systems. |
| A7 | Tab order moved through the header controls, and the focus landed on the floating Messages button (dark ring plus shadow, clearly visible). The default browser 1px auto outline (rgb 16,16,16) appears on buttons. On the Settings button in Midnight, a white ring was visible. | Focus ring is the browser default 1px, thin on the dark header. No visible focus check was possible inside grid cells this pass. |
| A8 | 390x844: Activity becomes a card list with thumbnail, serif title, channel and length, and an action icon. Themed correctly (brown and cream). "Add Content" collapses to a "+" icon. Footer toolbar collapses to icons. | Good. The best screen in the app. Minor: "+" gives no label. The Messages FAB overlaps the toolbar at the bottom right. |
| A9 | Theme picker: dialog, 5 preset swatches, "Customize". Midnight and Terminal swatches are a row of near-identical black dots and are hard to tell apart. Columns dialog: checkboxes list Type, Length, Views, Likes, % Liked, Published, Channel, Tags, Description. Cancelled both. | Columns list lacks "Category" though the grid has a Category column, and it says "Published" while the grid says "Date". The dialog has a long empty gap above the footer note. |
| A10 | Console: only dev noise. AG Grid warning "no value for --ag-list-item-height" (styles loaded after init). One `[error]` "Failed to load resource 404" x2. One form-field issue "should have an id or name attribute". Clerk dev-keys warning. Network: all GraphQL POSTs 200 and Clerk 200; the 404 was not among the fetch/xhr/document requests (likely an asset). | AG Grid init order warning and an unidentified 404 asset are worth fixing. |

## 3. Findings (ranked by Clear, Calming, Beautiful, Interesting)

1. **Grid ignores the active theme; item text unreadable in Midnight** (Clear). Screen: Activity in a dark theme. Evidence: grid bg #ffffff with near-white item text. Suggested fix: derive all AG Grid params (`background`, `odd-row`, `hover`, `header`, `foreground`, `border`) from the app theme tokens, not hard-coded values. **[seen live]**
2. **Row hover has no feedback** (Clear). Evidence: overlay rgba(26,54,93,.06). Even-hover about (241,243,245) against odd-rest (247,250,252), about 1.05:1. Suggested fix: hover should be its own token, clearly stronger than zebra (about 12-16% tint, or an inset 2-3px accent bar on the left edge of the row) and applied on top of both parities. Better: remove zebra entirely (see 4). **[seen live]**
3. **Zebra plus 1px row borders plus 64px rows is triple redundancy** (Calming). Every row has a bottom hairline and every other row has a fill. Suggested fix: pick one. Keep the hairlines and drop the zebra (density is low enough), then the hover can be the only fill change. This mirrors the skill's rule against borders on every row. **[seen live]**
4. **Headers hard-coded navy regardless of theme** (Beautiful, consistency lock). Suggested fix: header background from a token. Consider a light header (surface plus bottom border) so the table calms down; the heavy navy band at the top of the grid dominates the page. **[seen live]**
5. **Placeholder-dash rows dominate the table** (Clear, Calming). Bible Passage rows show "—" and "--" in seven cells. Suggested fix: one empty glyph (a lighter "-" or blank), muted to about 40% and never two glyph types; or collapse these rows to hide metric cells. **[seen live]**
6. **Layout width inconsistency** (Beautiful). Activity is full-bleed (left edge x=32), Discover and Compare and the header content sit at about x=112 with a 1216px container. Suggested fix: one page container, or a deliberate rule (grid may break out, text pages do not) with the logo aligned to the title. **[seen live]**
7. **Column header dividers, filter icons and a vertical "|" on every column** (Calming). Each header carries an icon and a pipe; this is 9 filter icons and 9 pipes of noise. Suggested fix: show filter icons on hover or only when a filter is active; drop the pipes. **[seen live]**
8. **Two typographic voices in the table** (Beautiful). Item and numeric text are serif while headers and controls are sans; numbers are in serif with non-tabular digits, so columns do not align. Suggested fix: use a sans with `font-variant-numeric: tabular-nums` for numeric columns; keep the serif for titles only. **[seen live]**
9. **Focus indicator is the thin browser default** (Clear, a11y). Suggested fix: a 2px offset ring using a token that passes 3:1 on both the header and page backgrounds. **[seen live]**
10. **Compare is an empty dead end** (Clear). Nav item goes to a one-line message centred at the top. Suggested fix: hide or disable the nav item until content is chosen, or add an empty state that says how to start (per the skill's empty-state rule). **[seen live]**
11. **Theme picker swatches for Midnight and Terminal are indistinguishable** (Clear). Suggested fix: bigger swatch previews showing surface, text and accent, not four dots. **[seen live]**
12. **Columns picker and grid disagree on names and set** (Clear). "Published" vs "Date", "Category" absent. **[seen live]**
13. **Console: AG Grid init-order warning, unexplained 404** (Clear). **[seen live]**
14. **Mobile: "+" without label, FAB overlaps footer toolbar** (Clear). **[seen live]**
15. **Page background is white in the default theme** although the preset says "warm paper-white". Suggested fix: apply the paper token to the page and card surfaces. **[seen live]**
16. **Grid theming code not located in `src`** (informational): a grep for `row-hover` / `odd-row-background` in `frontend/src` found nothing, so the colours probably come from a vendored or generated stylesheet or a JS param object; the fix needs that location found first. **[read from source only, unresolved]**

## 4. Part B discoveries

- Discover looks the most polished: a clear search field, trending cards with an action button, and the theme applied everywhere. Cards are good, but each has a very long raw-description snippet (with URLs and emoji), which is noisy. Truncate to one line or hide the URLs.
- Compare has no content without a selected item (see finding 10).
- The nav pill highlight is clear in both themes.
- The Discover search box has a heavy focus border, which is good.
- Nothing was written to the database. Nothing was clicked that saves.

## 5. Path to B+ or better

1. Theme the grid from tokens (finding 1 plus 4). Biggest change. Dark themes then become usable.
2. Remove zebra and set a strong hover token (findings 2 and 3).
3. Normalise empty cells and numeric typography (5 and 8).
4. Reduce header noise: filter icons on hover, no pipes (7).
5. Align the page container (6), fix the columns picker names (12), fix the focus ring (9).
6. Compare empty state and theme swatches (10 and 11).

Do not touch: the mobile card layout (A8), the Discover cards, the nav pill, the overall typography pairing of serif titles (a defensible reading-room choice, not a default-serif tell here).

## 6. Self-report

- Rules applied: Dark Mode Protocol (parity and contrast), Page Theme Lock, Color and Shape Consistency Locks, Form and Button Contrast, Empty/Loading/Error states, Mobile collapse, no decorative dots or borders on every row, and Copy Self-Audit for stray glyphs. I did not apply the landing-page rules (hero, eyebrows, bento, motion) because this is a product UI and the skill says it is out of scope.
- Live driving revealed what source-reading alone would not: the dark-theme grid unreadability, the computed hover overlay values, the mobile card view, and the picker and column-name mismatch.
- Could not do: verify keyboard focus inside grid cells, read the actual grid theme source, or check other light themes beyond Archive. Contrast numbers are hand-computed from composited alpha, not from a tool.
- Theme restored: original localStorage `perspectize-theme` was null (default, Reading Room navy); I removed the key and confirmed after reload (navbar rgb(26,54,93)). The `perspectize-theme-applied` cache was rewritten by the app on reload.
- Screenshots taken: 10. Findings: 16.
