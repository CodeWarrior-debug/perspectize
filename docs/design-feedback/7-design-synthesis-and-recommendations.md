# 7 - Design synthesis and recommendations

Independent synthesis of the six design-tool reviews (files 1-6) against the brief (file 0) and the orchestrator's `metrics.md`. Analysis only: nothing under `frontend/` or `backend/` was changed.

**What I checked myself, not taken from the reviews:**
- Source: `frontend/src/lib/components/ActivityTable.svelte` (grid theme at lines 444-466, `suppressCellFocus` at 757), `frontend/src/app.css` (tokens, preset blocks, `.ag-cell` font rule at 262-270), `frontend/src/lib/theme/derive.ts` and `presets.ts` (how preset and custom-theme tokens are generated), `frontend/src/lib/utils/formatting.ts` (placeholder glyphs, type icon), `Header.svelte`, `frontend/docs/DESIGN_SPEC.md`, and the AG Grid 32.3.9 Quartz CSS in `node_modules/@ag-grid-community/theming` (how hover, zebra and selection are actually painted).
- Screenshots 01, 09, 10 and 17.
- Every palette in all six files (60 palettes), run through a WCAG luminance script plus an OKLab ΔE check for hover against zebra.

Like the six reviewers, I did not see a live hover state. Everything I say about hover comes from the CSS and the AG Grid stylesheet.

---

## 1. Scorecard

Scores are out of 5. "Palette quality" covers the checks I ran: whether the reviewer's own contrast claims hold up, whether muted text on the hover colour stays at 4.5:1 or better, and how far apart hover and zebra really are perceptually.

| Rank | Tool | Grade given | Usefulness | Specificity | Hover/zebra coverage | Palette quality | Analysis-only | Tokens | Time | Screens opened |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **impeccable** | C+ | 5 | 4 | 5 | 4 | Yes | 110,162 | 117.2 s | 4 (01, 09, 10, 17) |
| 2 | **frontend-design** | C | 4.5 | 4 | 4 | 4.5 | Yes | 83,304 | 75.2 s | 2 |
| 3 | awesome / refined | C | 3.5 | 3.5 | 4 | 4.5 | Yes | 82,687 | 81.5 s | 2 |
| 4 | awesome / clean | C+ | 3.5 | 4 | 4 | 3 | Yes | 102,403 | 84.9 s | 2 |
| 5 | awesome / minimal | C+ | 3 | 3.5 | 4 | 3.5 | Yes | 89,002 | 83.1 s | 2 |
| 6 | design-taste-frontend | C | 2.5 | 3 | 3.5 | 3 | Yes | 114,519 | 91.7 s | 2 (01, 09) |

All six wrote only their own file and included no URLs. I confirmed this with `git status` and a grep. All six gave the current UI a C or C+, half a step to a step kinder than the owner's C-. None of them disagreed with the owner in substance.

### Contrast arithmetic: checked, and it holds up
- **Current hover.** The owner's diagnosis is right. The zebra stripe `#f7fafc` is ΔE 0.017 from white. Hover on an even row is `rgba(26,54,93,.06)` over white, which gives `#f1f3f5`. That is only ΔE 0.020 (contrast 1.06:1) from the zebra, so a hovered white row looks like a striped row. Hover on an odd row gives `#eaeef2`, ΔE 0.036 (1.11:1). The unused "selected" colour is only 1.04:1 away from hover. Every reviewer's estimate of the composited colours and ratios (roughly 1.05-1.1:1) is correct within rounding. Impeccable's odd-row composite of `#edf0f4` is slightly off; the true value is `#eaeef2`.
- **Palette claims.** For all 60 palettes, every stated text-on-background and text-on-hover ratio matched my calculation within ±0.05. The ranges each tool gave for hover against zebra (impeccable 1.10-1.54, refined 1.12-1.19 light and 1.27-1.40 dark, minimal about 1.2 light and 1.4-1.6 dark, taste 1.1-1.6) are all accurate. Clean's stated 1.1-1.4 misses its own Paper palette, which is 1.02.
- **What nobody computed: muted text on hover.** Muted text sits on hovered rows (the "John 3:16" subtitles and the placeholder dashes), and 8 of the 60 palettes fail 4.5:1 there:
  - impeccable: Midnight 4.17, Slate Dark 4.36, Terminal 4.20
  - taste: Graphite 4.38, Forest Night 4.40, Ink Cobalt 4.02
  - minimal: Midnight Lift 4.09
  - clean: Graphite 4.47

  All failures are dark palettes. Frontend-design and refined had none.
