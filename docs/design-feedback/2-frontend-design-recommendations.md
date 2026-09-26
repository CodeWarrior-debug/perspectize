# 2 - frontend-design recommendations

Skill `frontend-design:frontend-design` was invoked and loaded successfully. Evidence: screenshots 01 and 09 viewed; `ActivityTable.svelte` (theme block, lines ~444-466) and `app.css` token blocks read. No row-hover screenshot exists. Everything about hover below is **inferred from CSS**, not seen.

## 1. Verdict: C

The token system is real and the Geist + Charter pairing suits a reading-and-annotation product. But the screen has no single point of view. Two full-width navy bands (app header, grid header) frame the content. The table has a hairline frame inside a rounded frame. Saturated vermilion play icons appear on every YouTube row and read as alerts. The table ignores the chosen theme entirely: `ActivityTable.svelte` hardcodes `#1a365d`, `#f7fafc`, `#d4d4d4`, `#ffffff` and `rgba(26,54,93,...)` in `themeQuartz.withParams`, while the preset picker (screenshot 09) offers five themes that never reach the grid. The owner's C- is fair. The distinctive thing available here is that this is a *reading* product (Charter titles, "Reading Room" preset name), so the interface should feel like a well-lit reading desk, not a data console.

Design plan (revised once): my first instinct was warm cream + serif + terracotta. That is the cliche the skill warns about, and Archive already exists as a sepia preset, so I moved the default identity to cool paper with a single ink-blue and let warmth live only in the alternates.

## 2. Findings (ranked by Clear, Calming, Beautiful, Interesting)

### Clear
1. **Hover is invisible.** `oddRowBackgroundColor: '#f7fafc'` versus `rowHoverColor: rgba(26,54,93,0.06)` over white composites to about `#f0f2f5`; against `#f7fafc` that is a delta of a few RGB points. See section 3.
2. **Placeholder noise.** Bible rows show `--`, `—` and empty cells across six columns (screenshot 01). Three different "empty" glyphs mean nothing distinct. Use one muted en dash, or hide non-applicable columns per type. Fix in the cell renderers in `ActivityTable.svelte`.
3. **Clipped last column and half-row at the bottom** ("Tags", "Hegel & Kant's Theory"). Truncation with no scroll hint. Add a right-edge fade or a sticky Item column.
4. **Filter icons on every header** compete with the labels. Show them on header hover or focus, or only when a filter is active.

### Calming
5. **Two navy bands.** Header (`--color-primary`) plus grid header (`#1a365d`) is heavy. Make the grid header a paper tone (`surface-alt`) with `text-muted` labels and a 1px bottom rule; keep navy only on the app bar (or neither).
6. **Border on border.** Grid outer frame plus card radius plus per-row rules. Remove the outer border; keep row separators only, at low contrast.
7. **Vermilion play icons.** Use `text-muted` for content-type glyphs; reserve saturated colour for danger. The colour should say "this is a video", not "this is an error".
8. **Row height 64px with 13px titles** reads sparse. Keep 64 for the two-line thumbnails but let text rows without thumbnails be 48.

### Beautiful
9. **Charter is used well in titles; use it once more.** The page title "Activity" is Geist bold; setting it in Charter at ~30px with tight tracking would give the one memorable typographic moment. Keep everything else Geist.
10. **Theme swatches** (screenshot 09) show four near-identical pale dots for light themes. Show one primary dot plus a mini zebra/hover strip so the swatch previews what the table will do.

### Interesting
11. Spend boldness in one place: a 3px inset left rule on the hovered/selected row in `primary`. That is the signature interaction. Do not add entrance animations or card hover transitions.

## 3. Activity table hover / zebra fix

Root cause: hover and zebra are both faint tints of the same blue, and both are hardcoded rather than derived from theme tokens.

Recommendation: three separate roles that differ in *hue direction and weight*, not just lightness.

