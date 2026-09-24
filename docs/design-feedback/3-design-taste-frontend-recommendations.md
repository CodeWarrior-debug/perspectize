# 3 - design-taste-frontend recommendations

Skill invoked via the Skill tool (loaded successfully from the project install). Caveat: the skill's section 13 declares dashboards, dense product UI and data tables OUT OF SCOPE. I applied only its transferable parts: brief inference, dial reading, color calibration and locks, dark-mode protocol, button/form contrast checks, redesign audit-first protocol, and the pre-flight matrix. Landing-page rules (hero, eyebrows, bento, marquee) do not apply and are not used.

**Design Read:** Reading this as: authenticated data-table product app for repeat power users, with a calm/clear/editorial-lite language (owner priorities: Clear, Calming, Beautiful, Interesting), leaning toward native CSS tokens + AG Grid theme params + existing Geist/Charter.
**Dials:** DESIGN_VARIANCE 3 (predictable, trust-first), MOTION_INTENSITY 2 (feedback only: hover/active), VISUAL_DENSITY 6 (data table, keep). Mode: **Redesign - Preserve** (IA, nav labels, type pairing stay).

Evidence seen: screenshots 01 (Activity, no filter) and 09 (theme picker) viewed directly; other screenshots not opened. Source read: `ActivityTable.svelte` lines 444-466 (AG Grid theme params), `app.css` token blocks (root, plus sepia/green presets). No row-hover screenshot exists: hover behaviour below is **inferred from CSS**, not seen.

## 1. Verdict: C

Audit (section 11.B). Brand tokens: navy `#1a365d` primary, Geist + Charter, white/near-white neutrals, `#dc2626`-family status colours. Patterns to preserve: token names, type pairing, IA, tooltips. Patterns to retire: hardcoded AG Grid colours, heavy navy header band on the grid plus a second navy nav band, navy pill toggles and a navy chat FAB all competing (screenshot 01), saturated orange-red play icons repeated on every YouTube row.

The bones are sound (real token system, sensible type). Two things hold it back under this system: (a) the **Color Consistency Lock is broken in the grid**: `ActivityTable.svelte` hardcodes `#1a365d`, `#f7fafc`, `#d4d4d4`, `#171717`, `#ffffff` so the table ignores the picker (screenshot 09 presets exist, grid stays navy/white); (b) accent overuse, since navy appears as nav band, table header, toggle, chip and FAB, leaving no single focal accent. Density itself is fine for the use case. I would rate it C, and I agree with the owner's C- as within a half-step.

## 2. Findings ranked by priority

### Clear
1. **Hover equals zebra (top complaint).** `oddRowBackgroundColor: '#f7fafc'` vs `rowHoverColor: 'rgba(26,54,93,0.06)'` over white composes to about `#f0f3f7`. Both are pale blue-greys about 1.1:1 apart, and hover on an odd row (already `#f7fafc`, plus a 6% wash) is almost the same as rest. No feedback. Where: `ActivityTable.svelte:450-451`. Fix in section 3.
2. **Grid ignores theme.** Hex literals in `themeQuartz.withParams` instead of `var(--color-*)`. Same file, 444-457. Under the Color Consistency Lock this is the biggest single failure.
3. **Placeholder cells look like data.** Rows show `—` and `--` (two different glyphs for "empty") in Length/Views/Likes/Date (screenshot 01). Pick one muted `-` glyph in `text-muted`. Not just style: two glyphs read as two meanings. Note the skill bans em-dash as a design element; use a hyphen.
4. **Header text on navy at 600 weight plus filter icons and separators on every column** is noisy. Ok for function, but muted filter icons until hover would clarify.

### Calming
5. **Four heavy navy masses** (nav, grid header, active toggles, FAB; screenshot 01). Confirms prior review. Fix: keep nav navy, make grid header a tinted surface (`surface-alt` + 1px bottom border + `text` colour, weight 600) so the grid stops competing with the nav.
6. **Double frame.** Grid has an outer rounded border plus inner row lines plus a cut-off last row inside a card-like panel (screenshot 01, rows clip at the bottom). "Cards only when elevation communicates hierarchy": drop the outer rounded border, use `divide-y` hairlines only.
7. **Status colours for everyday data.** Saturated orange-red play glyph on every video row. Use `text-muted` for type icons; reserve colour for rating and errors.
8. **Zebra plus row lines is double striping.** Pick one. Recommendation: keep hairlines, make zebra very faint or off, and let hover carry the emphasis.

### Beautiful
9. **Charter for row titles at 13px** (screenshot 01) reads well; keep. Do not change the Geist + Charter pairing (skill discourages serif as default, but the brand already justified it as reading text; no override needed).
10. **Palette family.** Preset "Archive" (sepia) sits on the AI-default warm cream family (`#fdf5ec` bg, `#7c5a2e` brown accent). The skill's premium palette ban targets premium-consumer briefs, not this app, so I flag it only as low priority: offer it as one option, not the default.
11. **Shape lock.** Rounded buttons, rounded nav pill, square-ish grid corners. Choose one radius scale (suggest 8px everywhere interactive, 0 for table cells).

