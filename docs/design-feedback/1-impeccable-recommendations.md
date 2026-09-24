# 1 - impeccable recommendations

Skill loaded: yes (`impeccable` v4.3.1 via the Skill tool). Deviations from its flow are listed in the Self-report. Method: single-context review (no browser or detector run; analysis-only brief). Degraded relative to critique.md, which wants two isolated sub-agents.

Evidence: screenshots 01, 09, 10, 17 (viewed); `ActivityTable.svelte` lines 444-466 (AG Grid `themeQuartz.withParams`); `frontend/src/app.css` token blocks (`--color-*`, per-theme overrides). No row-hover screenshot exists. Everything about hover below is **inferred from CSS, not seen**.

## 1. Verdict: C+ (agree with owner's C-, half a step kinder)

Mode: **Operate** (a working table). Scanability, calm and consistency outrank expression. Product context (PRODUCT.md) does not exist; `impeccable context` asked for `init`. I inferred from the brief and DESIGN_SPEC instead, so treat brand-level calls as assumptions.

The bones are real: a token system, Geist for UI and Charter for reading, and tooltips that work. The grade is held down by three things. (1) The table is themed by hardcoded hex in `ActivityTable.svelte` and so ignores the theme picker (screenshots 09/10 show a Midnight/Archive picker while the grid stays navy and white). (2) There is heavy navy chrome: solid navy nav bar, solid navy grid header, navy segmented and pill buttons, all on one screen (screenshot 01). (3) Hover feedback, the primary interaction of a table, is effectively absent. I agree with the earlier review's "weight" diagnosis. I would sharpen it: the problem is less "four bands" and more that dark mass is used for *chrome* while *data* (the rows) has almost no hierarchy.

## 2. Findings, ranked by the owner's priorities

### Clear (priority 1)

1. **[P0] Row hover indistinguishable from zebra.** `oddRowBackgroundColor: '#f7fafc'` and `rowHoverColor: rgba(26,54,93,0.06)`. 6% navy over white is about `#f1f3f5`; over the odd row it lands near `#edf0f4`. Delta against the stripe is about 1.05:1, below perceivable. Why it matters: a table without hover gives no "this is the row I am about to act on" cue, and rows have click targets (perspectize `+`, category `+`). Fix: section 3.
2. **[P1] Theme picker does not reach the grid.** `themeQuartz.withParams` takes literal hex (`#1a365d`, `#ffffff`, `#171717`, `#d4d4d4`) instead of the CSS variables the rest of the app switches (`--color-*` in `app.css`). Picking Midnight leaves a white table under a dark shell. This breaks the promise of the picker (clarity of system status) and is the single largest consistency defect. Fix: pass `var(--color-...)` strings into `withParams` (AG Grid Quartz accepts CSS-variable colour strings), and add the new row tokens below.
3. **[P1] Empty and placeholder cells are noisy.** Bible rows show `—`, `--`, `--`, `—`, `--` in rows of similar weight to real data (screenshot 01). Two different dash glyphs are used for "no value". Why: repeated identical filler competes with content, and mixed glyphs read as inconsistency. Fix: one glyph (`—`), colour `text-muted` at about 60% opacity, or leave blank for non-applicable metrics (a Bible passage has no Views).
4. **[P2] Column header dividers and filter icons on every header.** Screenshot 01 shows a filter funnel plus `|` separator on nearly every column. Fix: show funnel on hover/focus or when a filter is active only.

### Calming (priority 2)

5. **[P1] Solid navy header row on the grid.** `headerBackgroundColor: '#1a365d'` plus the identical navy nav bar stacks two dark bands within 130px. Fix: make the grid header a `surface-alt`-toned band with `text-muted` uppercase-free labels and a 1px bottom border, keep navy only for the nav bar. Contrast is preserved at 4.5:1+ and visual weight drops sharply.
6. **[P1] Navy is used for four control types at once**: active nav pill, selected segment ("All Content", "Loaded 100 Items"), header, row of "Add to Library" buttons (screenshot 17). Fix: reserve the saturated primary for the single primary action per view; selected segments become `accent` tinted with primary text.
7. **[P2] Border stacking.** Grid outline plus inner rounded viewport plus row rules plus footer buttons with full borders (screenshot 01, bottom edge where the grid clip meets footer). Fix: drop the outer border or the inner radius clip; keep row hairlines only.
8. **[P2] Saturated status colours for everyday data** (orange-red play icon on every YouTube row, screenshot 01). The type icon is a category label, not an alert. Fix: use `text-muted` or primary tint for the type glyph; keep red for errors.

### Beautiful (priority 3)

