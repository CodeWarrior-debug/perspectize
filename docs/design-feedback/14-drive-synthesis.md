# 14 - Drive synthesis (round 2) and delta vs round 1

Independent synthesis of the five live-drive runs (files 9-13) and `drive-metrics.md`, set against round 1 (files 0-7 and `metrics.md`). Analysis only: nothing under `frontend/` or `backend/` was changed.

**What I checked myself** (read-only):
- `ActivityTable.svelte` (grid params at 444-466, `suppressCellFocus` at 757).
- `activityItemCellRenderer.ts` (why Midnight titles vanish).
- `app.css` preset blocks (98-212).
- `derive.ts` (muted text at 180, ring at 188).
- `presets.ts:19` (the Reading Room mood line).
- `grid-config.ts` (column-picker labels, 263-282).
- `activityTooltipSpecs.ts` and `formatting.ts:150-164` (the "--" tooltip).
- `Header.svelte` and `PageWrapper.svelte` (gutters and focus styles).
- The drive protocol and plan (what each run was told).
- `.impeccable.md` (the context impeccable was pointed at).

I did not drive the app. Wherever I say "verified", I mean against source.

---

## 1. Round-2 scorecard and ranking

Scores are out of 5. **Live evidence** measures how much of a run's evidence was actually measured in the browser, as opposed to computed or asserted. **Part A** measures how completely the run covered steps A1-A10. **New findings** counts verified findings that the control did not make.

| Rank | Run | Grade given | Specificity | Live evidence | Part A | New vs control (verified) | Errors | Tokens | Time | Tools |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **frontend-design** | C- | 4.5 | 4 | 4 | 5: "--" tooltip, white "Loading..." flash, caps "COLUMNS" eyebrow, raw-boilerplate Discover descriptions, programmatic grid-focus probe | Token names `--background`/`--card` (the repo uses `--color-*`) | 132,314 | 157 s | 57 |
| 2 | **design-taste-frontend** | C- | 4.5 | **4.5** (read `--ag-*` variables live in Midnight) | 4 | 5: picker says "Published" where the grid says "Date" and omits Category, default page is pure white despite "warm paper-white", Midnight and Terminal swatches look identical, focus is the browser default 1px, numerals are serif and not tabular | **Finding 16 is false**: it says the grid colours are "not located in `src`". They are at `ActivityTable.svelte:447-457`. | 147,232 | 151 s | 54 |
| 3 | **impeccable** | C- | 4 | 3.5 (hover composited by hand, which it admits) | 3.5 (focus checked in Archive only) | 2: Category missing from the Columns dialog, and it names `derive.ts` as the place for the new row tokens | Self-count of snapshots is wrong. It ignored the `.impeccable.md` context it was pointed at (§6). | 120,687 | 141 s | 53 |
| 4 | **awesome/refined** | C- | 4 | 3.5 | 3.5 | 2: selected preset shown only by a border, 13 px cells sit off the 14 px scale | Suggests `--color-primary` for the grid header, which keeps the heavy band | 129,175 | 149 s | 58 |
| - | **control** (baseline) | C | 3.5 | 3.5 | 3.5 | n/a. Its own uniques: orphaned second row in the preset grid, FAB overlap (also found by refined and taste) | Screenshot count wrong (13 claimed, about 11 taken). Calls the Discover focus ring "heavy", against everyone else. | **105,264** | **126 s** | 50 |

### What the design systems added over plain Claude: little

The control found every high-severity item on its own:
- the grid ignores the theme, and Midnight titles become illegible
- hover is nearly the same colour as the zebra stripe, with numbers
- the hover is a `::before` overlay
- placeholder noise
- the gutter mismatch
- header clutter
- the Archive clash
- the console warning and the 404s
- mobile is the best screen
- the Compare dead end

It did so with the fewest tokens, the fewest tool calls and the shortest time. **Live browser access, not the design system, produced the step change this round.**

The systems' extra value was a handful of low-to-medium polish items each, roughly 3-5 verified extras per 15-40k extra tokens. None of the four found a defect more severe than what the control found. The systems' verdicts were also no more discerning: all four landed on exactly the owner's C-, and the control on C.

