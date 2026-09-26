# Design Option Branches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, inline (each fix needs live browser judgement). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the owner four alternative branches to compare, one per design tool, each applying what *that tool distinctly suggested* on top of the merged universal fixes (PR #417), plus that tool's colour palettes as extra presets in the theme picker. Nothing here is merged; the branches are options.

**Architecture:** Every branch starts from current `origin/main` (contains #417). Each fix is one commit, judged with the same live desktop + mobile clip loop as PR #417 (max 5 rounds per fix, then drop). Palettes become `THEME_PRESETS` entries (8 base tokens each; row/derived tokens come from `deriveTheme`), so they need no new plumbing.

**Tech Stack:** SvelteKit 2 / Svelte 5, Tailwind v4 tokens, AG Grid 32.3.9, culori, Vitest, Chrome DevTools MCP + the saved recorder `~/.claude/tools/video-capture/record-clip.mjs`.

**Spec:** research on branch `docs/design-feedbacks-from-systems` (`/Users/jamesjordan/GitHub/perspectize/docs/design-feedback/`): per-tool files `1`–`6`, `9`–`13`, syntheses `7` and `14`. The plan for the merged PR is `2026-09-24-design-universal-fixes-plan.md` (its Task 0 rubric, checkers and constraints apply here unchanged).

## Global Constraints

- Work in worktree `/Users/jamesjordan/GitHub/perspectize/.claude/worktrees/design-fixes` (dev server `http://localhost:5174`, backend `make run` on :8080, signed-in Chrome via `.claude/scripts/sv-chrome.sh`). Never touch other worktrees. If the backend, Chrome (port 9222) or the :5174 server is down, restart them (the owner authorised restarting the backend); never sign in.
- **Branches** (from `origin/main`, no issue number so no `INI-N` segment): `option/impeccable-suggestions`, `option/frontend-design-suggestions`, `option/design-taste-suggestions`, `option/awesome-design-suggestions`. Local only; do not push or open PRs unless the owner asks.
- One commit per fix; conventional commits (`feat(theme):`, `fix(grid):`…); each fix judged with clips (Activity table filtered with `?f.type=youtube` first, then recording; desktop 1440 and mobile 390, plus Midnight where colour matters). Max **5 rounds** per fix; a fix that isn't PASS by round 5 is `git reset --hard HEAD~1` and logged as abandoned. Rubric: PASS / CLOSE / PROGRESS / DISTANT / REGRESSION.
- Read-only against app data; theme switching is browser-local and the theme key is cleared after every check. No chained bash (`&&`). Do not read env secret files. No migrations, no backend edits.
- Keep code clean: named constants, comments say *why*, match surrounding style; stateful/pure logic gets tests, static UI does not.
- Clips: `sv-<branch-short>-<fix>-r<N>-<desktop|mobile|midnight>.mp4` in `~/Downloads/screenshots/`. Never upload publicly without asking.
- Palettes must keep `row-hover` distinct from the zebra: this is enforced automatically by the existing per-preset unit test in `tests/unit/theme/derive.test.ts` (it iterates `THEME_PRESETS`), so a bad palette fails the suite.
- Execution log: `$SCRATCH/execution-log-options.md` (`SCRATCH=/private/tmp/claude-501/-Users-jamesjordan-GitHub-perspectize/60d62a5e-f586-4932-bd37-64c4d6393b23/scratchpad`).
- Between branches: run the full unit suite + `pnpm run check` (expect the single pre-existing `tests/browser/ag-grid-integration.test.ts:125` error) and record results.

## Review Focus

- A palette whose `foreground` on `background` fails AA is clamped by `deriveTheme`, which silently changes the authored look: after adding palettes, compare derived vs authored colours for each and note any clamped ones.
- Many more presets in the picker: the dialog list must stay usable (scrolls, no clipping of the selected-preset border) at 390px and 1440px.
- Derived-token changes (muted-foreground, ring) touch every preset and every custom theme: `theme-store`, `export`, `presets` tests and the preset CSS regeneration must stay consistent (`app.css` blocks must equal `generatePresetCss()`; the existing `presets.test.ts` checks this).
- Changing a themed control's colours (segmented controls, type icon) must stay legible in every preset, especially Midnight and Terminal.
- Branch isolation: each option branch starts from `origin/main`, never from another option branch, so overlapping ideas (several tools suggested muted type icons) are implemented independently and can be compared.

---

## Shared mechanics

**Palette import (used by every branch).** A palette in a tool's report has: name, intent, and hex for `background, surface, surface-alt, row-hover, border, text, text-muted, primary, primary-foreground, accent, success/warning/danger/info`. Map to `BaseThemeTokens`:

| Base token | From the palette |
|---|---|
| `primary` | `primary` |
| `primaryHover` | primary darkened 0.06 in OKLCH lightness for light palettes, lightened 0.06 for dark palettes (script below) |
| `secondary` | `surface-alt` (light) / `surface` (dark) |
| `accent` | `accent` |
| `background` | `background` |
| `foreground` | `text` |
| `border` | `border` |
| `destructive` | `danger` |

`deriveTheme` computes card/popover/muted/rating/row tokens. The palette's own `row-hover`/`surface-alt` are not used (row tokens derive from primary/foreground), which is why the tests, not the palette table, guarantee hover ≠ zebra.

Palette-to-preset helper (run once per branch with `npx -y tsx`, paste the output into `presets.ts`; it lives in `$SCRATCH/tools/palette-to-preset.mjs`, not committed):

```js
// usage: node palette-to-preset.mjs palettes.json   (array of {id,name,mood,dark,primary,accent,background,text,border,surfaceAlt,surface,danger})
import { readFileSync } from 'node:fs';
import { converter, formatHex } from 'culori';
const toOklch = converter('oklch');
const shift = (hex, dl) => { const c = toOklch(hex); return formatHex({ ...c, l: Math.min(1, Math.max(0, c.l + dl)) }); };
const rows = JSON.parse(readFileSync(process.argv[2], 'utf8'));
for (const p of rows) {
	console.log(`\t{
\t\tid: '${p.id}',
\t\tname: '${p.name}',
\t\tmood: '${p.mood}',
\t\tbase: {
\t\t\tprimary: '${p.primary}',
\t\t\tprimaryHover: '${shift(p.primary, p.dark ? 0.06 : -0.06)}',
\t\t\tsecondary: '${p.dark ? p.surface : p.surfaceAlt}',
\t\t\taccent: '${p.accent}',
\t\t\tbackground: '${p.background}',
\t\t\tforeground: '${p.text}',
\t\t\tborder: '${p.border}',
\t\t\tdestructive: '${p.danger}',
\t\t},
\t},`);
}
```

Steps for "ship palettes" in a branch: (1) a fresh subagent (Sonnet) reads only that tool's `## 5` palette section and writes `palettes.json` (exact hex, no invention); (2) run the helper; (3) append to `THEME_PRESETS` in `frontend/src/lib/theme/presets.ts` (ids kebab-case, prefixed with the tool short name to avoid collisions with the five built-ins, e.g. `imp-mist`); (4) `npx -y tsx gen-preset-css.mjs` and replace the `[data-theme]` blocks in `app.css` with its output (the diff must be additions only); (5) `vitest run --project unit tests/unit/theme` (every new preset is exercised by the existing `it.each(THEME_PRESETS)` tests); (6) commit `feat(theme): add <tool> palettes to the theme picker`; (7) judge: open Settings → theme picker on desktop and mobile, screenshot the list, apply 3 palettes (a light, a dark, the boldest) and record the Activity clip in each; acceptance: **PL1** all N cards visible and scrollable at 390 and 1440, **PL2** selected card shows its border, **PL3** each applied palette gives readable titles, a visible hover distinct from the zebra (run `hover-check`), and visible focus rings, **PL4** no palette silently clamped (compare `deriveTheme(base).foreground` to the authored text).

**Judging loop, checkers, recorder usage:** as in the merged-PR plan (numeric checkers `hover-check.mjs`, `focus-check.mjs`, `hover-cell.mjs` in `$SCRATCH/tools/`, clips via the saved recorder).

---

### Task 1: Branch `option/impeccable-suggestions`

**What Impeccable distinctly suggested** (its own path to B+ and "beyond", from `1-impeccable-recommendations.md` §2–§4 and the drive round): calm the *controls* (navy used for four control types), quieter type icon, tabular figures, swatches that preview hover, drop the second border, the 10-palette set. Its selection model and left bar are already shipped.

- [ ] **Step 0: Branch.** `git -C $WT checkout main`, `git -C $WT pull origin main` (as separate calls), then `git -C $WT checkout -b option/impeccable-suggestions`. Confirm `git log -1 --oneline` is the #417 squash.
- [ ] **Fix I1 — Selected segments stop being solid navy** ("reserve saturated primary for the single primary action per view"). Files: `frontend/src/routes/+page.svelte` (the "All Content / By User" toggle, ~lines 77 and 86) and `frontend/src/lib/components/DataModeToggle.svelte` (~lines 18 and 26). Replace the selected class `bg-primary text-primary-foreground` with `bg-accent text-accent-foreground font-semibold` plus a 1px `ring-1 ring-primary/30` (accent is the theme's tinted surface and `accent-foreground` its readable text; primary stays for real primary actions). Acceptance: **I1a** selected vs unselected segment are distinguishable by fill *and* weight in default, Archive, Midnight, Terminal (screenshots); **I1b** contrast of label on selected fill ≥ 4.5:1 (compute from computed styles); **I1c** unit tests for `DataModeToggle` (has state: two modes) updated to the new class; both modes exercised. Commit `fix(layout): selected toggle segments use the accent surface, not solid primary`.
- [ ] **Fix I2 — Type icon stops shouting.** File: `frontend/src/lib/utils/formatting.ts` `typeCellRenderer` (`svg.setAttribute('fill', '#FF0000')`, ~line 333). Use `currentColor` with the cell text class `text-muted-foreground` on the container so the icon follows the theme (`container.className += ' text-muted-foreground'`; `svg.setAttribute('fill','currentColor')`). Acceptance: **I2a** icon colour == `--color-muted-foreground` in default and Midnight; **I2b** still recognisable as a play glyph; **I2c** `tests/unit/formatting.test.ts` `typeCellRenderer` expectation updated (fill is `currentColor`). Commit `fix(grid): type icon follows the theme instead of hard-coded red`.
- [ ] **Fix I3 — Tabular figures on numeric columns.** File: `frontend/src/app.css`: `.ag-cell[col-id='duration'], .ag-cell[col-id='views'], .ag-cell[col-id='likes'], .ag-cell[col-id='percentLiked'] { font-variant-numeric: tabular-nums; }`. Acceptance: **I3a** computed `font-variant-numeric` includes `tabular-nums` on those cells only; **I3b** digits of `1.8 M / 889.4 M` right-edges align visually (clip frame). No test (static CSS). Commit `fix(grid): tabular figures on numeric columns`.
- [ ] **Fix I4 — Swatches that preview the table** ("swatches should show bg / row-hover / primary / text"). File: `frontend/src/lib/components/theme/ThemeCustomizePanel.svelte` (~line 122): replace the four dots `[primary, secondary, accent, background]` with `[background, rowHover, primary, foreground]` from `THEME_PRESET_TOKENS[preset.id]` (`rowHover` exists after #417). Extract the list into a small pure helper `presetSwatchColors(tokens)` in `frontend/src/lib/theme/presets.ts` with a unit test (returns 4 distinct colours for every preset). Acceptance: **I4a** every preset's four swatches are pairwise distinguishable (test asserts distinct hex); **I4b** Midnight and Terminal cards no longer look identical (screenshot); **I4c** custom-theme cards unchanged. Commit `feat(theme): preset swatches preview background, row hover, primary and text`.
- [ ] **Fix I5 — One border, not two** (drop the outer grid frame's double edge). File: `frontend/src/routes/+page.svelte` card wrapper `border rounded-lg shadow-sm overflow-hidden` (~line 138): keep the card border and radius, but remove the AG Grid root's own outer border via `borderRadius`/`wrapperBorder` params: add `wrapperBorder: false` and `wrapperBorderRadius: 0` to `GRID_THEME_PARAMS` (`frontend/src/lib/utils/grid-theme.ts`), with a test `wrapperBorder === false`. Acceptance: **I5a** one continuous outline around the grid (clip frame, no inner rounded frame); **I5b** header/footer still separated by hairlines; **I5c** no clipped corners. Commit `fix(grid): remove the grid's inner frame so the card is the only border`.
- [ ] **Fix I6 — Row hover cross-fade** ("quiet 120ms, background only, respect reduced motion"): `app.css` `.ag-row::before { transition: background-color 120ms ease; } @media (prefers-reduced-motion: reduce) { .ag-row::before { transition: none; } }`. Acceptance: **I6a** computed `transition-duration` on `.ag-row::before` is `0.12s` normally and `0s` under emulated reduced motion (`emulate` `colorScheme` is not enough: use `Emulation.setEmulatedMedia` features in the CDP script); **I6b** no flicker in the clip. Commit `feat(grid): 120ms row-hover cross-fade, off under reduced motion`.
- [ ] **Step: Ship Impeccable's palettes** per *Shared mechanics* (source: `1-impeccable-recommendations.md` `## 5`; ids `imp-reading-room-calm`, `imp-archive-sepia`, `imp-garden-herbarium`, `imp-mist`, `imp-linen-rose`, `imp-saffron-paper`, `imp-midnight`, `imp-slate-dark`, `imp-terminal`, `imp-dusk-plum`; note P1's name duplicates the built-in "Reading Room" visually, keep it as an option labelled "Reading Room Calm").
- [ ] **Step: Branch wrap-up.** Full unit suite + `check`; final clips `sv-imp-final-{desktop,mobile,midnight}.mp4`; log; leave the branch checked out and committed.

### Task 2: Branch `option/frontend-design-suggestions`

**What frontend-design distinctly suggested** (`2-…` §2–§4 and its round-2 catches): restore a real muted text level (its unique, highest-value catch), one typographic moment (Charter page title), swatches that preview zebra/hover, remove the outer border, muted type icon, tidy Discover cards' boilerplate, and its 10 palettes.

- [ ] **Step 0: Branch** `option/frontend-design-suggestions` from updated `main` (same as Task 1 Step 0).
- [ ] **Fix F1 — A real muted-foreground in every preset and custom theme.** Root cause: `deriveTheme` sets `mutedForeground: pickForeground(muted)`, which returns pure white or near-black, so muted text equals body text. File: `frontend/src/lib/theme/derive.ts`. Add
  ```ts
  /** A quiet-but-readable text level: the foreground pulled toward the muted surface, never below AA. */
  const MUTED_TEXT_MIX = 0.38;
  function deriveMutedForeground(muted: string, foreground: string): string {
  	const candidate = mix(foreground, muted, MUTED_TEXT_MIX);
  	return wcagContrast(muted, candidate) >= AA_NORMAL_TEXT ? candidate : foreground;
  }
  ```
  and use `mutedForeground: deriveMutedForeground(muted, foreground)`; also `secondaryForeground` keeps `pickForeground` (unchanged). Tests (`tests/unit/theme/derive.test.ts`, per preset via `it.each(THEME_PRESETS)`): `mutedForeground !== foreground`, `wcagContrast(muted, mutedForeground) >= 4.5`, and `oklabDistance(mutedForeground, foreground) >= 0.05` (a genuinely distinct level). Regenerate the preset CSS blocks (additions/changes limited to `--color-muted-foreground` lines; review the diff). Acceptance: **F1a** in Reading Room the muted text (e.g. "Recently updated content", footer counts) is visibly lighter than body text; **F1b** in Midnight/Terminal muted text is visibly dimmer than the foreground but readable (≥ 4.5:1); **F1c** all unit tests pass; **F1d** no layout change. Commit `fix(theme): derive a real muted-foreground instead of reusing the body text colour`.
- [ ] **Fix F2 — Charter page titles** (the one typographic moment). Files: `frontend/src/routes/+page.svelte` (H1 "Activity"), `routes/discover/+page.svelte`, and the Compare heading if it has one: add `font-[family-name:var(--font-family-serif)] tracking-tight` to the page H1s and keep size `text-2xl md:text-3xl`. Acceptance: **F2a** computed `font-family` of the Activity, Discover H1s begins with `Charter`; **F2b** no layout shift beyond ±2px title height; **F2c** mobile title still fits one line at 390. Commit `feat(layout): set page titles in Charter`.
- [ ] **Fix F3 — Type icon muted** (as I2, implemented independently on this branch).
- [ ] **Fix F4 — Swatches preview zebra + hover** ("one primary dot plus a mini zebra/hover strip"). File: `ThemeCustomizePanel.svelte`: replace the dots with a 3-row mini strip: `[background, rowAlt, rowHover]` stacked as thin bars plus one primary dot, from `THEME_PRESET_TOKENS`. Helper + unit test as I4. Acceptance: **F4a** strips visibly differ per preset; **F4b** hover row of the strip is visibly darker than the zebra row in every preset (numeric from tokens); **F4c** custom-theme cards unchanged. Commit `feat(theme): preset swatches preview the zebra and hover rows`.
- [ ] **Fix F5 — Discover card descriptions show real text, not boilerplate.** Files: `frontend/src/lib/components/discover/VideoCard.svelte` and a pure helper `cleanDescription(desc)` in `frontend/src/lib/utils/formatting.ts` that drops leading boilerplate lines (URLs-only lines, "Subscribe", "Follow me", social handles) and collapses whitespace before the existing truncation. Tests (`tests/unit/formatting.test.ts`): boilerplate-only → empty; mixed → first real sentence; normal text unchanged. Acceptance: **F5a** on `http://localhost:5174/discover` (search a term), cards show a readable first sentence in the clip; **F5b** no empty description gap. Commit `fix(discover): show the first real sentence of a description`.
- [ ] **Step: Ship frontend-design's palettes** (source `2-frontend-design-recommendations.md` `## 5`, ids `fd-<kebab-name>`; the recommended default there, "Reading Room v2", is added as an option, not made the default).
- [ ] **Step: Branch wrap-up** as Task 1.

### Task 3: Branch `option/design-taste-suggestions`

**What design-taste-frontend distinctly suggested** (`3-…`, drive `12-…`): consistency locks. Column-picker labels must match the grid; the default theme should match its own "warm paper-white" description; one accent; faint/no zebra; tabular numerals; muted type icon; a considered radius; its palettes.

- [ ] **Step 0: Branch** `option/design-taste-suggestions` from updated `main`.
- [ ] **Fix T1 — Column picker labels match the grid, and Category is offered.** Files: `frontend/src/lib/utils/grid-config.ts` (`DATA_COLUMNS`: `publishDate` label `'Published'` → `'Date'`; add `{ colId: 'category', label: 'Category' }`), and `INTERNAL_COLUMNS` `createdAt` `'Created at'` → `'Date Added'`. Check how `togglableColIds` and the responsive column-visibility `$effect`/`hide: true` interplay for `category` (frontend/CLAUDE.md "Column visibility gotcha": both places must stay in sync; decide the tier(s) for Category = lg only, matching its current visibility). Tests (`tests/unit/grid-config.test.ts`): `DATA_COLUMNS` labels equal the grid's header names; `category` present; `togglableColIds` includes it. Acceptance: **T1a** Columns dialog lists "Date" and "Category" (screenshot); **T1b** toggling Category hides/shows the grid column (clip); **T1c** unit tests. Commit `fix(grid): column picker uses the grid's own labels and offers Category`.
- [ ] **Fix T2 — Reading Room really is warm paper.** `presets.ts` mood says "Navy on warm paper-white" but `background` is `#ffffff`. Change the Reading Room base `background` to `#fbfaf7` and `secondary` to `#f5f3ee` in `presets.ts`, update the default `@theme` tokens in `app.css` (`--color-background/card/popover` `#fbfaf7`, `--color-secondary/muted` `#f5f3ee`, plus the derived row tokens: regenerate the values with the same one-off `tsx` print used in PR #417) and the DESIGN_SPEC token table. Tests: `presets.test.ts` (default preset background equals the `@theme` block) and every derive test still pass. Acceptance: **T2a** default page background is `#fbfaf7` (computed); **T2b** cards/dialogs/popovers follow (they use `--color-card`); **T2c** contrast body text ≥ 4.5:1; **T2d** AG Grid rows match. Commit `feat(theme): make the default Reading Room the warm paper its name promises`.
- [ ] **Fix T3 — Faint zebra with hairline rows (design-taste: "zebra plus row lines is double striping; pick one — keep hairlines, make zebra very faint").** In `derive.ts` lower `ROW_ALT_MIX` from `0.025` to `0.012` (the token stays, so it is still themeable and can be A/B'd), and add `rowBorder: true` to `GRID_THEME_PARAMS` so the hairlines are explicit. Tests: the existing per-preset hover-vs-zebra distance test still passes at its `>= 0.04` threshold (it should get easier, not harder); add `GRID_THEME_PARAMS.rowBorder === true` to `grid-theme.test.ts`. Regenerate the preset CSS (only `--color-row-alt` lines change; review the diff) and the default `@theme` row-alt value. Acceptance: **T3a** zebra is barely perceptible (numeric distance from background ≤ 0.02); **T3b** row hairlines visible; **T3c** hover clearly stronger. Commit `feat(grid): faint zebra with hairline rows, hover carries the emphasis`.
- [ ] **Fix T4 — Muted type icon** (as I2) **and tabular numerals** (as I3), one commit each, independently implemented.
- [ ] **Fix T5 — Midnight and Terminal are distinguishable in the picker.** File: `ThemeCustomizePanel.svelte` swatches: use `[background, rowHover, primary, foreground]` (same helper approach as I4; implement on this branch independently) so two dark presets with near-identical primaries no longer look the same. Acceptance: **T5a** the two dark cards differ (screenshot). Commit `feat(theme): preset swatches show background, hover, primary and text`.
- [ ] **Step: Ship design-taste's palettes** (source `3-…` `## 5` table; ids `dt-<kebab-name>`).
- [ ] **Step: Branch wrap-up** as Task 1.

### Task 4: Branch `option/awesome-design-suggestions`

**What the awesome-design-skills packs (refined, minimal, clean) distinctly suggested** — pooled, since the three share nearly the same rule text: `clean` caught the invisible focus ring in dark presets (`derive.ts` `ring: base.primary`); `refined` wants every state explicit and testable, a 4-based spacing scale, ghost secondary toolbar buttons, tabular numerals, and a live preview of the table in the picker; all three want palettes.

- [ ] **Step 0: Branch** `option/awesome-design-suggestions` from updated `main`.
- [ ] **Fix A1 — Focus ring and chrome primary that survive dark presets.** Root cause: `ring: base.primary` (`derive.ts`) and preset primaries near the page background (Midnight `#0d1b33` on `#0d1421`, Terminal `#00301f` on `#090b0a`). File: `frontend/src/lib/theme/derive.ts`. Add
  ```ts
  /** WCAG 1.4.11 non-text contrast: a focus ring must stand out from the page by at least 3:1. */
  const MIN_RING_CONTRAST = 3;
  function deriveRing(background: string, primary: string, foreground: string): string {
  	return wcagContrast(background, primary) >= MIN_RING_CONTRAST ? primary : foreground;
  }
  ```
  and use `ring: deriveRing(background, base.primary, foreground)`. Tests per preset (`it.each(THEME_PRESETS)`): `wcagContrast(background, ring) >= 3`; Reading Room ring stays primary. Regenerate preset CSS (only `--color-ring` lines change in Midnight/Terminal; review). Acceptance: **A1a** in Midnight and Terminal, Tab to a shadcn input/button in Settings and Add Video: the ring is clearly visible (screenshot + computed box-shadow colour contrast ≥ 3:1); **A1b** Reading Room/Archive/Garden unchanged; **A1c** unit tests. Commit `fix(theme): keep the focus ring visible on dark presets`.
- [ ] **Fix A2 — The glasses "perspective" icon and header chrome that vanish on dark presets** (primary used as an icon colour): find uses of `text-primary`/`#1a365d` for icons in `formatting.ts` `perspectiveCellRenderer` (`container.style.color = '#1a365d'`, ~line 400) and use `var(--color-ring)`-style derived visible colour: introduce token use `var(--color-row-accent)` (already derived to a visible colour: primary or foreground) for that icon. Test: renderer output uses the token, not hex. Acceptance: **A2a** Midnight/Terminal glasses icons visible; **A2b** default unchanged. Commit `fix(grid): perspective icon uses a visible themed colour`.
- [ ] **Fix A3 — Explicit, testable state tokens** (refined's acceptance criteria as executable tests). Add `tests/unit/theme/row-states.test.ts`: for every preset, (a) hover ≠ zebra by ≥ 0.04 OKLab, (b) hover on odd and even rows is one colour (the token is opaque hex), (c) text/hover ≥ 4.5:1, (d) ring ≥ 3:1 against background and against hover. No production change if the earlier tests already cover; this commit *consolidates* them and adds (d). Commit `test(theme): pin the explicit row and focus states for every preset`.
- [ ] **Fix A4 — Ghost secondary toolbar buttons** ("secondary buttons ghost until hover"). Files: the Activity toolbar buttons "Columns", "Edit sorts", "Clear sorts" (`ActivityTable.svelte` footer, `variant="outline"` → `variant="ghost"` keeping a hover fill and visible focus ring). Acceptance: **A4a** buttons have no resting border, hover fill appears, focus ring visible; **A4b** still obviously clickable (labels + icons intact) on desktop and mobile. Commit `fix(grid): secondary toolbar buttons are ghost until hover`.
- [ ] **Fix A5 — Toolbar controls on the 4-based scale** (search 36px vs pills 28px are off-rhythm). Files: `routes/+page.svelte` toolbar row: give the segmented toggle, search and filter button the same height (`h-9` = 36px) via classes. Acceptance: **A5a** computed heights of the three controls are equal at 1440 and 390; **A5b** no wrap regressions. Commit `fix(layout): toolbar controls share one height`.
- [ ] **Step: Ship the awesome-design palettes.** Combine refined, minimal and clean: refined's ten (`4-…` `## 5`), then minimal's and clean's, **dropping any palette that is within OKLab distance 0.03 of an earlier one on both `background` and `primary`** (the three share text so many will be near-duplicates), targeting about 12 distinct total. ids `aw-<kebab-name>`. Record which were dropped in the log.
- [ ] **Step: Branch wrap-up** as Task 1.

### Task 5: Cross-branch report

- [ ] **Step 1:** For each branch: commits (with verdicts and rounds), which fixes were abandoned, test/check results, clip names, and the palettes added.
- [ ] **Step 2:** A comparison table of overlapping ideas (muted type icon, tabular numerals, swatch previews, toggle styling, zebra) showing which branches implement them and any visible differences.
- [ ] **Step 3:** Restore state: check out `main` in the worktree, clear the theme key in the browser, close the tab this run opened; leave the dev server running only if the owner wants it.