- **The orchestrator's "0 collisions" check was only a string-inequality test.** Measured perceptually, some proposed light palettes separate hover from zebra no better than today's odd-row hover (ΔE 0.036): clean Paper 0.029 (luminance 1.02), taste Fog 0.030, clean Sage 0.032 and Mist 0.033, frontend-design Harbour Mist 0.035, taste Clay Slate 0.035 and Reading Room 0.036. They depend entirely on a hue shift plus the left bar. For future bake-offs, use a perceptual floor. The heuristic I used for the shortlist is ΔE_OK ≥ 0.045 on light themes and ≥ 0.07 on dark, roughly three times the current zebra step.

### Per-tool assessment

**1. impeccable: best feedback out of the box.** It gave the most complete answer on every deliverable:
- The clearest state model: rest, then stripe, then hover, then selected.
- It is the only reviewer to explain why the rgba hover fails: it composites differently on odd and even rows, so opaque hover colours are the fix.
- It says to drop `columnHoverColor`.
- It covers dark mode by lightening rather than inverting.
- It is the only one to give a testing plan that follows this repo's testing principles: a pure function mapping theme tokens to grid params, plus a Browser Mode check.
- It found the navy "Add to Library" buttons (screenshot 17; I confirmed them).
- Its palettes span the widest range, from Saffron to Dusk Plum.

Weaknesses:
- One factual error: it says the numeric columns are "Geist regular with no tabular figures". They are Charter, because `app.css:262-265` sets every `.ag-cell` to Charter.
- It says screenshots 09 and 10 "show a Midnight/Archive picker while the grid stays navy". Both screenshots show Reading Room active, so the claim is correct from the code but not shown in any screenshot.
- Three dark palettes fail muted-on-hover.
- It was the slowest run.

Self-reported caveat (metrics.md): it skipped the detector run, the browser pass and the full 10-heuristic table, and ran as a single context. That means a degraded run still came first.

**2. frontend-design: best value.** It was the cheapest and fastest run with the shortest file, and it found **the single most valuable defect nobody else caught**: every non-default preset sets `--color-muted-foreground` to `#171717` or `#ffffff`, so the app has no muted text level outside Reading Room. I confirmed the root cause in `derive.ts:180`, `mutedForeground: pickForeground(muted)`. It also flagged the clipped last column ("Tags") and the half row with no scroll hint, which I confirmed in screenshot 01. It suggested one typographic moment (Charter page titles) and rejected its own first idea, cream plus terracotta, as a cliché.

Weaknesses:
- It places the placeholder fix "in the cell renderers in ActivityTable.svelte". The glyphs actually live in `formatting.ts`.
- Its suggestion of 48 px rows for rows without thumbnails fights the documented 64 px descender fix.
- Muted contrast was "picked by eye", although every value does pass on my check.

No caveats beyond "hover inferred".

**3. refined: most testable.** Its standout contribution is testable acceptance criteria:
1. Computed hover differs from computed zebra on both odd and even rows in every theme.
2. Switching theme recolours the grid without a reload.
3. The focus ring is at least 3:1.

It also gives a QA checklist. Its Reading Room palette keeps today's `#ffffff` and `#f7fafc`, which makes it the smallest migration. All of its palettes pass. It was the cheapest run in tokens.

Weaknesses:
- It treats the selected-row state as a current defect. `ActivityTable.svelte` sets no `rowSelection`, so `selectedRowBackgroundColor` is unused config.
- Its spacing advice is generic, from the typeui.sh template.

**4. clean: two good unique catches, weakest palettes.**
- It noticed that `--color-ring` in Midnight and Terminal equals the near-black primary, so the focus ring is invisible. I confirmed it: `#0d1b33` on `#0d1421` is 1.07:1.
- It is the only tool to rule out the design system's own `#3B82F6` on contrast grounds (3.68:1; my check agrees).
- It covers touch devices, which have no hover, so the selected state must stand on its own.
- It suggests pointer cursors only where a click does something, and a sort-count badge.

Weaknesses:
- Its Paper palette has the weakest hover-to-zebra separation in the whole corpus.
- It recommends uppercase header labels, which contradicts three other tools.
- It suggests moving the 13 px title to 14 px, which risks the descender-clipping gotcha. It does flag that this needs verifying.

**5. minimal: sound but generic.**
- Its state table is clear.
- It makes the most honest argument for removing zebra entirely: zebra, row rules and the outer border encode the row boundary three times.
- It is careful about darkening status colours for text use.
- Its light palettes have the strongest hover-to-zebra separation in the corpus (ΔE 0.054-0.071).

Weaknesses:
- Minimal Paper and Graphite set the primary to the text colour, so primary actions stop reading as distinct.
- Midnight Lift fails muted-on-hover.
- Like refined, it treats the unused selected state as a present defect.

