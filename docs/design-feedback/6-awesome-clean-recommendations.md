# 6 — awesome-design-skills / clean: recommendations

System applied: `clean` (typeui.sh): minimal, ample whitespace, limited palette, WCAG 2.2 AA, semantic tokens over raw values, explicit interaction states, 8pt grid, type scale 12/14/16/20/24/32. Its Roboto/Poppins/Inconsolata fonts and blue #3B82F6 tokens are NOT adopted: the brief keeps Geist + Charter, and #3B82F6 on white is only 3.7:1, which fails clean's own "avoid low contrast text" rule. Only its principles are used.

Evidence: screenshots 01 (activity table), 09 (theme picker), source `ActivityTable.svelte` (the `themeQuartz.withParams` block, lines 444-466) and `frontend/src/app.css` tokens. No row-hover screenshot exists. Hover behaviour below is inferred from CSS/theme params, not seen.

## 1. Verdict: C+ (agrees with owner's C-, slightly kinder)

Clean asks for one primary, few surfaces, explicit states and whitespace. Perspectize has a real token set and legible type, so the foundation is sound. It loses points on: (a) the grid ignoring the theme (hard-coded hex in `themeQuartz.withParams`: `#1a365d`, `#f7fafc`, `#d4d4d4`, `#171717`, `#ffffff`), (b) hover feedback that is effectively invisible, (c) four heavy navy bands (header, grid header, active toggle, chat FAB) competing on one screen (screenshot 01), (d) borders stacked on borders (grid outline plus row rules plus toolbar buttons, all `#d4d4d4`), and (e) saturated orange-red play icons in every YouTube row for everyday data. I confirm the earlier review, and add that the Type column icons repeat what the row already says.

## 2. Findings, ranked by priority

### Clear
1. **Hover is invisible and theme-blind.** `rowHoverColor: rgba(26,54,93,0.06)` over white is about #F0F2F5, while `oddRowBackgroundColor #f7fafc` is about #F7FAFC. Difference is ~1 luminance step (about 1.1:1). Also both are hard-coded, so Archive/Garden/Midnight/Terminal never reach the grid. Fix: section 3.
2. **Grid tokens duplicated outside the token system.** Clean rule "prefer semantic tokens over raw values". Feed AG Grid from CSS variables (`var(--color-border)` etc.) instead of literals so picking a theme changes the table.
3. **Muted em-dashes and "--" placeholders are two different glyphs** for "no data" (Length shows an em dash, Views shows "--"). Ambiguous labelling. Pick one (en dash, `text-muted`) everywhere.
4. **Toolbar controls all look equally weighted** (Columns, Edit sorts, Clear sorts, mode toggle). Disabled "Clear sorts" at 50% opacity is fine, but the state of a sort is not otherwise shown. Show an active-sort count on "Edit sorts" when non-default.
5. **Focus:** `suppressCellFocus: true` removes cell focus rings. Keep, but ensure the row action buttons (+/glasses, item link) have visible `:focus-visible` (2px ring, `--color-ring`, 2px offset). Note `--color-ring` in Midnight/Terminal equals the near-black primary and is invisible on the dark background; use a lighter ring in dark themes.

### Calming
6. **Four navy masses.** Keep the header navy as the single anchor. Change the grid header to `surface-alt` with `text-muted` 12px/600 caps labels and a 1px bottom border (clean: limited palette, whitespace over fills). Make the active "All Content"/"Loaded" toggle a light tinted segment (`primary` at 10% with `primary` text) rather than solid navy. The FAB can stay solid: it is the one floating action.
7. **Borders around borders.** The grid has an outer 1px rounded border plus every row rule plus header separators. Drop the vertical header dividers (the `|` marks in screenshot 01) and the outer border; keep horizontal row rules only.
8. **Saturated data colour.** Orange-red play glyphs and `rating-*` reds/greens read as alerts. Render content-type icons in `text-muted`; reserve status colours for real status.
9. **Density:** 64px rows are generous and match clean's whitespace principle, but the 64px is spent on one line for Bible rows. Consider 56px with the 2-line title (13px x 1.5 = 39px) still clear of descender clipping (CLAUDE.md gotcha: verify visually after any change).

### Beautiful
10. **Type scale drift.** Grid 14px, item title 13px, toolbar 12/14px. Snap to the 12/14/16/20/24/32 scale: 13px title becomes 14px (row height 64px keeps 2 lines at 14/1.4). Page title "Activity" at 32 is correct; subtitle 14px muted.
11. **Radius:** buttons use `rounded-md`; the grid frame is rounder. Use 8px for containers, 4px for chips and small controls, consistently.

### Interesting
12. Restrained is the brief. One touch: a 3px primary left edge on hovered/selected rows (below), and a subtle 120ms background transition (honour `prefers-reduced-motion`, no other motion).

## 3. Activity table hover / zebra fix

Clean rule: interaction states explicit and distinguishable by more than colour alone. Three separate, theme-driven tokens, no overlap:

