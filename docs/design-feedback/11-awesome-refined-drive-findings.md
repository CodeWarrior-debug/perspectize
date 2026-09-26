# Drive findings: awesome-design-skills / refined

## 1. Verdict

**C-** (agree with the owner). Refined asks for a modern, minimal look with serif typography, semantic tokens over raw values, explicit interaction states, WCAG 2.2 AA with visible focus, and consistent spacing. The app has a calm, credible base: a navy or warm-paper palette, serif body text in Charter, and a clean card layout on mobile. But it fails on three of Refined's own rules:

- **Semantic tokens over raw values.** The Activity grid hard-codes `#1a365d`, `#f7fafc` and `rgba(26,54,93,.06)` in `ActivityTable.svelte:447-451`. It ignores the theme system, so in Midnight and Archive the grid is visibly wrong.
- **Explicit interaction states.** Row hover is barely distinguishable from the zebra stripe.
- **Consistent spacing rhythm.** Page gutters differ per screen: 32px on Activity, 112px on Discover and Compare.

## 2. Part A results

| # | Observed | Issue |
|---|---|---|
| A1 | 1440x900 light (Reading Room), signed in. Navy app bar, serif cell text, sans-serif headers, dense 64px rows. Bible-passage rows are mostly "--" and "—" placeholders. | Noise from the empty cells. The double-bordered navy grid frame reads heavy. |
| A2 | Odd row (index 3): rest `rgb(247,250,252)`. Hover is a `::before` overlay of `rgba(26,54,93,.06)`, which composites to about `rgb(234,238,242)`. The row's own background does not change. `ag-row-hover` is applied. | The odd-row hover is visible but weak (contrast ratio 1.11, RGB distance 20.3). |
| A3 | Even row (index 2): rest `rgb(255,255,255)`. Hover composites to about `rgb(241,243,245)`. | Even-row hover is almost identical to the odd zebra colour (see A4). |
| A4 | Method: WCAG relative-luminance contrast ratio plus Euclidean RGB distance, with the overlay alpha-composited by hand. Even-row hover vs odd zebra: 1.061 ratio, distance 11.6. Zebra vs white: 1.048, distance 9.9. Hover vs its own rest state: 1.11 ratio, distance about 20. | Confirms the owner's complaint. Hovering an even row produces a colour that already exists as the resting odd row, so hover looks like "the next row's colour". Every step in the scheme is under 1.12:1. |
| A5 | Midnight: the page chrome goes dark, but the grid stays white, navy-headed and zebra-striped. The Item column text turns near-white on white and is illegible (screenshot: "Psalms 139:1-10" is a ghost). Thumbnail tiles are dark squares. Hover is unchanged. The grid does not follow the theme. | Critical: unreadable text. |
| A6 | Archive (light): the app bar, buttons and dialogs are brown or paper, but the grid header stays navy with cool-grey stripes and a cool-blue hover. Hover is still weak. | Theme mismatch: warm chrome around a cold grid. |
| A7 | Tab order reaches Settings (a visible white ring in dark, a dark ring in light) and the Messages FAB (a visible ring). The computed focus outline is `auto 1px`. I did not check the focus state inside the grid cells. | Focus is visible on chrome. Grid-cell focus was not verified. |
| A8 | 390x844: the grid switches to bordered cards. Thumbnails, title, channel, length and the "+" or glasses icon are clear. The Add Content button collapses to "+". It looks good and is the strongest screen. The tap targets are fine. | The cards have no zebra or hover, which is fine. The "+" button lacks a visible label. |
| A9 | The theme picker shows five presets plus a Customize option. The selected preset is shown only by a border. Preset descriptions are small (about 12px). The columns picker is clean and themed, with checkboxes, a "session only" note and Done. Both were cancelled with Escape. | The picker dialogs are themed correctly, which highlights the grid's failure to follow. |
| A10 | Console: a Clerk dev-keys warning, an AG Grid "--ag-list-item-height" style-load-order warning, a form-field id/name issue, and two 404s ("Failed to load resource", URL not identified). Network: all GraphQL POSTs returned 200. | The style-load-order warning suggests the grid theme is initialised before the CSS variables exist. Two 404s should be traced. |

## 3. Findings (ranked: Clear, Calming, Beautiful, Interesting)

1. **[seen live] Clear: the grid ignores the theme and text becomes illegible in dark themes.**
   - Where: `frontend/src/lib/components/ActivityTable.svelte:447-451`.
   - Evidence: in Midnight, the Item column text is near-white on a white row.
   - Fix: replace the raw hex values with theme tokens: `--color-primary` for the header, `--color-card` and `--color-accent` for the rows, and `--color-muted`, `--color-accent` or `--color-primary` mixed for hover. Use `themeQuartz.withParams` with CSS variables so it follows the active theme.