9. **[P2] Geist + Charter pairing is under-used in the table.** Titles are Charter at 13px (good), but numeric columns are Geist regular with no tabular figures. Fix: `font-variant-numeric: tabular-nums` on Length/Views/Likes/%Liked so digits align across rows.
10. **[P2] Theme swatch cards** (screenshot 09) show four dots with almost no differentiation in the light presets (near-white dots). Fix: swatches should show bg / row-hover / primary / text so users can preview the hover change.

### Interesting (priority 4)

11. **[P3]** Let the selected/hovered row carry a small signature: a 2px inset primary bar at the row's left edge. It is functional (non-colour cue) and gives the product a recognisable detail without adding decoration.

Challenge to the earlier review: "hover tooltips work" is fine, but the tooltip and row hover are separate systems. Once hover shading is fixed the tooltip should not need to be the only feedback that a row is interactive.

## 3. Activity table hover/zebra fix

Principle: three surfaces must be separable by lightness alone: rest < stripe < hover < selected, in that order of prominence, and each derived from theme tokens, never hardcoded.

New tokens (added to every theme block in `app.css`, consumed by the grid):

```
--color-row-alt:    /* neutral, 2-4% shift from surface */
--color-row-hover:  /* primary-tinted, roughly 10-14% mix into surface */
--color-row-selected: /* primary-tinted, 18-22% mix, plus 2px inset bar */
```

Suggested AG Grid params (light default, Reading Room Calm):

```ts
oddRowBackgroundColor: 'var(--color-row-alt)',        // #f5f3ee on #fbfaf7
rowHoverColor:         'var(--color-row-hover)',      // #e1e9f4, opaque, NOT alpha
selectedRowBackgroundColor: 'var(--color-row-selected)', // ~#cddaee
```

Rules:
- **Opaque colours, not rgba.** The current rgba hover composites differently on odd vs even rows, so the same hover looks like two different colours and never clearly exceeds the stripe. An opaque hover gives one identical response on every row.
- Hover must be distinguishable from stripe by at least 1.1:1 lightness AND a hue shift (stripe is neutral warm/cool, hover is primary-tinted). Measured across the 10 palettes: hover vs stripe is 1.10-1.54, hover vs background 1.17-1.73. Light palettes sit at the low end, so also use the left bar.
- **Non-colour cue:** on hover add `box-shadow: inset 2px 0 0 var(--color-primary)` on the row (AG Grid: `.ag-row-hover`). That satisfies people who cannot rely on shade difference (WCAG 1.4.1 spirit).
- **Focus:** keyboard focus keeps AG Grid's cell focus ring in `--color-ring` (2px), unchanged, and must be visible over hover and selected fills. Do not remove `outline` on `.ag-cell-focus`.
- **Selected + hover:** selected wins; hover on a selected row darkens selected by about 4% (`color-mix(in oklch, var(--color-row-selected), var(--color-primary) 6%)`). Keep the inset bar at 3px on selected so it is distinguishable from hover.
- **Dark themes:** invert direction: hover is a *lighter*, more saturated lift (e.g. Midnight `#2d3d6e` over `#1b2240` stripe over `#12172a` rest). In dark, mix in the primary at roughly 20-25% rather than 10%, because low-luminance differences are harder to see.
- Text contrast on hover must stay at 4.5:1 or better; every palette below is 8.6:1 or better.
- Drop `columnHoverColor` (`rgba(26,54,93,.04)`): a second hover plane over the same cell fights row hover. Keep it off unless column hover is deliberately wanted.
- Testing note (per repo testing principles): the hover/selected/focus combinations are distinct states of a stateful component. AG Grid does not render in jsdom, so cover them through a pure function that maps theme tokens to grid params (unit-testable) plus a Vitest Browser Mode check of computed background on `.ag-row-hover`.

## 4. Path from C- to B+

Smallest ordered set:
1. **Wire the grid to theme tokens and add the three row tokens** (finding 2, section 3). This alone fixes the top complaint and the "ignores the theme" complaint. Expected: C- to C+/B-.
2. **Replace the navy grid header with a tonal band** (finding 5). Largest calm gain for the least code.
3. **De-navy the selected segments and secondary pills** (finding 6) so primary appears once per view.
4. **Normalise empty cells and mute the type icon** (findings 3, 8).
5. **Tabular figures + filter icons on hover only** (findings 9, 4). Expected: B+.

Beyond B+: the left inset bar signature, theme swatches that preview hover, a considered density toggle (56px vs 64px rows), and a quiet cross-fade (120ms, opacity/background only, respecting `prefers-reduced-motion`) on row hover.