| State | Token | Light (Reading Room) | Dark (Midnight) |
|---|---|---|---|
| Rest, odd | `--color-background` | #FFFFFF | #0F172A |
| Rest, even (zebra) | `--color-surface-alt` | #F7F8FA (very quiet, 1.1:1 vs bg, whitespace does the work) | #162034 |
| Hover | `--color-row-hover` | #E3ECF8 (blue-tinted) | #25385A |
| Selected | `--color-row-selected` | #D0E0F5 | #2F4A78 |
| Focus-visible (keyboard) | ring | 2px inset `--color-ring` | 2px inset lighter ring #93B4F0 |

Rules:
- Hover must be hue-shifted toward `primary`, not just a darker grey; the zebra is neutral, the hover is tinted. Contrast between `row-hover` and `surface-alt` is only about 1.1-1.4:1 in luminance, so **do not rely on colour alone**: add a `box-shadow: inset 3px 0 0 var(--color-primary)` on hover (and 3px plus selected fill for selected). This is the non-colour cue clean requires and makes the hover unmistakable.
- Zebra should be quieter than hover, never equal or stronger. Alternatively drop zebra entirely and keep row rules; clean prefers fewer fills, and hover then has a whole surface to itself. I recommend keeping a very faint zebra only if the owner likes it.
- Wire it up (suggestion): in `themeQuartz.withParams`, `oddRowBackgroundColor: 'var(--color-surface-alt)'`, `rowHoverColor: 'var(--color-row-hover)'`, `selectedRowBackgroundColor: 'var(--color-row-selected)'`, `backgroundColor: 'var(--color-background)'`, `foregroundColor: 'var(--color-foreground)'`, `borderColor: 'var(--color-border)'`, `accentColor: 'var(--color-primary)'`; add the three new tokens to each theme block in `app.css`. Add the inset-shadow via `.ag-row-hover` and `.ag-row-selected` overrides.
- Text on hover must stay at least 4.5:1 (table below shows 9.6:1 to 15:1). Muted text on hover must be checked too: `text-muted` #525252 on #E3ECF8 is about 6.6:1, fine.
- Dark mode: hover is lighter than zebra (rises toward the viewer). Touch devices: no hover, so selected/pressed state must stand alone.
- Cursor: `pointer` only where a click does something (Item cell opens details, perspectize cell); row-wide hover on non-clickable cells is still fine as a reading guide.

## 4. Path from C- to B+

Smallest ordered set:
1. Add `--color-surface-alt`, `--color-row-hover`, `--color-row-selected` to every theme block; feed AG Grid from CSS variables. (Fixes top complaint and theme-blindness; alone is roughly C- to C+.)
2. Add hover inset accent bar plus `:focus-visible` rings; lighten ring on dark themes.
3. Grid header: navy to `surface-alt` with muted caps labels; remove vertical header dividers and outer grid border.
4. Mode toggle: solid navy to tinted segment; type icons to `text-muted`.
5. Snap type to the 12/14/16/20/24/32 scale; unify "no data" glyph.

That set reaches B+. Beyond: sort-count badge on "Edit sorts", empty/loading/error state audit (clean: design for all three; the grid has no-rows and error copy but no skeleton), 8pt spacing audit of toolbar gaps, a compact-density toggle, per-theme status colours.

Do NOT touch: Geist + Charter pairing, the 64px descender-safe row height (unless re-verified), the responsive tier logic and card mode, the theme picker structure, column picker, tooltip system.

## 5. Ten palettes for the theme picker

Common token mapping: `background`, `surface` (cards/popovers), `surface-alt` (zebra), `row-hover`, `border`, `text`, `text-muted`, `primary`, `primary-foreground`, `accent`, then status. Contrast measured with the WCAG formula. "T/bg" = `text` on `background`; "T/hover" = `text` on `row-hover`. `row-hover` is distinguishable from `surface-alt` by hue plus the inset bar (section 3); measured luminance gap is small in light themes by design (calming) and larger in dark ones.

| # | Name (mode) | Intent |
|---|---|---|
| 1 | Clean Slate (light) | Neutral white, one calm blue. The clean default. |
| 2 | Reading Room (light) | Current navy identity, refined. Conservative, familiar. |
| 3 | Paper (light) | Warm off-white, ink text. Calm long reading. |
| 4 | Sage (light) | Herbarium green, low arousal. |
| 5 | Mist (light) | Cool blue-grey, most calming and clear. |
| 6 | Blush (light) | Bolder warm rose-terracotta, still low saturation. |
| 7 | Sun (light) | Bolder: warm cream with amber hover, high energy but readable. |
| 8 | Midnight (dark) | Navy dark, keeps brand. |
| 9 | Graphite (dark) | Neutral charcoal, minimal. |
| 10 | Forest Night (dark) | Deep green dark, calm. |