**6. design-taste-frontend: weakest fit.** It said itself that data tables are out of scope (its section 13), so its hover fix is the agent's own reasoning rather than skill guidance. It was the most expensive run and opened only 2 screenshots. Some of its skill's rules leaked into product advice:
- It recommends a hyphen as the placeholder because the skill bans em dashes, even though a hyphen reads as a minus sign in numeric columns.
- It flags Archive as "AI-default warm cream".

Three of its dark palettes fail muted-on-hover. Its one strong contribution is the idea most worth keeping from any tool: **derive row colours with `color-mix()` from existing tokens.** Custom themes then get correct hover and zebra colours without anyone writing new per-theme values. It also flagged `suppressCellFocus: true` as a keyboard gap.

Self-reported caveat: only screenshots 01 and 09 were opened, and hover was inferred from CSS.

**Ranking verdict.** impeccable gave the best out-of-the-box feedback: the deepest, most actionable and most consistent with this repo's rules. frontend-design gave the most value per token and the most important unique finding. Places 3 to 5 are close. The three awesome-design-skills templates share nearly the same rule text ("prefer semantic tokens over raw values", "keep interaction states explicit", the 4/8 scale), so their outputs are correlated. Treat them as one vote with three phrasings, not three independent votes.

---

## 2. Patterns and commonalities

**Independence caveat.** All six ran on the same model, with the same brief, pointed at the same lines of source. The brief also quoted the prior review ("four heavy navy bands", "borders around borders", "saturated alert colours"). Some agreement is therefore an echo of the brief rather than independent discovery. The findings that were not in the brief are the stronger signal (marked ★ below).

### Raised by 3 or more tools (strongest signal)
| Finding | Tools | Verified? |
|---|---|---|
| Hover is nearly the same as zebra (the top complaint) | all 6 | Yes: ΔE 0.020 on even rows |
| Grid colours are hard-coded hex values in `themeQuartz.withParams`, so the grid ignores the theme picker ★ | all 6 | Yes, `ActivityTable.svelte:447-457` |
| Fix: pass `var(--color-*)` into `withParams` and add row tokens | all 6 | AG Grid emits params as CSS custom properties, so `var()` strings work |
| Non-colour hover cue: an inset left bar in the primary colour (2-3 px) | all 6 | Needs an implementation fix; see §4 |
| Grid header should be a tonal band, not navy; keep navy for the app bar only | all 6 | Yes, `headerBackgroundColor: '#1a365d'` |
| Borders around borders: drop the outer grid frame and keep hairlines | all 6 | Yes, and DESIGN_SPEC decision 2 *requires* the card border |
| Mute the orange-red YouTube play icon | all 6 | Yes: hard-coded `fill '#FF0000'` at `formatting.ts:333` ★ |
| Mixed placeholder glyphs (`—` and `--`) ★ | all 6 | Yes: `formatting.ts` uses `—` at lines 5, 21, 37, 94, 137, 186, 207, 209 and `--` at 151, 162, 219, 227, 235 |
| Keep Geist + Charter, 64 px rows, tooltips and the responsive tiers | 5-6 | Agreed |
| Filter icons on every header are noisy; show them on hover or when a filter is active | impeccable, frontend-design, taste, (clean) | Yes, screenshot 01 |
| Dark themes: hover gets *lighter* and mixes in more primary | impeccable, taste, refined, minimal, clean | Agreed |
| Theme swatches should preview zebra and hover | impeccable, frontend-design, refined | Yes: the light-theme swatch dots are nearly identical (screenshot 09) |
| Tabular figures on numeric columns | impeccable, refined, taste | Valid, but see the Charter caveat in §3 |
| Solid navy on secondary selected states ("All Content", "Loaded 100 Items") ★ | impeccable, clean, minimal, refined | Yes, screenshot 01 |
| Hover transition of about 120 ms, respecting reduced motion | impeccable, taste, refined, minimal, clean | Optional polish |

### Raised by exactly one tool
| Finding | Tool | Judgement |
|---|---|---|
| Preset `muted-foreground` is flattened to `#171717` / `#ffffff` | frontend-design | **Real, high value.** Root cause is `derive.ts:180`. |
| `--color-ring` is invisible in dark presets | clean | **Real.** Root cause is `derive.ts:188` (`ring: base.primary`). |
| Clipped last column and half row with no scroll hint | frontend-design | Real, screenshot 01. Medium value. |
| Testable acceptance criteria and a QA checklist | refined | Valuable process. Adopt it. |
| Build row colours with `color-mix()` so custom themes work automatically | taste | Valuable. It is the key to custom themes. |
| Testing plan: pure token-to-params function plus a Browser Mode check | impeccable | Valuable, and it follows the repo's testing rules. |
| Touch devices have no hover | clean | Real, and minor, because under 860 px the grid becomes a card list. |
| "Add to Library" buttons are all solid navy | impeccable | Real, screenshot 17. Low priority. |
| Charter page title at about 30 px | frontend-design | A nice "Beautiful" item after B+. |
| Sort-count badge on "Edit sorts" | clean | A reasonable clarity add after B+. |
| Toolbar control heights are mixed (36 vs 28 px) | refined | Plausible from screenshot 01. Low priority. |
| 48 px rows for non-thumbnail rows | frontend-design | **Noise.** Mixed row heights break the rhythm and the descender gotcha. |
| Hyphen placeholder | taste | **Noise.** The skill's em-dash ban leaking into product advice. |
| Archive is "AI-default cream" | taste | **Noise** for this product. |

