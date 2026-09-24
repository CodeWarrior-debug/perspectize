# 4 — awesome-design-skills / Refined: Recommendations

System applied: `bergside/awesome-design-skills` -> `refined` (typeui.sh). Design intent restated per its workflow: *a quiet, minimal, serif-led interface where every state is explicit, every rule is anchored to a token or threshold, and accessibility beats aesthetics when they conflict.*

Note on fit: Refined's own tokens (Playfair Display, `#3B82F6` primary, 4/8/12/16/24/32 spacing, 12/14/16/20/24/32 type scale) are generic. I did NOT adopt its fonts or blue; the brief requires Geist + Charter. I applied its method: semantic tokens over raw values, explicit interaction states, testable thresholds, and the 4-based spacing/type scale.

Evidence: screenshots 01 (activity), 09 (theme picker), source `ActivityTable.svelte` lines 444-466, `app.css` token blocks. No row-hover screenshot exists: hover behaviour below is INFERRED from CSS, not seen.

## 1. Verdict

**Grade: C.** (Owner says C-; Refined is slightly kinder on structure, harsher on state explicitness.) The tokens in `app.css` are real and semantic, and type pairing is sound. But the Activity table breaks Refined's first rule ("prefer semantic tokens over raw values"): `ActivityTable.svelte` hardcodes `#1a365d`, `#f7fafc`, `#d4d4d4`, `#171717`, `#ffffff` and rgba navy inside `themeQuartz.withParams()`, so it ignores the theme picker entirely. Its second rule, "keep interaction states explicit", fails at the hover state: hover and zebra are near-identical. Heavy navy header bands (app header plus table header, screenshot 01) and a bordered table inside a bordered page reduce calm.

## 2. Findings ranked by priority

### Clear
1. **Hover is indistinguishable from zebra** (top complaint). `oddRowBackgroundColor: '#f7fafc'` vs `rowHoverColor: 'rgba(26,54,93,0.06)'`. Over white the hover computes to roughly `#f0f2f5`; over a zebra row it is about `#eef1f5`. Contrast between the two states is about 1.05:1. Fix in section 3.
2. **Table tokens are raw values, not semantic** (`ActivityTable.svelte` 444-466). Why: Refined "must" use tokens; a hardcoded table cannot follow Archive/Garden/Midnight. Fix: derive AG Grid params from `getComputedStyle` of `--color-*` vars (or pass `var(--color-...)` strings, which AG Grid params accept) and re-apply on theme change.
3. **Selected vs hover vs focus not defined.** `selectedRowBackgroundColor: rgba(26,54,93,0.08)` is 2 points from hover 0.06. Refined requires default/hover/focus-visible/active states each explicit. Fix in section 3.
4. **Missing-data glyphs are inconsistent** in Length/Views/Likes columns: `—` in some cells, `--` in others (screenshot 01, Bible rows). "Avoid ambiguous labels": pick one placeholder (`—`) and give it `text-muted` so absence reads as absence.

### Calming
5. **Two heavy navy bands** (app header + table header, screenshot 01), plus a dark "All Content" segmented pill and "Loaded 100 Items" pill. Refined favours understated palettes. Fix: table header uses `--color-muted` background with `--color-foreground` text and a 1px `--color-border` bottom rule; keep the app header as the single dark anchor (or lighten it too, see palettes 1-6).
6. **Borders around borders.** Table has an outer rounded border, inner row rules, and the page toolbar controls are each bordered (search, columns, edit sorts, clear sorts). Fix: drop the outer table border; keep row rules only; make secondary buttons ghost until hover.
7. **Saturated status colours as everyday data** — the orange-red play icon in the Type column repeats on every YouTube row. Use `--color-muted-foreground` for type icons and reserve `danger/warning` for real alerts.

### Beautiful
8. **Spacing rhythm.** Row height 64, header 40, listItem 24 are on-scale. Toolbar gaps and control heights (search 36px vs pills 28px) are not; align to the 4/8/12/16/24/32 scale (controls 32 or 40, not mixed).
9. **Charter is used in table body, Geist in headers** — a good, Refined-compatible serif/sans split. Keep it; make sure numeric columns use `font-variant-numeric: tabular-nums` so Views/Likes/% align.

### Interesting
10. Theme picker (screenshot 09) swatches are tiny and the presets read as five near-equals. Larger swatch strips showing surface, zebra, hover, primary would let users see the table effect before choosing. Add a live mini-table preview.

## 3. Activity table hover / zebra fix