| Token | 1 Clean Slate | 2 Reading Room | 3 Paper | 4 Sage | 5 Mist |
|---|---|---|---|---|---|
| background | #FFFFFF | #FFFFFF | #FBF8F3 | #F8FAF7 | #F5F8FB |
| surface | #FFFFFF | #FFFFFF | #FFFDF9 | #FFFFFF | #FFFFFF |
| surface-alt (zebra) | #F3F4F6 | #F7F8FA | #F4EFE6 | #EEF2EB | #EBF0F5 |
| row-hover | #DBEAFE | #E3ECF8 | #E6EEF7 | #DDEBE0 | #D9E8F5 |
| border | #E5E7EB | #D9DEE5 | #E4DCCB | #D3DDD0 | #D5DEE8 |
| text | #111827 | #171717 | #26221C | #1F2A22 | #152230 |
| text-muted | #4B5563 | #525252 | #5C5346 | #4A5A4E | #475569 |
| primary | #2563EB | #1A365D | #7C5A2E | #2F4A3A | #1D4E89 |
| primary-foreground | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF |
| accent | #8B5CF6 | #3B6FB6 | #B3441F | #6B8F5A | #3B82C4 |
| success | #15803D | #15803D | #3F7D2E | #15803D | #15803D |
| warning | #B45309 | #B45309 | #A16207 | #A16207 | #B45309 |
| danger | #B91C1C | #B91C1C | #B3441F | #A6421F | #B91C1C |
| info | #1D4ED8 | #1D4ED8 | #1E5A96 | #1E6A7A | #1D4ED8 |
| T/bg | 17.7:1 | 17.9:1 | 14.9:1 | 14.2:1 | 15.1:1 |
| T/hover | 14.5:1 | 15.0:1 | 13.5:1 | 12.1:1 | 12.9:1 |

| Token | 6 Blush | 7 Sun | 8 Midnight | 9 Graphite | 10 Forest Night |
|---|---|---|---|---|---|
| background | #FFFAF8 | #FFFDF5 | #0F172A | #18181B | #0E1512 |
| surface | #FFFFFF | #FFFFFF | #131C31 | #1C1C20 | #121B17 |
| surface-alt (zebra) | #F8F0EC | #FAF5E4 | #162034 | #1F1F23 | #141D18 |
| row-hover | #F4DFD6 | #FBE7A8 | #25385A | #2F3A4D | #22392E |
| border | #EBD9D1 | #EADFBF | #2A3853 | #34343A | #26382E |
| text | #2B2220 | #2A2413 | #E5E9F0 | #EDEDEF | #E4EFE8 |
| text-muted | #6B5650 | #6B5F3A | #A6B0C3 | #A1A1AA | #9DB3A6 |
| primary | #B04A2F | #8A5A00 | #7AA2F7 | #93B4F0 | #5FBF8F |
| primary-foreground | #FFFFFF | #FFFFFF | #0F172A | #18181B | #0E1512 |
| accent | #D9825F | #D19A1E | #5B8DEF | #C4B5FD | #A3D9B8 |
| success | #3F7D2E | #2F7D32 | #4ADE80 | #4ADE80 | #86EFAC |
| warning | #A16207 | #A16207 | #FBBF24 | #FBBF24 | #FBBF24 |
| danger | #B91C1C | #B91C1C | #F87171 | #F87171 | #F87171 |
| info | #1D4ED8 | #1D4ED8 | #60A5FA | #60A5FA | #7DD3FC |
| T/bg | 15.0:1 | 15.2:1 | 14.7:1 | 15.2:1 | 15.7:1 |
| T/hover | 12.1:1 | 12.6:1 | 9.6:1 | 9.8:1 | 10.5:1 |

Checks I ran (script): every `text`/`background` and `text`/`row-hover` value above is computed, all >= 9.6:1. `primary` on `primary-foreground` targets >= 4.5:1 (e.g. #2563EB/white 5.2:1, #1A365D/white 11.5:1); I did not compute every primary pair, verify #8A5A00, #B04A2F, #5FBF8F, #7AA2F7 buttons before shipping. Luminance ratio of `row-hover` to `surface-alt` is 1.1-1.4:1, which is why the hover inset bar is mandatory, not optional.

Suggested picker order (clear and calming first): Clean Slate, Mist, Reading Room, Paper, Sage, Midnight, Graphite, Forest Night, then the bolder Blush and Sun.

## 6. Self-report

Applied from clean: semantic tokens over raw values (findings 2, hover fix), explicit interaction states (default, hover, focus-visible, selected, disabled), WCAG 2.2 AA contrast targets, visible focus, limited palette (one primary), 8pt spacing and 12/14/16/20/24/32 scale, "avoid inconsistent spacing rhythm", "avoid ambiguous labels" (dash glyphs), empty/loading/error state prompt, reduced-motion, "flag aesthetic versus accessibility conflicts" (ring colour on dark, blue #3B82F6 rejected). Used its "must/should" language loosely and did not produce its full seven-part guidance document or QA checklist, since the brief defines a different output.

Where clean could not help: it has no dark-mode guidance, no data-table or density guidance, no theming/multi-palette model, and its fixed tokens (Roboto/Poppins, #3B82F6) conflict with Geist + Charter and with contrast, so I used its principles rather than its values. Hover shading itself (the top complaint) is not addressed by the system; the solution is my own. No screenshot showed a hover state, so hover analysis is inferred from `ActivityTable.svelte` CSS parameters.