- **frontend-design** added the most useful and most accurate extras, and kept its point of view ("design for the subject", one typographic moment in Charter). Best of round 2.
- **design-taste-frontend** was the surprise. Its "universal" rules (theme parity, colour and shape locks, copy self-audit, empty states) map well onto a live QA pass, and it gathered the best mechanism evidence: the `--ag-background-color`, `--ag-odd-row-background-color` and `--ag-row-hover-color` values staying light in Midnight. But it made the only material factual error. An implementer who trusted finding 16 would go hunting for a vendored stylesheet. It was also the most expensive run again.
- **impeccable** was accurate and concise, but in effect it ran as plain Claude plus a hover rule. For the second round running, it ran degraded (no context file, no detector).
- **refined** was indistinguishable from the control apart from two minor items.

---

## 2. Delta vs round 1, per tool

### Across all tools

**What live driving added:**
1. **The biggest finding of the exercise: the dark themes are broken, not just off-brand.** The grid is *half*-themed:
   - AG Grid paints white rows from literal hex.
   - The Item title uses a Tailwind class, `text-foreground` (`activityItemCellRenderer.ts:75`), so it picks up Midnight's `#e8e6df`. That is about 1.25:1 on white.
   - The thumbnail tile uses `bg-muted`, so it turns into a dark square.

   All six round-1 tools predicted "a white table under a dark shell". None predicted illegible text, although the source showed it.
2. **Page gutters differ.** The header and `PageWrapper` use `max-w-screen-xl mx-auto` (1280 px). The Activity route (`+page.svelte:66,137`) has no max width. At 1440 px the content starts at x=32 on Activity and at x=112 on the other pages. Verified. All five runs found it, and no round-1 tool did, because they each opened one or two stills.
3. **Compare is a dead end** (5/5). **The Messages FAB overlaps the footer and cards** (3/5). **Mobile is the best screen** (5/5).
4. **The console shows an AG Grid "no value for --ag-list-item-height" warning and two unidentified 404s** (5/5, but A10 asked for them).
5. **Hover mechanism confirmed live:** the row's own background never changes; the hover is a `::before` overlay (frontend-design, refined, taste, control). This confirms the round-1 synthesis's reading of the Quartz CSS.

**What it confirmed from round 1:**
- The hover composites are the same in every run: even rows (241,243,245) and odd rows (234,238,242-243) against a zebra of (247,250,252). This matches the round-1 synthesis values `#f1f3f5` and `#eaeef2`. Round-1 impeccable's odd-row value `#edf0f4` was wrong, and its round-2 run corrected it.
- The theme does not reach the grid: confirmed live, including the hover (taste read `--ag-row-hover-color` unchanged in Midnight).
- Round-1 impeccable said "screenshots 09/10 show the grid staying navy under Midnight". That was unsupported at the time, because those stills show Reading Room. It is now **confirmed true** live. The claim was right; the evidence was not.
- Round-1 impeccable's "numeric columns are Geist" is **refuted again**: taste saw them live in serif (every `.ag-cell` is Charter).
- The round-1 synthesis noted "the shipped Reading Room is pure white" despite its "warm paper" description. **Confirmed** by taste live, and `presets.ts:19` says "Navy on warm paper-white" while `app.css:40` is `#ffffff`.

**What it contradicted, or failed to reproduce:**
- **Focus rings.** Round-1 clean said `--color-ring` is invisible in Midnight and Terminal. Refined and taste reported "a visible white ring in dark" on the header Settings button. **That does not refute clean.** `Header.svelte:51-58` has no focus styles, so what they saw was Chrome's default `auto` outline, which adapts to any background. The token ring (`ring-ring`) is used by shadcn `button`, `input`, `select`, `switch` and `dialog-content`, and those were never focus-tested in a dark theme. `app.css:178` still sets ring `#0d1b33` on a `#0d1421` background, so **clean's claim stands** (verified). Taste's separate point, that header focus is only the thin browser default, is **correct**, and no round-1 tool made it.
- **Muted text.** Round-1 frontend-design's best catch was that the presets flatten `--color-muted-foreground` to `#171717` or `#ffffff`. **No round-2 run noticed it, including frontend-design itself.** It is still true (`app.css:112,141,170,199`; `derive.ts:180`). It shows up as missing hierarchy rather than as a visible break, and screenshot-level driving misses that.
- **Hover fix quality went down.** In round 1, impeccable, minimal and the synthesis established that hover must be **opaque**, because an rgba overlay composites differently on odd and even rows. In round 2 all five runs proposed a *stronger alpha* (10-16%). That still gives two hover colours depending on row parity. No round-2 run mentioned opacity. As in round 1, all five also put the bar as `box-shadow` on the row, which an opaque `::before` would cover. The live runs are better at diagnosing and worse at specifying the fix.
- **The round-1 unanimous findings that disappeared:**
  - the red YouTube play icon (6/6 in round 1, 0/5 in round 2)
  - navy on secondary selected states (4/6 in round 1, 0/5 in round 2)
  - "four navy bands" (0/5 in round 2)

  The round-1 brief quoted the prior review ("four heavy navy bands… borders around borders… saturated alert colours"). **The round-2 protocol did not** (I checked `drive-protocol.md`). These round-1 "consensus" items were at least partly **echoes of the brief**. They are still real in source (`formatting.ts:333` `#FF0000`), but their priority should be downgraded.
