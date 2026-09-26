# 5 - awesome-design-skills / minimal: Recommendations

System applied: `minimal` (typeui.sh): "stripped-back, whitespace, clean typography, restrained color for maximum clarity and focus." Tokens: primary `#0C0C09`, secondary `#312C85`, surface `#F4F4F1`, success `#16A34A`, warning `#D97706`, danger `#DC2626`; spacing 4/8/12/16/24/32; WCAG 2.2 AA, keyboard-first, visible focus, explicit interaction states.

Evidence: screenshots 01 and 09 (viewed; the others were not opened), `ActivityTable.svelte` lines 444-466 (AG Grid `themeQuartz.withParams`), `app.css` `@theme` and `[data-theme]` blocks. No row-hover screenshot exists. Everything about hover below is inferred from CSS, not seen.

## 1. Verdict: C+ (owner says C-; I am a little kinder)

The foundations are minimal-friendly: near-black text on white, a real token set, five presets, Geist + Charter. What fails the minimal test is restraint and explicit states. Two full-strength navy bands (top nav, table header) frame every screen. The table draws borders on every row, plus a rounded outer border, plus header column dividers. The saturated orange-red play icon repeats down the Type column. Most importantly, the grid ignores the token system: it is styled with hardcoded hex values, so the theme picker themes the page chrome but not the table. Under `minimal`, "keep interaction states explicit" is a must, and row hover is effectively invisible. That is the single largest gap to close.

## 2. Findings, ranked by the owner's priorities

### Clear
1. **Row hover is indistinguishable from zebra.** `ActivityTable.svelte:450-451`: `oddRowBackgroundColor: '#f7fafc'`, `rowHoverColor: 'rgba(26, 54, 93, 0.06)'`. Composited on white, that hover is about `#F1F3F5`, which is within 1.1:1 of `#F7FAFC`. Hover does not show which row the pointer is on. Fix in section 3.
2. **Table colours are hardcoded, not tokens.** Lines 447-457 use literal hex (`#1a365d`, `#d4d4d4`, `#171717`, `#ffffff`). Switching to Midnight or Terminal leaves a light-theme grid inside a dark page. `minimal` rule: "prefer semantic tokens over raw values." Fix: read `var(--color-*)` into `withParams` (AG Grid accepts CSS variables as strings) or add `--color-row-alt` and `--color-row-hover` tokens.
3. **Empty cells use three different placeholders.** Screenshot 01: `—`, `--`, and blank (Channel) appear for the same "no data" meaning on Bible rows. Ambiguous labels are a `minimal` don't. Pick one muted em dash, and blank nothing.
4. **Focus/selected states are not defined for rows.** `selectedRowBackgroundColor: rgba(26,54,93,0.08)` is even closer to the hover and zebra colours. Keyboard users cannot tell selected from hovered from striped.

### Calming
5. **Two heavy navy bands** (header nav, table header) plus a navy "All Content" segment and navy "Loaded 100 Items" chip. Minimal reserves the strongest colour for one job. Recommend: keep the app bar as the only filled band; make the table header `surface` with a 1px bottom border and `text-muted` uppercase-free semibold labels.
6. **Row rules plus zebra plus outer border** is triple encoding of the same row boundary (screenshot 01). Keep either zebra or rules. Minimal prefers whitespace over lines: keep the hairline, drop the zebra by default (or make it near-invisible).
7. **Repeated orange-red play glyphs** carry status-like colour on ordinary data. Make the type icon `text-muted` and reserve `danger`/`warning` for real alerts.

### Beautiful
8. **Type rhythm is fine but under-differentiated.** Charter in cells against Geist headers works; header text is white on navy at 14px semibold, which is loud. Under minimal, weight, not fill, should create hierarchy.
9. **Spacing.** Row height 64 is generous (good); header 40 and page title block are on the 4/8 scale. No change needed beyond aligning the toolbar controls' heights to 32 or 36.

### Interesting
10. Do not chase novelty. One permitted flourish: a 2px left inset accent bar on hovered/selected rows (also a non-colour cue, see 3).

## 3. Activity table hover / zebra fix

Principle: each state gets its own explicit, non-overlapping treatment. Zebra is the quietest, hover is clearly stronger and hue-shifted, selected is stronger still, and focus is an outline.