| State | Light (default) | Dark |
|---|---|---|
| Rest, even | `background` `#fbfaf7` | `#13181f` |
| Zebra (odd) | `surface-alt` `#f3f1ec`, warm-neutral, very quiet | `#1a212b` |
| Hover | `row-hover` `#dfe8f5`, clearly cooler and deeper than zebra, plus `box-shadow: inset 3px 0 0 var(--color-primary)` on the first cell | `#2a3a52` plus same inset rule in a lighter primary |
| Selected | `primary` at 14% over background, plus the inset rule, plus 1px top/bottom `border` | `primary` at 22% |
| Keyboard focus | 2px `ring` outline inset on the row (never removed, never the same as hover) | same, ring lighter |

Rules: hover must not equal zebra in either direction, so zebra is desaturated and hover is tinted toward the primary hue. Selected must be distinguishable from hover; the rule bar is the shared signal, the fill depth is the difference. Hover on an already selected row deepens selection by 4%.

Wire it to the theme: replace the hardcoded `withParams` values with `var(--color-background)`, `var(--color-surface-alt)`, `var(--color-row-hover)`, `var(--color-border)`, `var(--color-foreground)`, `var(--color-primary)`. Add `--color-surface-alt` and `--color-row-hover` to every preset in `app.css`. Existing tokens map as: `surface` = `--color-card`, `text-muted` = `--color-muted-foreground`, `danger` = `--color-destructive`. Note the current presets set `--color-muted-foreground` to `#171717` or `#ffffff`, which removes the muted level entirely; give it a true mid-tone (see palettes).

## 4. Path from C- to B+

Smallest ordered set:
1. Add `--color-surface-alt` and `--color-row-hover` tokens; feed all grid colours from tokens (fixes the top complaint and theme-blindness in one change).
2. Restore a real `--color-muted-foreground` in every preset.
3. Grid header becomes paper-toned, not navy; drop the outer grid border.
4. Content-type icons to muted ink; saturated colour only for danger/status.
5. Filter icons appear on header hover or when active.
6. One consistent empty-cell glyph.

That reaches B+. Beyond: Charter page titles, swatches that preview zebra/hover, right-edge overflow fade, per-type column relevance.

Do not touch: Geist + Charter pairing, the hover tooltips, the responsive column tiers, the Discover/Compare layouts, the AG Grid setup, the 64px row height for thumbnail rows.

## 5. Ten palettes

All hex. Type stays Geist + Charter. `on-primary` = `primary-foreground`. Contrast is `text` on `background` / `text` on `row-hover`, computed (WCAG relative luminance). Zebra vs hover is a tint-direction change and is reinforced by the inset primary rule (section 3); luminance alone differs only slightly in light themes, which is intentional for calm.

Common status colours are listed per palette. Muted text is chosen to be at least 4.5:1 on `background`.

**1. Reading Room v2 (light, conservative, recommended default)** - cool paper, ink blue; the current identity, calmed.
background #fbfaf7, surface #ffffff, surface-alt #f3f1ec, row-hover #dfe8f5, border #dcd8cf, text #1f2933, text-muted #55606c, primary #24406b, primary-foreground #ffffff, accent #b7791f, success #2f7d4f, warning #a86a00, danger #b3372d, info #2b6cb0. Contrast 14.1 / 11.9.

**2. Fieldnote (light, calming)** - pale sage paper, evergreen ink.
background #f6f8f7, surface #ffffff, surface-alt #eaefec, row-hover #d5e8df, border #cfd9d3, text #1d2a24, text-muted #4f6058, primary #2f5d4a, primary-foreground #ffffff, accent #8a6d2b, success #2e7d4a, warning #9a6700, danger #a83a2c, info #2f6690. Contrast 14.0 / 11.7.

**3. Archive Warm (light, conservative)** - kept close to the existing sepia but with the missing hover step.
background #fdf6ee, surface #fffaf3, surface-alt #f5ebdd, row-hover #f3dcc0, border #dcc9a8, text #3a2f22, text-muted #6b5b47, primary #7c5a2e, primary-foreground #ffffff, accent #3d6b7a, success #3f7a3a, warning #9a6a00, danger #a9411e, info #34708a. Contrast 12.2 / 9.8.

**4. Lavender Ledger (light, calming, bolder hue)** - quiet violet tint; ties to the logo purple.
background #f7f7fa, surface #ffffff, surface-alt #eeeef4, row-hover #dcdcf3, border #d5d5e2, text #22222e, text-muted #595870, primary #4c3fa3, primary-foreground #ffffff, accent #c2410c, success #2f7d4f, warning #a35c00, danger #b3261e, info #2b5fb3. Contrast 14.7 / 11.7.