Would not touch: the Geist + Charter pairing, the 64px row height (documented clipping reason in `frontend/CLAUDE.md`), the responsive column tiers, the tooltip behaviour, the theme picker architecture, and the Discover cards (screenshot 17 is already the calmest screen).

## 5. Ten palettes for the theme picker

Contrast figures are WCAG ratios computed from the hex values. "hover vs alt" is the lightness ratio between `row-hover` and `surface-alt`. All `text` on `row-hover` values are 8.6:1 or higher. `primary-foreground` on `primary` is 5.8:1 or higher.

Token names map to the app: background=`--color-background`, surface=`--color-card`, primary=`--color-primary`, accent=`--color-accent`, border=`--color-border`, text-muted=`--color-muted-foreground`. `surface-alt`, `row-hover` are the new row tokens.

Body/reading text stays Charter, UI stays Geist in all palettes.

### Conservative light

**P1. Reading Room Calm** - the current navy identity, warmed and quieted. (Clear, calming.) Text/bg 14.9:1, text/hover 12.7:1, hover vs alt 1.10.
| token | hex | token | hex |
|---|---|---|---|
| background | #fbfaf7 | text | #1d2430 |
| surface | #ffffff | text-muted | #5b6472 |
| surface-alt | #f5f3ee | primary | #2c4a7a |
| row-hover | #e1e9f4 | primary-foreground | #ffffff |
| border | #dcd8cf | accent | #c9d7ea |
| success | #3f7d5a | warning | #9a6a12 |
| danger | #b04a3a | info | #3b6ea5 |

**P2. Archive Sepia** - warm paper for long reading. (Calming.) Text/bg 11.9:1, text/hover 9.2:1, hover vs alt 1.19.
| token | hex | token | hex |
|---|---|---|---|
| background | #faf4ea | text | #3a2f22 |
| surface | #fffaf1 | text-muted | #6b5b47 |
| surface-alt | #f3ead9 | primary | #7c5a2e |
| row-hover | #e8d7b2 | primary-foreground | #ffffff |
| border | #d9c8a6 | accent | #e8d9b8 |
| success | #4b7a45 | warning | #94650d |
| danger | #a83f22 | info | #4a6f8a |

**P3. Garden Herbarium** - field-guide green, quiet and organic. (Calming.) Text/bg 13.7:1, text/hover 11.3:1, hover vs alt 1.14.
| token | hex | token | hex |
|---|---|---|---|
| background | #f6faf6 | text | #1f2d22 |
| surface | #ffffff | text-muted | #526457 |
| surface-alt | #eef4ee | primary | #2f6b45 |
| row-hover | #d6e9da | primary-foreground | #ffffff |
| border | #cfdcd0 | accent | #cfe6d3 |
| success | #2f7d4a | warning | #8f6a10 |
| danger | #ab4032 | info | #34688a |

**P4. Mist** - neutral cool grey-blue, the most "invisible" chrome. (Clear.) Text/bg 14.3:1, text/hover 11.9:1, hover vs alt 1.12.
| token | hex | token | hex |
|---|---|---|---|
| background | #f4f6f8 | text | #1b2530 |
| surface | #ffffff | text-muted | #56626f |
| surface-alt | #eaeef2 | primary | #3b5b8c |
| row-hover | #d6e3f2 | primary-foreground | #ffffff |
| border | #d3d9e0 | accent | #d5e0ef |
| success | #3d7a58 | warning | #96660f |
| danger | #b04437 | info | #3a6b9e |

### Bolder light

**P5. Linen Rose** - warm blush with a berry primary. (Beautiful.) Text/bg 15.1:1, text/hover 11.7:1, hover vs alt 1.19.
| token | hex | token | hex |
|---|---|---|---|
| background | #fbf6f4 | text | #2a1d1f |
| surface | #ffffff | text-muted | #6a5559 |
| surface-alt | #f5ece8 | primary | #8f3f4f |
| row-hover | #f0d5cd | primary-foreground | #ffffff |
| border | #e6d5d0 | accent | #ecd0d6 |
| success | #457a56 | warning | #97640f |
| danger | #a6342f | info | #446f96 |

**P6. Saffron Paper** - warm white with an amber-orange primary, the most energetic option. (Interesting.) Text/bg 16.1:1, text/hover 13.1:1, hover vs alt 1.12, primary/foreground 5.8:1.
| token | hex | token | hex |
|---|---|---|---|
| background | #fffdf6 | text | #231f16 |
| surface | #ffffff | text-muted | #645b48 |
| surface-alt | #f7f2e2 | primary | #a34e08 |
| row-hover | #fae5a1 | primary-foreground | #ffffff |
| border | #e6dcc0 | accent | #f6dfa8 |
| success | #457a3d | warning | #8a5f00 |
| danger | #b03a2a | info | #3b6a99 |