| State | Light (Minimal Paper) | Dark (Graphite) | Cue |
|---|---|---|---|
| Rest | `background` `#FFFFFF` | `#0C0C09` | none |
| Zebra (`surface-alt`) | `#F4F4F1` (or none; hairline only) | `#1B1B17` | neutral warm grey |
| Hover (`row-hover`) | `#E1E3F3` (indigo-tinted) | `#2E2D5E` | hue shift toward secondary, plus 2px inset left bar `#312C85` (dark: `#8B87E0`) |
| Selected | `#CDD0EC` plus 2px bar | `#3C3B78` plus bar | one step stronger than hover |
| Keyboard focus | 2px `ring` outline, offset -2px, inside the row | same, lighter ring | never colour-only |

Rules:
- Hover must differ from zebra in hue and lightness, and by more than just alpha. Alpha over an alternating background means hover differs per row parity; solid opaque colours avoid that.
- Hover must sit at least one step from zebra and selected at least one step from hover. In the palettes below the hover/zebra luminance ratio is only 1.2:1 (light) to 1.6:1 (dark) by design, since text contrast on hover must stay high; the hue shift and the left bar carry the distinction. Verify in browser.
- Implement via tokens: add `--color-row-alt`, `--color-row-hover`, `--color-row-selected` to `@theme` and each `[data-theme]` block, then pass `var(--color-row-alt)` etc. into `themeQuartz.withParams`. The left bar can be `.ag-row-hover { box-shadow: inset 2px 0 0 var(--color-accent-bar) }` via a small global rule.
- Hover transition: `background-color 80ms`, disabled under `prefers-reduced-motion`.
- Dark mode: all three states must be lighter than rest (not darker) so they read as lift; the palettes below do this.

## 4. Path from C- to B+

Smallest ordered set:
1. Tokenize the grid (finding 2) and add the three row-state tokens. This alone makes theming honest.
2. Apply the hover/zebra/selected table above (finding 1, 4). Fixes the top complaint.
3. Lighten the table header to `surface` plus 1px border plus dark text; leave the app bar navy as the single heavy band (5).
4. Drop zebra or reduce it to the `#F4F4F1`-class neutral, keep hairlines (6).
5. Normalise empty placeholders to one muted `—` (3), and mute the Type icon colour (7).

Beyond B+: an `axe`/keyboard pass to confirm every header, chip and row action has a visible `:focus-visible` ring; a density toggle (comfortable 64 / compact 48); moving segmented-control and chip fills from navy to an outlined style.

Do not touch: the Geist + Charter pairing, the token architecture and theme picker mechanism, row height 64, column set, hover tooltips, responsive tiers, the Reading Room navy as the default brand.

## 5. Ten palettes

`hover vs alt` is the luminance contrast between `row-hover` and `surface-alt`. Text contrasts are WCAG ratios computed from the hex values below. All 10 pass 4.5:1 on background and on row-hover.

Column key: bg=background, sf=surface, alt=surface-alt (zebra), hov=row-hover, bd=border, tx=text, mu=text-muted, pri=primary, pf=primary-foreground, acc=accent, ok/warn/err/info=status.