### Interesting
12. One accent only. After fixing 5 and 7, the primary accent becomes a real focal point (active tab, primary button, hover bar). Interest comes from restraint plus one confident accent, not from more colour. No motion is added beyond a 120ms background transition on rows.

## 3. Activity table hover/zebra fix

Principle: hover = hue-tinted wash from `--color-primary` mixed into surface **plus** a 3px inset left bar in primary. The bar makes hover unmistakable regardless of how close the wash is to the zebra, and it is theme-driven.

Concrete suggestion (AG Grid v32 themeQuartz params, using CSS variables; Quartz accepts `var()` strings in params):

```ts
const theme = themeQuartz.withParams({
  backgroundColor: 'var(--color-card)',
  foregroundColor: 'var(--color-foreground)',
  borderColor: 'var(--color-border)',
  oddRowBackgroundColor: 'color-mix(in srgb, var(--color-foreground) 2.5%, var(--color-card))', // faint zebra, neutral
  rowHoverColor: 'color-mix(in srgb, var(--color-primary) 11%, var(--color-card))',            // hue-tinted, clearly stronger
  selectedRowBackgroundColor: 'color-mix(in srgb, var(--color-primary) 18%, var(--color-card))',
  headerBackgroundColor: 'var(--color-muted)',
  headerTextColor: 'var(--color-foreground)',
  accentColor: 'var(--color-primary)',
});
```
```css
.ag-row-hover { box-shadow: inset 3px 0 0 var(--color-primary); }
.ag-row-selected { box-shadow: inset 3px 0 0 var(--color-primary); }
```

Rules of state stacking: zebra (2.5%) < hover (11%) < selected (18% plus bar) . Hover on a selected row keeps the selected fill and adds nothing else. Keyboard focus (currently `suppressCellFocus: true`, line 757) is an accessibility gap: give the row a 2px `--color-ring` outline on `:focus-visible` when focus is enabled. Dark mode: same formulas work because they derive from tokens; percentages rise (hover 14%, selected 22%) since tints read weaker on dark. Verified numerically for the 10 palettes below (text on hover >= 8.6:1). Note the wash alone is only about 1.1 to 1.6:1 against zebra by luminance (by hue it is visibly distinct), which is exactly why the left bar is part of the recommendation rather than optional.

## 4. Path from C- to B+

1. Wire the AG Grid theme params to CSS variables (section 3). Fixes complaints 1 and 2 in one change.
2. Left-bar hover/selected treatment plus quieter zebra.
3. Grid header from navy to `--color-muted` surface with foreground text; drop outer rounded frame.
4. Mute type icons and placeholder glyphs (one `-`, muted).
5. Lock radius scale (8px interactive) and one accent usage (primary only for active/primary actions).
6. Ship 3 to 4 of the palettes below to the picker, default to "Reading Room" (already close to the current default) or "Fog".

That set is B+ territory: clear feedback, one accent, theme-obedient table.
**Beyond B+:** sticky first column shadow, skeleton loaders shaped like rows, designed empty state, column-header filter icons revealed on hover, tabular-nums for numeric columns.
**Do not touch:** Geist + Charter pairing, token names, IA/nav labels (Activity/Discover/Compare), column set, row height 64 (documented descender fix), tooltip/popover behaviour, the theme picker's structure.

## 5. Ten palettes

Shared tokens: text-on-background and text-on-row-hover contrast computed with the WCAG formula. `surface-alt` = zebra. All `row-hover` values are hue-tinted and distinct from `surface-alt`; pair with the left bar (section 3). `primary-foreground` on `primary` >= 4.5:1 in all.