- **Zebra: keep or drop?** Round-1 synthesis said "keep a faint zebra". In round 2, 4 of 5 runs *that actually saw the table* prefer dropping it or making it optional (taste and control prefer dropping it; frontend-design and refined give it as the first option). See §3.

**What round 1 found that round 2 did not:**
- `suppressCellFocus: true`. Round-1 taste and clean read it from source. In round 2, **all five runs left A7 "grid focus unverified"**. The true answer is that grid cells cannot take focus at all. frontend-design got `outline: none` from a programmatic probe and stopped there.
- Midnight and Terminal primary are about equal to their background (1.07:1 and 1.36:1). The header band merges into the page. Round 2 described the header as having "gone dark" and did not flag this.
- `DESIGN_SPEC.md` still prescribes the bug (a 3% zebra and 6% hover, a navy header). No round-2 run read it.
- The clipped last column with no scroll hint (frontend-design, round 1).
- Palettes and contrast arithmetic. Round 2 was not asked for them, so this is not a regression.

### Per tool

| Tool | Round 1 → Round 2 | Net |
|---|---|---|
| **impeccable** | Round 1: best fix design (state order, opaque hover, drop `columnHoverColor`, testing plan) with one factual error (Geist numerals). Round 2: accurate but thin, and dropped the opaque-hover insight ("raise to 12-16% alpha"). Degraded again: ignored `.impeccable.md`, even though that file says "no trending", which would have flagged Discover's "Showing Trending Content" label. Its round-2 "would not touch the theme presets" is wrong given the preset defects. | **Down.** Strong at designing a fix from source, no better than the control at live audit. |
| **frontend-design** | Round 1: best unique catch (muted-foreground) at the lowest cost, one misplaced-file error. Round 2: most verified unique extras, but missed its own round-1 catch, and it was the second most expensive run. | **Up / steady.** The most consistently useful across both modes. |
| **refined** | Round 1: testable acceptance criteria; treated the unused selected state as a defect. Round 2: solid but control-equivalent; header advice regressed to "use `--color-primary`". It no longer called the selected state a defect. | **Down.** Its method value (acceptance criteria) does not show up in a live audit. |
| **design-taste-frontend** | Round 1: weakest (out of scope, hyphen leak, "AI cream" noise). Round 2: second best. Its universal rules suit live QA; its best live mechanism evidence; five verified uniques. But it made the worst factual error of round 2, and still a faint hyphen leak ("a lighter '-'"). | **Up sharply**, for live QA only. |
| control | Round 1: none. Round 2: the baseline that the systems barely beat. | n/a |

---

## 3. Signal strength

### Raised independently by at least 3 of the 5 round-2 runs

A "(Part A)" tag marks items that the protocol explicitly asked every run to check. Agreement on those is expected rather than independent.

| Finding | Runs | Verified |
|---|---|---|
| The grid ignores the theme; Midnight Item titles are illegible | 5/5 (Part A5) | Yes: `ActivityTable.svelte:447-457` literals plus `activityItemCellRenderer.ts:75` `text-foreground`. About 1.25:1. |
| Hover on even rows is about the same as the zebra; hover strength depends on row parity | 5/5 (Part A2-4) | Yes: the rgba overlay at line 451 |
| Archive: a cool grid on a warm page, navy header | 5/5 (Part A6) | Yes |
| **A 2-3 px left accent bar on hover** | 5/5, including the control | Not prompted in round 2, so this is independent. Because the control proposed it too, it is Claude's default idea, not a system insight. It is still correct. |
| **Placeholder noise, with "—" and "--" mixed** | 5/5 | Yes: `formatting.ts` 151, 162, 219, 227, 235 vs the em-dash lines |
| **Page gutter mismatch (32 vs 112 px)** | 5/5 | Yes: `PageWrapper.svelte:6` and `Header.svelte:24` vs `+page.svelte:66` |
| **Compare empty state is a dead end** | 5/5 | Seen live by all; not re-checked |
| Mobile card view is the best screen; don't touch | 5/5 | n/a |
| Drop the zebra, or reduce it to about 2% | 5/5 (drop preferred by taste and control; first option for frontend-design and refined) | Design judgement |
| **Header noise: `\|` pipes plus a filter icon on every column** | 4/5 (impeccable, taste, control; refined "divider bars") | Yes, a Quartz default |
| AG Grid init-order warning and 404s | 5/5 (Part A10) | Warning plausible: `listItemHeight: 24` is set, but the style is injected after init |
| **Messages FAB overlaps the footer and last card** | 3/5 (refined, taste, control) | Seen live |