| # | Name (mode) | Intent | bg | sf | alt | hov | bd | tx | mu | pri | pf | acc | ok | warn | err | info | tx/bg | tx/hov |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Minimal Paper (light) | Default candidate: white, near-black, indigo hover | #FFFFFF | #FAFAF8 | #F4F4F1 | #E1E3F3 | #DCDCD6 | #0C0C09 | #55554E | #0C0C09 | #FFFFFF | #312C85 | #15803D | #B45309 | #B91C1C | #1D4ED8 | 19.6 | 15.4 |
| 2 | Warm Bone (light) | Off-white `surface` as page; softest, calmest | #F4F4F1 | #FBFBF9 | #EDEDE8 | #DADCF0 | #D6D6CE | #0C0C09 | #55554E | #312C85 | #FFFFFF | #0C0C09 | #15803D | #B45309 | #B91C1C | #1D4ED8 | 17.8 | 14.4 |
| 3 | Reading Room Calm (light) | Current navy brand, quieter table | #FFFFFF | #FFFFFF | #F6F7F9 | #D9E4F3 | #D9DEE5 | #171717 | #525A66 | #1A365D | #FFFFFF | #312C85 | #16A34A | #B45309 | #B91C1C | #1E5FA8 | 17.9 | 14.0 |
| 4 | Archive Soft (light) | Sepia, low glare | #FDF8F0 | #FFFDF8 | #F5EDE0 | #E6D5B6 | #DCC9A8 | #3A2F22 | #6B5A45 | #7C5A2E | #FFFFFF | #312C85 | #3F7A2E | #A25E0B | #A83A1C | #2F5D8C | 12.3 | 9.0 |
| 5 | Garden Quiet (light) | Herbarium green, restful | #F9FCFA | #FFFFFF | #EFF5F0 | #D0E5D7 | #C9D6C1 | #1F2B23 | #4E5F55 | #2F4A3A | #FFFFFF | #312C85 | #15803D | #A65F00 | #A6421F | #2B5F8A | 14.2 | 11.1 |
| 6 | Slate Mist (light) | Cool grey, corporate-neutral | #F8F9FA | #FFFFFF | #EEF0F2 | #D5DEEB | #D5DAE0 | #1E293B | #556070 | #334155 | #FFFFFF | #312C85 | #16A34A | #B45309 | #DC2626 | #2563EB | 13.9 | 10.8 |
| 7 | Midnight Lift (dark) | Navy dark, current Midnight with visible hover | #0D1421 | #121B2B | #172033 | #2A4066 | #2C3448 | #E8E6DF | #9AA3B5 | #8AA4D6 | #0D1421 | #B3AEF2 | #34D399 | #FBBF24 | #F87171 | #60A5FA | 14.8 | 8.3 |
| 8 | Graphite (dark) | Minimal inverted: near-black, indigo hover | #0C0C09 | #141411 | #1B1B17 | #2E2D5E | #2C2C27 | #F4F4F1 | #A3A39B | #F4F4F1 | #0C0C09 | #A5A0F0 | #4ADE80 | #FBBF24 | #F87171 | #7DA8FF | 17.8 | 11.5 |
| 9 | Terminal Glow (dark, bold) | Power-user green on black, clearly lit hover | #090B0A | #101512 | #121915 | #1C3D2A | #233327 | #C9F5D9 | #8FB39E | #4ADE80 | #052E16 | #86EFAC | #4ADE80 | #FACC15 | #FF6B6B | #67E8F9 | 16.5 | 10.0 |
| 10 | Indigo Ink (light, bold) | Secondary `#312C85` as the brand; the boldest of the set | #FFFFFF | #FAFAFE | #F3F3FA | #DCDBF6 | #D8D7EC | #0C0C09 | #55557A | #312C85 | #FFFFFF | #B45309 | #15803D | #B45309 | #B91C1C | #1D4ED8 | 19.6 | 14.5 |

Note on palette 9: `alt` is `#121915` in the table (the tested luminance figure used `#101512`); hover/alt separation remains about 1.5:1 either way, and text contrast is unaffected.

Hover vs alt luminance: light palettes about 1.2:1, dark 1.4-1.6:1. This is deliberately modest so text stays above 8:1 on hover; the distinction rests on hue plus the left bar (section 3). If the owner wants more punch, deepen `hov` by one step (e.g. palette 1 `#D3D6EE`) and re-check: text contrast stays above 12:1.

Set weighting: 1-6 are clear and calming light options (conservative), 7-8 are calm darks, 9-10 are the bolder options. Recommend trialing 1, 2 and 8 first; they are the most literal expression of `minimal`.

Status colours in the light palettes are darkened variants of the system's `#16A34A/#D97706/#DC2626` so they pass 4.5:1 as text on white; the system's raw values are fine for fills/icons only.

## 6. Self-report

Applied from the system: semantic tokens over raw values; explicit interaction states (default, hover, focus-visible, selected) with concrete values; WCAG 2.2 AA and testable thresholds (contrast ratios computed, not estimated); 4/8/12/16/24/32 spacing check; "flag aesthetic vs accessibility conflicts, prioritise accessibility" (darkened status colours, focus ring rule); "every do paired with a don't" (partly, in the findings); the system's own palette (`#0C0C09`, `#312C85`, `#F4F4F1`) seeded palettes 1, 2, 8 and 10.

The system could not help with: AG Grid specifics (it has no component-level table guidance), dark-mode guidance (it defines none, so palettes 7-9 are extrapolated), and its font tokens (Inter/Open Sans/Inconsolata) conflict with the required Geist + Charter, so I ignored them. It gives no hover-versus-zebra separation thresholds, so the 1.2-1.6:1 figures and the left-bar cue are my judgment. Hover behaviour was not observed in any screenshot.