| # | Name | Intent | background | surface | surface-alt | row-hover | border | text | text-muted | primary | primary-fg | accent | success | warning | danger | info | text/bg | text/hover |
|---|------|--------|-----------|---------|-------------|-----------|--------|------|-----------|---------|-----------|--------|---------|---------|--------|------|---------|-----------|
| 1 | Reading Room (light) | Current navy, quieter: warm paper, one navy accent | #fbfaf7 | #ffffff | #f4f2ed | #e3e9f2 | #dcd9d1 | #171717 | #5b5b5b | #1a365d | #ffffff | #2c5282 | #2f7d4f | #9a6a08 | #b42318 | #2b6cb0 | 17.2 | 14.7 |
| 2 | Fog (light) | Cool neutral, most calming and clearest | #f6f7f8 | #ffffff | #eef0f2 | #dfe8ec | #d5d9dd | #1c2024 | #565d64 | #2f5d73 | #ffffff | #3b7a8c | #2f7d4f | #9a6a08 | #b42318 | #2b6cb0 | 15.3 | 13.2 |
| 3 | Sage Paper (light) | Herbarium quiet, green accent | #f7f9f6 | #ffffff | #eff3ee | #dbe8dc | #d3dcd3 | #1d2a22 | #56645a | #2f4a3a | #ffffff | #4d7a5e | #2f7d4f | #9a6a08 | #b42318 | #2b6cb0 | 14.1 | 11.8 |
| 4 | Slate Cobalt (light) | Bolder: one saturated blue on cold neutral | #f8f9fb | #ffffff | #f0f2f6 | #dce6fb | #d8dce4 | #14181f | #545c6b | #2751d9 | #ffffff | #1d4ed8 | #2f7d4f | #9a6a08 | #b42318 | #2b6cb0 | 16.9 | 14.2 |
| 5 | Clay Slate (light) | Bolder: warm rust on cool grey, no brass | #f7f6f5 | #ffffff | #efedeb | #f1e0d7 | #dedad6 | #211d1b | #625a55 | #a8432a | #ffffff | #3f4b5c | #2f7d4f | #9a6a08 | #b42318 | #2b6cb0 | 15.5 | 13.0 |
| 6 | Lavender Mist (light) | Soft violet, executed with intent, low saturation | #f8f7fb | #ffffff | #f0eef6 | #e2ddf3 | #dcd8e8 | #1e1b2b | #5d5870 | #5b46b0 | #ffffff | #7a68c4 | #2f7d4f | #9a6a08 | #b42318 | #2b6cb0 | 15.8 | 12.7 |
| 7 | Midnight (dark) | Late-night reading, blue-black | #12151c | #181c25 | #1e232e | #2b3550 | #2c3340 | #e6e9ef | #9aa3b2 | #7fa2e6 | #0e1320 | #a3bdf0 | #4ec38a | #e0b04a | #f0796b | #6cb0f0 | 15.0 | 10.0 |
| 8 | Graphite (dark) | Neutral off-black, no hue fight | #141414 | #1a1a1a | #212121 | #333a45 | #333333 | #e8e8e8 | #a0a0a0 | #8db4ff | #0d1526 | #b7c9f5 | #4ec38a | #e0b04a | #f0796b | #6cb0f0 | 15.0 | 9.4 |
| 9 | Forest Night (dark) | Herbarium at night, green accent | #101613 | #151d18 | #1b2520 | #274235 | #26332c | #e4ebe6 | #98a89e | #7cc79a | #0c1a12 | #a6dbb9 | #4ec38a | #e0b04a | #f0796b | #6cb0f0 | 15.1 | 9.0 |
| 10 | Ink Cobalt (dark) | Bolder dark: deep navy with a vivid blue hover | #0f1420 | #151b2a | #1b2235 | #22407a | #263049 | #e8edf7 | #98a4bd | #6f9bff | #0a1226 | #9db8ff | #4ec38a | #e0b04a | #f0796b | #6cb0f0 | 15.7 | 8.6 |

Notes: contrast for text/bg and text/row-hover computed programmatically (rounded to 0.1). Muted text was chosen to stay near or above 4.5:1 on `background`, but I did not compute every muted/hover pair; verify before shipping. Status colours were picked as desaturated (< 80% saturation) variants, not verified against every surface. Hover vs zebra luminance contrast is 1.1 to 1.6:1 by design; distinction relies on hue tint plus the left bar. For dark palettes, hover is intentionally stronger than the zebra step (Ink Cobalt is the boldest). Weighting: 1-3 and 7-9 are the clear/calming set; 4, 5, 6, 10 are the bolder set. Palette 5 avoids the banned beige/brass/oxblood family by design.

## 6. Self-report

**Applied:** Brief inference one-liner (0.B), explicit dials, redesign-preserve audit (11.B/11.C/11.D lever order: colour recalibration first, typography untouched), Color Consistency Lock (grid must follow tokens), Shape Consistency Lock (single radius), Page Theme Lock (one theme at a time, dark handled by token swap), Dark Mode Protocol (both modes, no pure black/white), button/form contrast intent, single accent rule, no em-dashes in this document (pre-flight 9.G). Cards-only-for-hierarchy (4.4) informed the frame removal. Serif discipline checked: Charter is retained on brand-justification grounds.

**Not applicable or not helpful (skill limits):** Section 13 puts data tables and dashboards out of scope, so hero/eyebrow/bento/marquee/zigzag/logo-wall/CTA-wrap rules and the image-strategy section gave nothing. The skill has no guidance on row hover, zebra, selection or focus states, on AG Grid, or on Svelte (its stack default is React/Tailwind/Motion), so section 3 is my own reasoning, not a skill rule. The skill discourages Inter/serif defaults but says nothing about Geist+Charter beyond "Geist is preferred". Pre-flight boxes not ticked because they are page-build checks with nothing to verify here: hero, eyebrow count, motion, marquee, images, viewport units. Screenshots viewed: 01 and 09 only; findings on other screens (Discover, Compare, Messages, dialogs) are not made.