### Unique findings (one run only)

| Finding | Run | Verified | Keep? |
|---|---|---|---|
| Hovering an empty Views or Likes cell shows a tooltip reading only "--" | frontend-design | **Yes.** `activityTooltipSpecs.ts:16,20` calls `formatCountExact(null)`, which returns `'--'` (`formatting.ts:162`). That is a non-empty string, so the popover opens. | Yes, cheap |
| The Columns picker says "Published" where the grid says "Date", and omits Category | taste (impeccable: Category only) | **Yes.** `grid-config.ts:269` vs `ActivityTable.svelte:595`; `DATA_COLUMNS` has no `category`. Admin labels also drift ("Created at" vs "Date Added"). | Yes |
| The default page is pure white despite "Navy on warm paper-white" | taste | **Yes.** `app.css:40` vs `presets.ts:19` | Yes |
| Header focus is only the browser default outline | taste | **Yes.** No `focus-visible` classes in `Header.svelte` | Yes |
| Midnight and Terminal swatches are indistinguishable | taste | Plausible; both primaries are near-black | Yes, with swatch previews |
| White "Loading..." flash before the theme paints | frontend-design | Not verified | Investigate |
| Caps "COLUMNS" eyebrow above a dialog already titled Columns | frontend-design | Not verified | Minor |
| Discover descriptions show raw YouTube boilerplate | frontend-design, taste | Seen live by two | Yes, truncate |
| Selected preset marked only by a border | refined | Not verified | Minor |
| Orphaned second row in the preset grid | control | Seen live | Minor |
| `derive.ts` is where the row tokens belong | impeccable | Correct: the round-1 synthesis's key architectural point, now found independently | Yes |
| Grid colours "not located in `src`" | taste | **False** | Discard |
| Discover focus ring too heavy | control | Contradicted by 4/5 | Discard |

### Where I disagree