### Contradictions, with my judgement
1. **Keep zebra or drop it?** impeccable, frontend-design and refined keep a faint zebra. minimal prefers dropping it, and taste and clean call it optional. **Judgement: keep a very faint neutral zebra** (alt against background of about 1.07 luminance), because the table is 10 or more columns wide. Hover then becomes a tinted fill plus the bar. Make it a single token so the owner can compare with and without it.
2. **Header label colour and case.** Suggestions were muted text (impeccable, frontend-design, clean), foreground text (taste, refined), and uppercase at 12 px (clean) against "no caps" (impeccable, minimal, frontend-design). **Judgement:** use foreground text at weight 600, sentence case, on `--color-muted`. The preset `muted-foreground` is broken today, and caps add noise.
3. **Placeholder glyph.** Options were em dash (impeccable, refined, minimal), en dash (frontend-design, clean), hyphen (taste), or blank for fields that don't apply (impeccable, frontend-design). **Judgement:** use a muted em dash, which is already the majority glyph in `formatting.ts`. Leave cells blank where the metric cannot exist, such as Views on a Bible passage.
4. **Mechanism.** Five tools add explicit per-theme row tokens; taste uses `color-mix()`. **Judgement: both.** See §4.
5. **Default background.** Warm paper `#fbfaf7` (impeccable, frontend-design, taste) or pure white (refined, minimal, clean)? **Judgement:** warm paper, which matches the preset's own description, "Navy on warm paper-white". The shipped Reading Room is pure white.
6. **`suppressCellFocus`.** taste calls it a gap; clean says keep it and make the in-cell buttons focus-visible. **Judgement:** clean's option is the lower-risk path to B+. Enabling cell focus changes the grid's whole keyboard model and belongs after B+.
7. **Bar width.** 2 px (impeccable, minimal) or 3 px (frontend-design, taste, refined, clean)? **Use 3 px**; the rows are 64 px tall.
8. **Type size 13 → 14 px** (clean only): don't do it before B+. It risks the documented clipping bug.

### Factual errors and overclaims
- **impeccable:** "Numeric columns are Geist regular." False: every `.ag-cell` is Charter (`app.css:263`), and only the Type column is Geist. It also says screenshots show the grid ignoring Midnight or Archive, but they show Reading Room.
- **frontend-design:** Says to fix the placeholders "in the cell renderers in ActivityTable.svelte". The formatters are in `frontend/src/lib/utils/formatting.ts`.
- **refined and minimal:** Present the selected state as a defect users hit today. The grid has no `rowSelection`, so selected rows cannot occur. minimal's "keyboard users cannot tell selected from hovered" also ignores `suppressCellFocus: true`.
- **All six** missed where the tokens actually come from. `frontend/src/lib/theme/derive.ts` generates both the preset CSS and the live custom themes. Adding row tokens only to the `app.css` blocks would leave custom themes without them.
- **None read `DESIGN_SPEC.md`.** Only impeccable admitted it. The spec *encodes the bug*: "Alternating rows `rgba(26,54,93,0.03)`" against "Row hover `rgba(26,54,93,0.06)`" (DESIGN_SPEC lines 257-258). It also *prescribes* the navy table header and the bordered card (decisions 2-3), and lists `#f7fafc` as `accent`, "Hover highlights" (line 90), the same colour the code uses as the zebra. **The spec must change alongside the code**, or the next design pass will reintroduce these problems.
- **Nobody noticed** that the Midnight and Terminal *primary* colour itself is near-invisible against the background (1.07:1 and 1.36:1). Their navy/green app bar (`Header.svelte:23`, `bg-primary`) and primary buttons blend into the page.

---

## 3. Consolidated recommendations, ranked by the owner's priorities

Tool key: **I** impeccable, **F** frontend-design, **T** taste, **R** refined, **M** minimal, **C** clean, **S** this synthesis only.