2. **[seen live] Clear: hover matches the zebra colour.**
   - Evidence: even-row hover is `rgb(241,243,245)` against a zebra colour of `rgb(247,250,252)`, a distance of 11.6.
   - Fix: make hover unmistakable and different in kind from the stripe.
     - Hover is a primary-tinted fill at about 12% alpha, giving a ratio of 1.25 or more against both row colours.
     - Add a 3px inset left accent bar in `--color-primary` on hover.
     - Reduce the zebra to about 2% tint or remove it and use hairline dividers only (the rows already have borders). This is the more Refined choice.

3. **[seen live] Calming/Clear: the two-colour system in Archive and Garden.** Warm chrome sits on a navy grid. This is fixed by finding 1.

4. **[seen live] Beautiful: inconsistent gutters and layout width.** Activity uses a 32px gutter and full width. Discover and Compare use a centred column starting at 112px. The header content also starts at 112px. Pick one container and gutter from the spacing scale (24 or 32) and reuse it.

5. **[seen live] Clear: the Compare page is a dead end.** It sits in the primary nav but shows one line ("No content selected...") floating at the top. Either remove it from the nav until content is selected, or give it a proper empty state with a call to action linking to Activity.

6. **[seen live] Calming: placeholder noise in the Bible-passage rows.** "—" and "--" appear in almost every cell, and the two glyphs differ. Use one muted em dash at reduced contrast, or leave cells empty. Check that it meets AA if it carries meaning.

7. **[seen live] Beautiful: the double navy border around the grid and the header divider bars ("|") are visually heavy.** Use a single 1px `--color-border` frame and drop the header separators (or make them hairlines).

8. **[read from source only] Typography.** Refined calls for an elegant serif for primary and display text. The app uses Geist for UI and Charter for reading text. The cell text is Charter at about 13px. It is defensible for a reading app, but the headings ("Activity", "Discover") are heavy sans. Setting page titles in the serif at 32px, weight 500-600, would move the look towards Refined. The 13px cell text is below the 14px step in the scale.

9. **[seen live] Interesting: focus and selection cues.** The selected theme preset is shown only by a border. Add a check mark and a `--color-ring` outline. The Messages FAB overlaps the grid's footer corner on Activity.

10. **[seen live] Console hygiene.** The AG Grid style-load-order warning and two unexplained 404s.

## 4. Part B discoveries

- Discover has a strong visible focus ring (a 2px tinted ring) on the search field, which is what the Refined "visible focus" rule wants. The grid should match it.
- Discover's result cards are well spaced and readable, but the "Add to Library" buttons are all identical, heavy and top-right. The Add Content button in the header is white on the coloured bar, which competes with the primary action colour.
- The mobile card layout is the most refined screen. The grid on desktop should borrow its spacing and hairline card language.
- Dialogs (Settings and Columns) follow the theme perfectly, which proves the token system works. Only the grid bypasses it.
- I did not open the user menu or Messages.

## 5. Path to B+ or better

1. Drive the AG Grid from theme tokens (findings 1 and 3). This removes the worst defect (illegible dark theme).
2. Redesign row hover and zebra (finding 2): an accent-tinted hover with a left bar, and a very light or absent zebra stripe.
3. Unify the page gutters and container (finding 4).
4. Give Compare a real empty state or hide it (finding 5).
5. Quiet the grid chrome: a single border, hairline header dividers, and unified placeholder dashes (findings 6 and 7).
6. Show the selected preset more clearly and fix the console warnings (findings 9 and 10).

Do not touch: the mobile card layout, the dialog styling, the theme preset system and the Discover search field. They already meet the rules.

## 6. Self-report

- Rules applied: semantic tokens over raw values; explicit hover, focus and active states; WCAG-style contrast measurement; a consistent spacing scale (4/8/12/16/24/32); and serif typography for primary and display text.
- Live driving revealed what source-reading would not: the exact composite hover colour (the overlay is a `::before`, so the row's computed background never changes), the illegible dark theme, the warm-and-cold mismatch in Archive, the inconsistent gutters and the Compare dead end.
- Not done: I did not verify the focus state inside the grid cells, the user menu, the Messages panel or the Add Content dialog. I did not identify the two 404 URLs. I did not test hover in dark themes with a real contrast measurement (the hover is unchanged from light).
- Theme restore: the original `perspectize-theme` value was null (default Reading Room). I removed the key, reset `perspectize-theme-applied` to `{"dataThemeId":null,"vars":null}`, and confirmed by reload (header navy `rgb(26,54,93)`, no `data-theme`).
- Screenshots taken: 12 (some as JPEG at reduced quality).