Refined rule anchor: every state gets its own token and a numeric threshold. Suggested tokens (add to each theme block in `app.css`):

- `--color-row-alt` (zebra): 1 step off background, luminance delta about 3%. (Existing `--color-accent` can seed it.)
- `--color-row-hover`: a **hue-tinted step of primary** clearly stronger than zebra; target at least 1.12:1 against `row-alt` and at least 1.2:1 against `background`.
- `--color-row-selected`: hover colour plus a 3px inset left bar in `--color-primary` (`box-shadow: inset 3px 0 0 var(--color-primary)`), so selection is not colour-fill alone.
- Focus-visible (keyboard): 2px `--color-ring` outline, offset -2px, on the row/cell; must not rely on fill.

AG Grid mapping:

```ts
withParams({
  backgroundColor: 'var(--color-background)',
  oddRowBackgroundColor: 'var(--color-row-alt)',
  rowHoverColor: 'var(--color-row-hover)',
  selectedRowBackgroundColor: 'var(--color-row-selected)',
  foregroundColor: 'var(--color-foreground)',
  borderColor: 'var(--color-border)',
  headerBackgroundColor: 'var(--color-muted)',
  headerTextColor: 'var(--color-foreground)',
  accentColor: 'var(--color-primary)',
});
```

Light example (Reading Room theme): background `#ffffff`, zebra `#f7fafc`, hover `#e3ebf5`, selected `#d3e0f0` + left bar. Dark example (Midnight Ink): background `#141a2b`, zebra `#1a2136`, hover `#2a3556`. Rule: in dark mode hover goes LIGHTER than zebra, never darker, so it stays visible. Add `transition: background-color 120ms ease` and disable under `prefers-reduced-motion`. Text must stay at least 4.5:1 on hover (all palettes below are 9:1 or better). Also drop `columnHoverColor` or make it under 0.03 alpha so column and row hover don't stack into mud.

Testable acceptance: (a) computed hover != computed zebra for both odd and even rows in every theme; (b) switching theme changes row colours without reload; (c) keyboard focus ring visible on 3:1 against adjacent colours.

## 4. Path from C- to B+

Smallest ordered set:
1. Replace hardcoded `withParams` values with CSS-variable tokens (finding 2). Table now obeys the theme.
2. Add `row-alt`, `row-hover`, `row-selected` tokens per theme with the distinctness thresholds (section 3).
3. Lighten the table header (finding 5). Removes one navy band.
4. Remove the outer table border; ghost-style secondary toolbar buttons (finding 6).
5. Unify missing-data glyph, muted colour (finding 4); tone type icons (finding 7).
6. Ship 3-4 palettes below into the picker (Vellum, Porcelain, Midnight Ink, Salt Marsh).

Beyond B+: live table preview in the picker (10), tabular numerals, spacing pass to the 4-scale, focus-visible audit across all controls, a code-review QA checklist (below).

Would NOT touch: Geist + Charter pairing, 64px row height (documented descender-clipping reason), token names, responsive column tiers, the tooltip system, Bible/YouTube type icons' shape.

## 5. Ten colour palettes

All satisfy `row-hover` vs `surface-alt` distinct. Contrast computed with the WCAG relative-luminance formula. Contrast columns: text on background / text on row-hover. Distinctness: hover vs zebra is 1.12 to 1.19 in light, 1.27 to 1.40 in dark (deliberately subtle for calm; the 3px selected bar and border carry the rest).