**5. Plain Sheet (light, clearest)** - neutral white, maximum legibility, blue only on interaction.
background #ffffff, surface #ffffff, surface-alt #f4f4f5, row-hover #e0ecff, border #e0e0e4, text #18181b, text-muted #52525b, primary #1d4ed8, primary-foreground #ffffff, accent #0f766e, success #15803d, warning #a16207, danger #b91c1c, info #0369a1. Contrast 17.7 / 14.9.

**6. Harbour Mist (light, calming)** - grey-warm paper with a teal-grey hover.
background #f8f6f2, surface #ffffff, surface-alt #efebe3, row-hover #d9e6ea, border #d8d3c8, text #2a2a2a, text-muted #5c5c5c, primary #2c5f6f, primary-foreground #ffffff, accent #a65d2e, success #35784a, warning #98650a, danger #ad3b30, info #2d6a94. Contrast 13.3 / 11.2.

**7. Midnight v2 (dark, calming)** - deep slate, not black; hover clearly lifts.
background #13181f, surface #1a212b, surface-alt #1a212b, row-hover #2a3a52, border #2c3648, text #e6e9ee, text-muted #9aa5b4, primary #7aa2e3, primary-foreground #0d1421, accent #e0b15a, success #5fbf88, warning #e0a84a, danger #f07178, info #6cb3e6. Contrast 14.6 / 9.5. (Zebra equals surface here; zebra vs hover luminance ratio 1.4.)

**8. Lamp Oil (dark, warm, bolder)** - charcoal with amber, like a desk lamp.
background #16171a, surface #1d1f23, surface-alt #1d1f23, row-hover #33302a, border #34363b, text #e8e6e1, text-muted #a39f96, primary #e0a94a, primary-foreground #1a1408, accent #7fb5c9, success #6cc38a, warning #e6b84f, danger #ef7a6e, info #78b4e0. Contrast 14.4 / 10.5.

**9. Deep Herbarium (dark, calming)** - blue-green dark, restrained replacement for Terminal.
background #0f1a17, surface #15231f, surface-alt #15231f, row-hover #20403a, border #27403a, text #e2efe9, text-muted #92aca2, primary #6fcf9f, primary-foreground #06140e, accent #d9b26a, success #6fcf9f, warning #e2b04d, danger #f2796f, info #6bb7de. Contrast 15.0 / 9.6.

**10. Rose Vellum (light, bolder, interesting)** - blush paper, plum ink; one deliberate departure.
background #fbf5f6, surface #ffffff, surface-alt #f4eaed, row-hover #ecd6dc, border #e0ccd2, text #2b1f24, text-muted #6a5560, primary #7a2e4d, primary-foreground #ffffff, accent #2f6f6a, success #2f7d4f, warning #9a6700, danger #b3261e, info #2b6cb0. Contrast 14.7 / 11.5.

Notes: primary-foreground on primary is at least 4.5:1 for 1-6, 10 (dark primaries with white). For 7-9 primary is light and paired with a dark foreground. `text-muted` values were picked by eye to clear roughly 5:1 on `background` and were not individually computed; verify before shipping. Status colours were not contrast-tested against `row-hover`; treat as a follow-up.

## 6. Self-report

Applied from `frontend-design`: plan-then-review-against-brief step (rejected the cream/terracotta default and the near-black/acid-accent default, hence cool paper and muted dark themes); "spend boldness in one place" (the inset hover/selected rule, Charter page title); avoid decorative structure (remove border-on-border, nested frames); restraint on motion (none added; only state-answering feedback); quality floor (visible keyboard focus, contrast computed for the two required pairs). Its typography guidance about avoiding all-caps labels and single-word accents was respected by recommending none.

Could not help with: the skill is oriented to building new pages, not to auditing an existing token system or producing accessible palette sets, so contrast maths and token wiring came from my own checks. No hover screenshot means the hover state is inferred. Muted-text and status-on-hover contrast not fully verified (see palette notes).