### Clear
1. **Fix hover vs zebra and make the grid follow the theme** (details in §4). *I F T R M C*
2. **Fix muted text in presets:** `derive.ts` should give `mutedForeground` a real mid-tone that passes 4.5:1 on background and on row-hover, instead of pure black or white. *F, S (root cause)*
3. **Fix the focus ring and primary in dark presets:** derive `ring`, and the primary used for chrome, so they reach at least 3:1 against the background. Today they are 1.07:1 in Midnight. *C, S*
4. **One muted placeholder glyph.** Use a muted em dash, and leave cells blank where the metric cannot apply. Change this in `formatting.ts`. *I F T R M C*
5. **Filter icons only on header hover, focus, or when a filter is active.** *I F T C*
6. **Hint that the table scrolls sideways:** a fade on the right edge. Consider pinning the Item column. *F*
7. **Make in-cell controls (`+`, category `+`, item link) show a 2 px `:focus-visible` ring.** Leave `suppressCellFocus` as it is for now. *C T R M*

### Calming
8. **Grid header: navy → a `--color-muted` band** with foreground labels at weight 600, sentence case, and a 1 px bottom border. Remove the vertical `|` dividers. Keep navy only on the app bar. *I F T R M C*
9. **Remove one frame:** drop the outer grid border or the rounded inner clip, and keep only the row hairlines. *I F T R M C*
10. **Tone down the Type icons:** change `#FF0000` (`formatting.ts:333`) and the navy Bible icon to `text-muted`. Keep saturated colour for real status. *I F T R M C*
11. **De-navy secondary selected states** ("All Content", "Loaded 100 Items") to a primary tint at 10-12% with primary-coloured text. Keep solid primary for one main action per view. *I C R M*
12. **Keep a faint neutral zebra** and let hover be the only tinted state. *I F R (M, C: or drop it)*

### Beautiful
13. **Theme swatches preview background, zebra, hover and primary.** A mini table strip is better still. *I F R*
14. **Aligned numerals in Length, Views, Likes and % Liked.** Caveat (S): these cells render in Charter, and whether the bundled Charter woff2 supports `tnum` is unverified. If it doesn't, set the numeric columns in Geist with `tabular-nums`. That also helps Clear. *I R T*
15. **One radius scale:** 8 px for containers and interactive elements, 0 for cells. *T C*
16. **Charter page titles** ("Activity", "Discover") as the one typographic highlight. *F*

### Interesting
17. **The 3 px inset primary bar on hover** as the product's small signature. It is functional and costs nothing. *I F T R M C*
18. **Theme picker order and set:** see §5. Offer one bolder light option (Saffron, Lavender) and one bolder dark option (Terminal Glow). *I T M C*
19. **Later:** a density toggle (64/56), skeleton rows, and a designed empty state. *I M C T*

---

## 4. The consolidated hover/zebra fix

### How AG Grid 32 Quartz actually paints these states
From the Quartz stylesheet in `node_modules/@ag-grid-community/theming`:
- The zebra is `.ag-row-odd { background-color: var(--ag-odd-row-background-color) }`.
- Hover is a separate **`::before` overlay**: `.ag-row-hover:not(.ag-full-width-row)::before { background-color: var(--ag-row-hover-color); position:absolute; inset:0 }`.
- Cells are absolutely positioned after the overlay, so their text stays on top.
- Hover on a selected row paints the hover colour with the selected colour layered over it.

What this means for the fix:
- **Use opaque hover colours.** An opaque overlay replaces the zebra completely, so hover looks the same on odd and even rows. The current 6% rgba lets the zebra show through.
- **Put the bar on the `::before`, not the row.** A `box-shadow: inset …` on `.ag-row-hover` itself, as five of the six tools suggest, paints *under* an opaque `::before`, so the bar would disappear. Frontend-design's "on the first cell" works, but moves if columns are reordered.
- **Hover on a selected row shows only the selected colour** unless you override it. Selection is not enabled today, so this can wait.