1. **Raise the alpha (all five) vs make the hover opaque.** Opaque is right. Anything with alpha keeps the parity-dependent hover the owner is complaining about. Use an opaque `--color-row-hover` and draw the bar on `.ag-row-hover::before`, not on the row.
2. **Zebra.** I now side with round 2: **default the zebra off** (the `--color-row-alt` token equals the background), with hairlines and an opaque tinted hover as the only fill. That removes the collision by design. Four live reviewers found zebra plus hairline redundant, and the zebra is already nearly invisible (ΔE 0.017). Keep it as a token so the owner can A/B a faint neutral stripe.
3. **Grid header from `--color-primary`** (refined, frontend-design's "filled pill"). No. A themed navy band is still a heavy band. Use `--color-muted` with foreground labels at weight 600.
4. **"Would not touch the theme presets"** (impeccable, frontend-design, refined). No. Every non-default preset has a broken muted level, and the dark presets have an invisible ring and primary. Fix them in `derive.ts`.
5. **"Hide Compare from the nav until content is chosen"** (taste, refined). I prefer a real empty state with a link to Activity. A nav item that appears and disappears is less clear.
6. **Hide N/A columns for Bible rows** (frontend-design, control). A grid cannot hide columns per row. Leave N/A cells blank instead, and reserve the muted em dash for "unknown".

---

## 4. Does the ranking change? Which tools to keep

**Round 1:** impeccable > frontend-design > refined > clean > minimal > taste.
**Round 2:** frontend-design > taste > impeccable > refined ≈ control.
**Combined (the four tools in both rounds):** **frontend-design > impeccable > taste > refined.**

Frontend-design is the only tool that was top-two in both modes. Impeccable remains the best at *specifying* fixes from source; in round 2 it added nothing live. Taste goes from last to a usable live-QA checker. Refined is not worth running: in round 2 it matched the control, and in round 1 it was correlated with minimal and clean.

**Keep:**
- **frontend-design: the default reviewer**, live or static. It is the cheapest in round 1, has the best unique yield in both rounds, and holds a point of view on typography and identity.
- **impeccable: for designing fixes and specs** (state models, token plumbing, test plans) from source. Run it *properly* next time: make sure it loads `.impeccable.md` (it looks for `PRODUCT.md` / `DESIGN.md`, so copy or symlink the file, or name it in the prompt as the context file), and run its detector.
- **design-taste-frontend: optional, as a live consistency and QA pass only** (theme parity, label consistency, copy glyphs). Not for fix design or palettes. Its round-1 fix advice was the weakest, and it still leaks its em-dash ban.
- **Plain Claude with a browser** is the cost-efficient default for "is anything broken?" audits. Spend a design system only when you want a fix specification or a point of view.
- **Drop:** refined, minimal and clean for this product.

**Process lesson:** give the reviewer the live app *and* point it at the source of truth (`derive.ts`, `DESIGN_SPEC.md`, `app.css` presets). The live runs diagnosed better; the source runs specified better. Neither alone found everything: muted text and `suppressCellFocus` came only from source; illegible titles and gutters came only from driving.

---

## 5. Consolidated top 10 (both rounds) and the path from C- to B+

Tool key: **R1** round 1, **R2** round 2 (n/5), **S** synthesis only.

1. **Theme the grid from tokens** *(R1 6/6, R2 5/5)*. **Severity: blocker**, since the dark themes are unreadable. Pass `var(--color-background)`, `--color-foreground`, `--color-border`, `--color-primary` and the header tokens into `themeQuartz.withParams` (`ActivityTable.svelte:444-466`). Drop `columnHoverColor` and the white resize-handle rgba.
2. **Row tokens in `derive.ts`, used for the hover** *(R1 6/6, R2 5/5; opaque from R1 impeccable and minimal)*.
   - Tokens: `--color-row-alt` (default: the background, so zebra is off) and an **opaque** `--color-row-hover` (primary mixed about 11% into the background on light themes, about 20% on dark; ΔE_OK ≥ 0.045 light / 0.07 dark; text and muted text ≥ 4.5:1).
   - Draw a 3 px primary bar on `.ag-row-hover::before`.
   - Put them in `DerivedTokens` and `toCssVarMap` so custom themes get them too.
3. **Fix the preset defects in `derive.ts`** *(R1 frontend-design, R1 clean, S; R2 missed them)*: a real mid-tone `mutedForeground` (`derive.ts:180`), and a `ring` and chrome primary that reach ≥ 3:1 against the background in dark themes (`derive.ts:188`, `app.css:163,178,192,207`).
4. **Grid header becomes a quiet band** *(R1 6/6, R2 4/5)*: `--color-muted` background, foreground labels at weight 600, no `|` dividers, filter icons shown only on hover, focus or when a filter is active.
5. **One empty-value language** *(R1 6/6, R2 5/5, plus R2 frontend-design)*: a muted em dash for "unknown", blank for "not applicable". Stop `formatCountExact(null)` from producing a "--" tooltip (return `''`, which already falls through to "no popover"). Change this in `formatting.ts`.
6. **One page container** *(R2 5/5)*: either give Activity `max-w-screen-xl`, or deliberately let the grid run full-bleed with its H1 and toolbar aligned to the header logo.
7. **Visible, token-based focus** *(R1 clean and taste, R2 taste and frontend-design)*:
   - Add `focus-visible:ring-2 ring-ring ring-offset-2` on the header controls and the in-cell `+` and title controls, and test it in Midnight after item 3.
   - Keep `suppressCellFocus` until after B+.
8. **Compare empty state** *(R2 5/5)*: a centred message with a "Go to Activity" action, aligned to the page gutter.
9. **Column picker parity and the FAB** *(R2 taste and impeccable; R2 3/5)*: add Category, use the grid's own header names ("Date"), and reserve bottom padding so the Messages FAB never covers the footer or the last card.
10. **Make the spec and the default match the intent** *(S, R2 taste, R1 3/6)*:
    - Set Reading Room's background to warm paper (`#fbfaf7`, from the round-1 §5 palette 1).
    - Make the theme swatches preview background, row-hover and primary, so Midnight and Terminal are distinguishable.
    - Update `DESIGN_SPEC.md` lines 90 and 255-258 in the same change, so the spec stops prescribing the bug.

**Path from C- to B+:**
- Items 1-2: hover works, and the dark themes become legible. **C- to C+/B-.**
- Items 3-5: a real text hierarchy, visible focus in every theme, and a calm grid chrome. **B.**
- Items 6-8 plus the cheap parts of 9: consistent layout and no dead ends. **B+.**
- Item 10 locks it in so the next design pass does not regress it.

**Beyond B+:**
- Ship 4-6 of the round-1 §5 palettes.
- Charter page titles.
- Numeric columns in Geist `tabular-nums`.
- Mute the `#FF0000` type icon, and tint the navy "All Content" and "Loaded" selections. Both are real, but round 2 suggests they were brief echoes, so they come later.
- Truncate the Discover descriptions and check that the "Trending" label fits the product's "no trending" principle.
- Remove the white loading flash.
- A right-edge scroll hint.
- Real grid-cell keyboard focus.
- A density toggle.

**Don't touch:** the mobile card view (5/5 call it the best screen), the Geist + Charter pairing, 64 px rows, the responsive tiers, the tooltip system, the Discover search field and its ring, the dialogs, or the `derive.ts` architecture (extend it, don't replace it).