| # | Name / intent | Mode | background | surface | surface-alt | row-hover | border | text | text-muted | primary | primary-fg | accent | success | warning | danger | info | text/bg | text/hover |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Reading Room** — current navy identity, made themeable | light | #ffffff | #ffffff | #f7fafc | #e3ebf5 | #d4d4d4 | #171717 | #525252 | #1a365d | #ffffff | #2b6cb0 | #2f7a4a | #8a5a00 | #b3261e | #2b6cb0 | 17.9 | 14.9 |
| 2 | **Vellum** — warm paper, calmest daytime default | light | #fbf8f3 | #ffffff | #f4efe6 | #e6dcc8 | #ddd2bd | #2b2620 | #5f564a | #6b4e2a | #ffffff | #a0652a | #3f7d4e | #8a5a00 | #a8351f | #3a6a8f | 14.2 | 11.0 |
| 3 | **Salt Marsh** — herbarium green, quiet and clear | light | #f6f9f7 | #ffffff | #eef3ef | #d9e7de | #cfdcd3 | #1f2a24 | #52625a | #2f4a3a | #ffffff | #5c7f5f | #2f7a4a | #8a5a00 | #a8351f | #2f6a86 | 14.0 | 11.6 |
| 4 | **Porcelain** — neutral cool grey, max clarity | light | #fafafa | #ffffff | #f2f2f3 | #e1e6f0 | #d9d9de | #18181b | #52525b | #27324a | #ffffff | #4f5fa8 | #2f7a4a | #8a5a00 | #b3261e | #2b6cb0 | 17.0 | 14.2 |
| 5 | **Dusk Rose** — soft blush, gentle and human | light | #fbf7f6 | #ffffff | #f4ece9 | #ecd9d4 | #e2cfc9 | #2e2422 | #66574f | #7a3b45 | #ffffff | #b0566a | #3f7d4e | #8a5a00 | #a8351f | #3a6a8f | 14.2 | 11.1 |
| 6 | **Slate Light** — bolder cool blue-grey, techy | light | #f8fafc | #ffffff | #f1f5f9 | #dbe6f3 | #cbd5e1 | #0f172a | #475569 | #1d4ed8 | #ffffff | #0e7490 | #15803d | #a16207 | #b91c1c | #0369a1 | 17.1 | 14.1 |
| 7 | **Midnight Ink** — late-night navy | dark | #141a2b | #1a2136 | #1a2136 | #2a3556 | #2f3a5c | #e8ebf4 | #a3abc4 | #8fb0f0 | #0b1020 | #b79cf0 | #5bc08a | #e0b15a | #f08a80 | #7cb7ec | 14.5 | 10.1 |
| 8 | **Charcoal Sage** — dark neutral with green calm | dark | #1b1f1c | #222724 | #222724 | #33403a | #3a4540 | #e7ece8 | #a0aca4 | #8fc4a0 | #0e1a13 | #c9b872 | #6bc48c | #e0b15a | #ef8a80 | #7cb7d6 | 13.9 | 9.1 |
| 9 | **Warm Umber** — dark sepia, reading-lamp feel | dark | #211c17 | #282219 | #282219 | #3d3325 | #4a3f30 | #efe7db | #b3a691 | #d9b276 | #1e1508 | #d98a5f | #79c08a | #e3b45c | #ef8a80 | #82b4d6 | 13.8 | 10.1 |
| 10 | **Deep Sea** — bold dark teal-blue | dark | #0f1b24 | #142430 | #142430 | #1f3d52 | #274a60 | #e3eef5 | #9db5c4 | #6cc4e0 | #06202b | #f2a65a | #5bc08a | #e6b458 | #f28b82 | #7cb7ec | 14.8 | 9.6 |

Notes: `surface-alt` in dark palettes equals `surface` because zebra sits one step above background. Status and primary hues in dark palettes were chosen light enough for 4.5:1 on their backgrounds by inspection (I computed only text/background and text/hover programmatically; status/primary pairs are not individually computed, so verify with a contrast tool before shipping). Muted text on background was likewise not computed; muted values were chosen to sit around 5:1 to 7:1 and should be verified.

Priority weighting: 1-5 are calm and clear light options (conservative to warm), 2, 3 and 4 are the recommended defaults; 6 and 10 are the bolder options; 7-9 are the dark set.

## 6. Self-report

Applied from Refined: "prefer semantic tokens over raw values" (findings 2, table mapping), "keep interaction states explicit" (section 3 states table), "avoid low contrast text" (contrast figures), "avoid inconsistent spacing rhythm" (finding 8, 4-based scale), "avoid ambiguous labels" (finding 4), "flag conflicts between aesthetics and accessibility, prioritise accessibility" (hover distinctness vs calm: I chose subtle fill plus non-colour selected bar and focus ring). Applied its authoring workflow: intent sentence, tokens first, component states, testable acceptance criteria, anti-patterns, migration notes. QA checklist (code review): every AG Grid param is a token; hover != zebra in each theme; selected has non-colour cue; focus-visible ring on rows/controls; text at least 4.5:1 on all four row states; single missing-data glyph; spacing on 4-scale; no raw hex in components.

Not helped by the system: its Playfair Display / `#3B82F6` foundations conflict with Geist + Charter and the navy identity, so ignored; it gives no guidance on dark mode, data-table density, zebra/hover interplay, or palette generation. Row hover was not observable in any screenshot; the hover analysis is inferred from `ActivityTable.svelte`.