### Dark

**P7. Midnight** - late-night reading, deep indigo. (Calming.) Text/bg 14.6:1, text/hover 8.6:1, hover vs alt 1.49.
| token | hex | token | hex |
|---|---|---|---|
| background | #12172a | text | #e6e9f2 |
| surface | #171d36 | text-muted | #9aa3bd |
| surface-alt | #1b2240 | primary | #8fb0ff |
| row-hover | #2d3d6e | primary-foreground | #10162b |
| border | #2c3452 | accent | #33406f |
| success | #6cc59a | warning | #e3b356 | 
| danger | #ef8a80 | info | #7db3f0 |

**P8. Slate Dark** - neutral graphite, lowest saturation, works for long sessions. (Clear.) Text/bg 14.7:1, text/hover 9.4:1, hover vs alt 1.39.
| token | hex | token | hex |
|---|---|---|---|
| background | #16181c | text | #e8eaed |
| surface | #1a1d22 | text-muted | #9aa1ab |
| surface-alt | #1f2328 | primary | #7fb0e8 |
| row-hover | #2e3b4d | primary-foreground | #0f1720 |
| border | #2f343c | accent | #2a3a52 |
| success | #66c08e | warning | #e0b24f |
| danger | #ec8a80 | info | #78b0e8 |

**P9. Terminal** - power-user green on near-black, dense and precise. (Interesting.) Text/bg 15.0:1, text/hover 8.7:1, hover vs alt 1.54.
| token | hex | token | hex |
|---|---|---|---|
| background | #0f1512 | text | #dcebe2 |
| surface | #121a16 | text-muted | #8fa89a |
| surface-alt | #17211c | primary | #6fd39a |
| row-hover | #24443a | primary-foreground | #0a1410 |
| border | #24322b | accent | #1f3a2e |
| success | #6fd39a | warning | #dcb95a |
| danger | #ee8c80 | info | #79b8d8 |

**P10. Dusk Plum** - violet dusk, the boldest dark option. (Beautiful.) Text/bg 14.7:1, text/hover 9.8:1, hover vs alt 1.34.
| token | hex | token | hex |
|---|---|---|---|
| background | #1a1622 | text | #ece7f5 |
| surface | #201b2b | text-muted | #a89fbd |
| surface-alt | #241f31 | primary | #b79cf0 |
| row-hover | #3c3059 | primary-foreground | #1a1030 |
| border | #362f47 | accent | #3a2f57 |
| success | #7ccb9c | warning | #e2b866 |
| danger | #f08c88 | info | #82b4ea |

Recommendation for the default: P1 (light) and P7 (dark) as the calm-first pair. Ship P4 as the neutral option, P3 and P2 as the warm/organic options.

Note: dark palettes' `surface` sits between background and alt; `surface-alt` is the stripe. Light-palette hover-vs-alt lightness ratios (1.10-1.19) are modest by design, since strong shading would hurt calm. They are backed by a hue shift toward primary and the inset bar.

## 6. Self-report

Applied from impeccable:
- Mode selection (Operate) and "brief wins" (kept Geist + Charter, existing token names).
- Critique heuristics: I used the cognitive-load checklist and Nielsen lens informally (status feedback, consistency, aesthetic minimalism, recognition). I did not produce the full 10-heuristic score table.
- Persona lens: Alex (power user scanning the dense table) and Sam (keyboard/low-vision: hover cue, focus over fills, contrast) drove the hover recommendations.
- Colour discipline: tinted neutrals, primary reserved for the main action, status colours kept out of everyday data, dark mode by lightness lift rather than inversion.

Could not do / did not do:
- `impeccable context` reported no PRODUCT.md or DESIGN.md, and the brief forbids interviewing or writing extra files, so brand and audience calls are inferred.
- The critique flow wants two isolated sub-agents, a detector run (`impeccable detect`) and browser overlays. I ran none of them (analysis-only, screenshots only), so no detector counts are reported and the review is a single-context degraded run.
- No row-hover screenshot exists; hover behaviour is CSS-inferred. The hex arithmetic for the current rgba hover is an estimate, not a pixel sample.
- I did not read `DESIGN_SPEC.md`, `Header.svelte`, `ThemeCustomizePanel.svelte` or the other 20 screenshots in depth; findings on those areas rest on screenshots 01, 09, 10, 17 and `app.css`.
- Contrast ratios were computed with a WCAG luminance script; status colours were not individually contrast-checked against every surface.