**Tests** (stateful component, per the repo's testing principles):
- Unit-test a pure `gridThemeParams(tokens)` function and `deriveTheme` across every preset. Assert that hover is opaque, hover ≠ alt at the ΔE floor, and text, muted and bar contrast meet their thresholds.
- Add one local Vitest Browser Mode test that hovers an odd row and an even row, asserts the computed `::before` background is identical on both, and repeats after switching to Midnight. It also asserts the Item title contrast against the row background is ≥ 4.5:1.
- The Midnight regression is exactly the kind of state loss that should fail loudly.

---

## 6. Integrity notes

- **Contamination: none detected.**
  - The orchestrator reports quarantine checksums at 11/11 OK and 0 grep hits.
  - I also grepped all five outputs for round-1 vocabulary ("navy bands", "borders around", `color-mix`, ΔE, `surface-alt`, `row-alt`, "opaque", DESIGN_SPEC, "round 1"). The only hit was impeccable's `derive.ts` mention. That is legitimate: the protocol pointed every run at `src/lib/theme/`, and impeccable's token names (`--grid-zebra`, `--grid-hover`) differ from round 1's.
  - Further signs of independence: round-2 runs did not reuse round-1's distinctive framings. None mentioned the red icon or "four bands", and none proposed opaque hover.
  - File mtimes (02:34, 02:37, 02:39, 02:42, 02:44) match the stated sequential order.
- **Writes to app data: none reported.**
  - The orchestrator's write-verb grep found 0 hits.
  - Taste states explicitly that nothing was clicked that saves.
  - All runs cancelled dialogs with Escape and restored the theme key to null.
  - frontend-design and refined also reset the derived `perspectize-theme-applied` cache. That is a localStorage write outside the letter of rule 4, but harmless and verified equal to the baseline.
- **Protocol deviations:**
  1. **No run did the ~10-minute Part B.** Runs lasted about 2-2.5 minutes in total. **No run opened Messages or the user menu**, which Part B named.
  2. **A7 was incomplete everywhere.** No run tabbed into the grid. Impeccable tested focus in Archive only, and the control tabbed two stops. The correct live answer ("cells are unfocusable: `suppressCellFocus: true`") was missed by all five.
  3. **A2/A3 "record the actual background on hover":** every run composited the rgba by hand rather than sampling a hovered pixel. The control and taste read pseudo-element or `--ag-*` values, which is the closest to measurement.
  4. **Impeccable did not use its assigned context file.** The run prompt named `.impeccable.md` (which exists at the repo root), but the skill's loader looked for `PRODUCT.md` / `DESIGN.md` and the run reported "no context". This is a harness mismatch, not agent misconduct. It left impeccable degraded for the second round running.
  5. **Self-report inaccuracies:** impeccable's snapshot count and the control's screenshot count (both already noted in `drive-metrics.md`).
  6. **Order effect:** the fixed order (impeccable first, control last) means later runs met a browser that had been restored between runs. No knowledge carried over, but the earlier runs absorbed any first-load flakiness. Impeccable alone reported the 404 as "twice on the first load".
- **Shared-model caveat, as in round 1:** all five runs are the same model on the same protocol. The 5/5 agreement on Part A items reflects the checklist, not independent discovery. The strongest independent signals are the Part B convergences: gutters, Compare, the left bar and dropping the zebra.