### Tokens: derive them, then allow hand-tuned overrides
1. Add three tokens in `derive.ts`, so presets *and* custom themes both get them. Also add them to `DerivedTokens` and `toCssVarMap`, regenerate the preset CSS, and add defaults to the `@theme` block in `app.css`.
   - `--color-row-alt`: the background moved 2-3% toward the foreground, neutral. *(T's formula: `color-mix(in oklab, var(--color-foreground) 2.5%, var(--color-background))`)*
   - `--color-row-hover`: primary mixed into the background, about 11% on light themes and about 20% on dark. Solve it in OKLCH so that ΔE_OK(hover, alt) ≥ 0.045 (light) or ≥ 0.07 (dark), text and muted on hover stay ≥ 4.5:1, and the result is **opaque**.
   - `--color-row-selected` (for later): primary at about 18% (light) or 28% (dark).

   `derive.ts` already imports `wcagContrast` and works in OKLCH, so it can *enforce* these thresholds instead of hoping. Hand-tuned presets (the §5 palettes) override the derived values.
2. Wire the grid to the tokens:
   ```ts
   themeQuartz.withParams({
     backgroundColor: 'var(--color-background)',
     foregroundColor: 'var(--color-foreground)',
     borderColor: 'var(--color-border)',
     oddRowBackgroundColor: 'var(--color-row-alt)',
     rowHoverColor: 'var(--color-row-hover)',          // opaque
     selectedRowBackgroundColor: 'var(--color-row-selected)',
     headerBackgroundColor: 'var(--color-muted)',
     headerTextColor: 'var(--color-foreground)',
     accentColor: 'var(--color-primary)',
     // remove columnHoverColor (second hover plane) and the white resize-handle rgba
   })
   ```
   `data-theme` and the custom-theme inline variables are both set on `<html>` (`store.svelte.ts:66-81`, `app.html:24-27`), so `var()` and `color-mix()` values resolve against the active theme.
3. The bar, drawn on the overlay:
   ```css
   .ag-row-hover:not(.ag-full-width-row)::before { box-shadow: inset 3px 0 0 var(--color-primary); }
   @media (prefers-reduced-motion: no-preference) { .ag-row::before { transition: background-color 120ms ease; } }
   ```
   In dark themes, use the lighter primary or ring colour for the bar so it reaches at least 3:1 against the hover colour.

### States
| State | Light (Reading Room) | Dark (Midnight Ink) | Cue |
|---|---|---|---|
| Rest | `#fbfaf7` | `#141a2b` | none |
| Zebra | `#f4f2ed` (neutral) | `#1a2136` | none |
| Hover | `#dce5f2` (navy-tinted, ΔE 0.050 from zebra, text 14.1:1, muted 6.2:1) | `#2a3556` (ΔE 0.086, text 10.1:1, muted 5.3:1) | plus a 3 px primary bar (9.6:1 / 5.5:1 against hover) |
| Selected (future) | `#c9d7ec` (1.15:1 from hover, text 12.3:1) | `#34426c` (1.23:1 from hover, text 8.2:1) | 3 px bar kept |
| Keyboard focus (in-cell controls) | 2 px `--color-ring` | 2 px lightened ring | never colour alone |

### Update the spec in the same change
Update `DESIGN_SPEC.md` lines 90 and 255-258 (accent labelled "Hover highlights", the card border, the navy header, and the 3% and 6% values), or the spec will contradict the code.

### Tests
This is a stateful component with four visual states: rest, zebra, hover and selected. Cover each one.
- Unit tests (jsdom-safe) on a pure `gridThemeParams(tokens)` function and on `deriveTheme` for every preset plus a few custom bases. Assert:
  - ΔE(hover, alt) is at or above the threshold
  - text/hover and muted/hover ≥ 4.5
  - bar/hover ≥ 3
  - hover ≠ alt
- One Vitest Browser Mode test that hovers an odd and an even row and asserts the computed `::before` background is identical on both and differs from the zebra, including after a theme switch. It must be run locally, because browser tests are not in CI.
- Use refined's acceptance criteria as the done-check.

---

## 5. Shortlist: 10 palettes plus 2 alternates

De-duplicated across the 60 proposals. Families that several tools proposed (navy reading room, sepia, herbarium green, cool mist, rose, lavender, midnight, graphite, terminal) are each represented once, by the best-verified version. "Adj." marks my changes. I checked every row with my own script.

**Token values**

| # | Name (mode) | Source | background | surface | surface-alt | row-hover | border | text | text-muted | primary | primary-fg | accent | success | warning | danger | info |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Reading Room, calmed** (light, default) | T #1, hover adj. from `#e3e9f2`; muted kept at the shipped `#525252` | #fbfaf7 | #ffffff | #f4f2ed | #dce5f2 | #dcd9d1 | #171717 | #525252 | #1a365d | #ffffff | #2c5282 | #2f7d4f | #9a6a08 | #b42318 | #2b6cb0 |
| 2 | **Mist** (light, clearest cool neutral) | I P4, hover adj. from `#d6e3f2` (same family as F Harbour Mist, T Fog, C Mist) | #f4f6f8 | #ffffff | #eaeef2 | #d2dff1 | #d3d9e0 | #1b2530 | #56626f | #3b5b8c | #ffffff | #d5e0ef | #3d7a58 | #96660f | #b04437 | #3a6b9e |
| 3 | **Vellum** (light, warm; Archive successor) | R #2 | #fbf8f3 | #ffffff | #f4efe6 | #e6dcc8 | #ddd2bd | #2b2620 | #5f564a | #6b4e2a | #ffffff | #a0652a | #3f7d4e | #8a5a00 | #a8351f | #3a6a8f |
| 4 | **Garden Quiet** (light, herbarium) | M #5, accent adj. to R Salt Marsh `#5c7f5f` | #f9fcfa | #ffffff | #eff5f0 | #d0e5d7 | #c9d6c1 | #1f2b23 | #4e5f55 | #2f4a3a | #ffffff | #5c7f5f | #15803d | #a65f00 | #a6421f | #2b5f8a |
| 5 | **Lavender Ledger** (light, bolder; echoes the logo purple) | F #4 | #f7f7fa | #ffffff | #eeeef4 | #dcdcf3 | #d5d5e2 | #22222e | #595870 | #4c3fa3 | #ffffff | #c2410c | #2f7d4f | #a35c00 | #b3261e | #2b5fb3 |
| 6 | **Linen Rose** (light, bolder, warm) | I P5 | #fbf6f4 | #ffffff | #f5ece8 | #f0d5cd | #e6d5d0 | #2a1d1f | #6a5559 | #8f3f4f | #ffffff | #ecd0d6 | #457a56 | #97640f | #a6342f | #446f96 |
| 7 | **Midnight Ink** (dark, default dark) | R #7 | #141a2b | #1a2136 | #1a2136 | #2a3556 | #2f3a5c | #e8ebf4 | #a3abc4 | #8fb0f0 | #0b1020 | #b79cf0 | #5bc08a | #e0b15a | #f08a80 | #7cb7ec |
| 8 | **Slate Dark** (dark, neutral) | I P8, muted adj. from `#9aa1ab` (it failed on hover) | #16181c | #1a1d22 | #1f2328 | #2e3b4d | #2f343c | #e8eaed | #a9b0ba | #7fb0e8 | #0f1720 | #2a3a52 | #66c08e | #e0b24f | #ec8a80 | #78b0e8 |
| 9 | **Terminal Glow** (dark, bold; keeps the Terminal identity) | M #9 | #090b0a | #101512 | #121915 | #1c3d2a | #233327 | #c9f5d9 | #8fb39e | #4ade80 | #052e16 | #86efac | #4ade80 | #facc15 | #ff6b6b | #67e8f9 |
| 10 | **Warm Umber** (dark, reading lamp) | R #9 (same family as F Lamp Oil) | #211c17 | #282219 | #282219 | #3d3325 | #4a3f30 | #efe7db | #b3a691 | #d9b276 | #1e1508 | #d98a5f | #79c08a | #e3b45c | #ef8a80 | #82b4d6 |
| A1 | **Porcelain** (light, pure neutral) | R #4, hover adj. from `#e1e6f0` (same family as F Plain Sheet, C Clean Slate) | #fafafa | #ffffff | #f2f2f3 | #dde3ef | #d9d9de | #18181b | #52525b | #27324a | #ffffff | #4f5fa8 | #2f7a4a | #8a5a00 | #b3261e | #2b6cb0 |
| A2 | **Saffron Paper** (light, most energetic) | I P6 (same family as C Sun) | #fffdf6 | #ffffff | #f7f2e2 | #fae5a1 | #e6dcc0 | #231f16 | #645b48 | #a34e08 | #ffffff | #f6dfa8 | #457a3d | #8a5f00 | #b03a2a | #3b6a99 |

**Verification** (WCAG ratios; ΔE is the OKLab distance between hover and zebra)

| # | text/bg | text/hover | muted/bg | muted/hover | primary-fg/primary | hover vs alt (lum) | ΔE hover-alt | status on bg (min) | status on hover (min) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 17.2 | 14.1 | 7.5 | 6.2 | 12.1 | 1.14 | 0.050 | 4.5 | 3.7 |
| 2 | 14.3 | 11.5 | 5.7 | 4.6 | 6.9 | 1.16 | 0.053 | 4.6 | 3.7 |
| 3 | 14.2 | 11.0 | 6.8 | 5.3 | 7.6 | 1.19 | 0.059 | 4.7 | 3.6 |
| 4 | 14.2 | 11.1 | 6.6 | 5.1 | 9.7 | 1.20 | 0.065 | 4.8 | 3.7 |
| 5 | 14.7 | 11.7 | 6.4 | 5.1 | 8.2 | 1.17 | 0.055 | 4.7 | 3.7 |
| 6 | 15.1 | 11.7 | 6.4 | 4.9 | 7.0 | 1.19 | 0.060 | 4.7 | 3.6 |
| 7 | 14.5 | 10.1 | 7.6 | 5.3 | 8.7 | 1.33 | 0.086 | 7.1 | 5.0 |
| 8 | 14.7 | 9.4 | 8.1 | 5.2 | 8.0 | 1.39 | 0.098 | 7.2 | 4.6 |
| 9 | 16.5 | 10.0 | 8.6 | 5.2 | 8.6 | 1.49 | 0.130 | 7.1 | 4.3 |
| 10 | 13.8 | 10.1 | 7.1 | 5.2 | 9.1 | 1.27 | 0.072 | 6.9 | 5.1 |
| A1 | 17.0 | 13.8 | 7.4 | 6.0 | 12.8 | 1.15 | 0.049 | 5.0 | 4.1 |
| A2 | 16.1 | 13.1 | 6.6 | 5.4 | 5.8 | 1.12 | 0.077 | 5.0 | 4.1 |

Results:
- Every palette clears 4.5:1 for text and for muted text on both background and hover.
- Every palette meets hover ≠ zebra at my perceptual floor (ΔE ≥ 0.045 light, ≥ 0.07 dark), which is well above today's 0.020.
- Status colours are text-safe (≥ 4.5) on background. On hovered rows they drop to 3.6-4.3 on light themes, which is fine for icons and badges (3:1) but not for small status *text*. Where status text appears in rows, use a darker variant, as minimal proposed.
- In the dark palettes where surface-alt equals surface, the zebra is simply one step above background.

**Suggested picker order:** 1 Reading Room, 2 Mist, 3 Vellum, 4 Garden Quiet, 7 Midnight Ink, 8 Slate Dark, then the bolder 5, 6, 9, 10, with A1 and A2 as extras. For the three presets that already exist, Vellum replaces Archive, Garden Quiet replaces Garden, and Midnight Ink replaces Midnight. The replacements fix the muted-text, ring and invisible-primary defects in the current Midnight and Terminal presets.

---

## 6. The smallest path from C- to B+, and beyond

**To B+, in order:**
1. **Row tokens in `derive.ts` plus the grid wired to `var()`, with opaque hover and a bar on `::before`** (§4). This fixes the top complaint and the theme-blind grid. Alone it gets to roughly C+ or B-. *All 6*
2. **Fix `derive.ts` muted-foreground and ring/primary** so presets have a muted text level and a visible focus ring and primary in dark themes. It is cheap, and every screen in every theme benefits. *F, C, S*
3. **Grid header to a tonal band with no vertical dividers, and remove one frame.** This gives the biggest calm gain. *All 6*
4. **Mute the Type icons and unify placeholders** in `formatting.ts`. *All 6*
5. **Tint secondary selected states instead of filling them navy.** *I C R M*
6. **Ship 4-6 of the §5 palettes** (1, 2, 3, 4, 7, 8) and update `DESIGN_SPEC.md` to match. *S*

That set reaches B+: clear hover feedback, a table that follows the theme, one heavy band, one accent, and no false alarms in the data.

**Beyond B+:** filter icons on hover; aligned numerals (Geist `tabular-nums` if Charter has no `tnum`); swatches that preview hover, ideally with a live mini-table; a right-edge scroll fade or pinned Item column; Charter page titles; one radius scale; a sort-count badge; enabling cell focus for real keyboard grid navigation; a density toggle; skeleton rows and a designed empty state.

**Do not touch:** the Geist + Charter pairing, the 64 px row height (the descender gotcha), the responsive column tiers and the card mode under 860 px, the tooltip system, the theme picker architecture (extend `derive.ts`, don't replace it), and the Discover cards.

---

## 7. Which tools to keep using

- **Keep impeccable as the main product-UI critic** for audits, state design, colour and tokens. Next time, run it in full (detector, browser pass, the two-sub-agent critique, and a `PRODUCT.md`/`DESIGN.md` for context). Even degraded, it produced the best review.
- **Keep frontend-design as the cheap second opinion.** It was fastest and cheapest, it found the one defect nobody else did, and it gives a point of view on typography and "one signature moment". Use it alongside impeccable rather than instead of it.
- **Keep one awesome-design-skills template, refined,** for its *method* only: testable acceptance criteria and QA checklists when writing specs. Ignore its fonts and tokens. Drop **minimal** and **clean** for this purpose: they share refined's rule text and add correlated rather than independent signal. Clean's ring catch was good, but it came from careful reading, not from its rules.
- **Drop design-taste-frontend for product and data UI.** By its own section 13 it is out of scope, and it cost the most. Its only lasting contribution, `color-mix()` token derivation, is now in §4. Keep it only for landing or marketing pages.
- **Process fixes for the next bake-off:**
  1. Include a real hover screenshot, or a short screencast.
  2. Point reviewers at `derive.ts` and `DESIGN_SPEC.md`.
  3. Replace the string-inequality palette check with the perceptual and muted-on-hover checks used here.
  4. Down-weight agreement on points the brief itself suggested.
