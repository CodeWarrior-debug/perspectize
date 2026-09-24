# Design Universal Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, inline in one session (each task needs live browser judgement, so per-task subagents would lose the context). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the eight design fixes that every design-review tool independently agreed on, one commit per fix, each judged against live desktop and mobile video clips, then ship them as one PR to `main` and merge it.

**Architecture:** Grid colours move from hard-coded hex to theme tokens (new derived row tokens live in `src/lib/theme/derive.ts`, so presets and custom themes both get them); the rest are small, isolated layout/copy/focus changes. Every fix follows the same loop: implement → unit test where the unit is stateful/pure → commit → record a desktop and a mobile clip of the Activity table filtered to YouTube → judge → amend (max 5 rounds) or drop.

**Tech Stack:** SvelteKit 2 / Svelte 5, Tailwind v4 tokens (`--color-*`), AG Grid 32.3.9 (`themeQuartz.withParams`), culori, Vitest, Chrome DevTools MCP + CDP screencast + imageio-ffmpeg.

**Spec:** the research behind this plan lives on branch `docs/design-feedbacks-from-systems` (untracked in the main checkout at `/Users/jamesjordan/GitHub/perspectize/docs/design-feedback/`): `14-drive-synthesis.md` (§3 signal table, §5 consolidated top 10) and `7-design-synthesis-and-recommendations.md`. The eight fixes below are restated in full here so this plan stands alone.

## Global Constraints

- Branch `feature/design-universal-fixes` in worktree `/Users/jamesjordan/GitHub/perspectize/.claude/worktrees/design-fixes`, from `origin/main` (bc174ba). Never touch other worktrees, especially `.claude/worktrees/validate` (it serves the user's running dev server on :5173 from `feature/add-bible-content-types`).
- **One commit per fix**, conventional-commit format (`fix(grid): …`, `feat(grid): …`). A judged-not-good round is `git commit --amend`, keeping one commit per fix. If five rounds fail, `git reset --hard HEAD~1` and log the fix as abandoned.
- **No chained bash (`&&`).** One command per Bash call. Use `pnpm --dir <path>` / `git -C <path>` rather than `cd`.
- Do not read, copy, or print env secret files. Do not sign in or handle credentials; if the signed-in Chrome profile is signed out, stop and ask the human.
- **Read-only against app data** when verifying (no Save/Add/Delete/Submit). Theme switching is browser-local; restore the theme to the default (`perspectize-theme` key absent) after every clip.
- **Clips are Activity table filtered to YouTube first** (`?f.type=youtube`), then recording starts. Bible passages are out of scope.
- Keep code clean: no dead code, no `!important` unless AG Grid forces it (comment why), constants named, comments say *why*. Match surrounding style (tabs, single quotes; run prettier via the pre-commit hook or `pnpm --dir frontend exec prettier --write <files>`).
- Test policy (user's testing principles): stateful/pure logic gets tests naming each state; single-state static UI gets none.
- Videos are named `sv-<fix-id>-<round>-<desktop|mobile>.mp4` and saved to `~/Downloads/screenshots/`. Do **not** upload videos or screenshots anywhere public without asking the human.
- Never paste the private frontend deployment URL from `CLAUDE.local.md` anywhere.
- No `make migrate-*`. No backend changes.

## Review Focus

- Opaque hover paints **over** row content (AG Grid draws hover on `.ag-row-hover::before`): if title/thumbnail text vanishes on hover, the fix fails (Task 3 acceptance check H4).
- Dark presets whose `primary` is nearly the page background (Midnight `#0d1b33` on `#0d1421`, Terminal): a hover tinted from `primary` would be invisible; row tokens must fall back to the foreground tint.
- Users who already have a custom theme cached in `localStorage` (`perspectize-theme-applied`) lack the new row tokens until `applyThemeToDom` runs on mount; the default `@theme` values must therefore be sane, and the store must re-apply.
- `themeQuartz.withParams` accepting `var(--…)` strings: verify AG Grid actually resolves them (computed colours change with theme), not just that the code compiles.
- Card mode (<860px) unmounts the grid entirely: hover/header changes must be checked on desktop; the mobile clip verifies the card list and layout fixes (gutters, FAB clearance, empty state).
- Header focus ring on the navy header must contrast with `--color-primary` in every theme (use `--color-primary-foreground`, not `--color-ring`).

---

## File Structure

| Path | Change |
|------|--------|
| `frontend/src/lib/utils/grid-theme.ts` | **Create.** Pure `GRID_THEME_PARAMS` (all colours are `var(--color-*)`), consumed by `ActivityTable.svelte`. |
| `frontend/tests/unit/grid-theme.test.ts` | **Create.** Every colour param is a token reference; no raw hex. |
| `frontend/src/lib/theme/derive.ts` | Add `rowAlt`, `rowHover`, `rowAccent` derived tokens + `--color-row-*` CSS vars. |
| `frontend/src/lib/theme/store.svelte.ts` | Add the three vars to `clearInlineThemeVars`. |
| `frontend/src/app.css` | Default `@theme` row tokens, regenerated preset blocks, hover-bar rule, quiet-header rules. |
| `frontend/src/lib/components/ActivityTable.svelte` | Use `GRID_THEME_PARAMS`. |
| `frontend/src/lib/utils/formatting.ts` | One empty-value glyph; `formatCountExact(null)` returns `''`. |
| `frontend/src/routes/+page.svelte` | Activity page container matches header/PageWrapper width. |
| `frontend/src/routes/compare/+page.svelte` | Real empty state with a way out. |
| `frontend/src/lib/components/PageWrapper.svelte` | Bottom clearance for the Messages button. |
| `frontend/src/lib/components/Header.svelte` | Visible `focus-visible` rings. |
| `~/.claude/tools/video-capture/record-clip.mjs` | Saved recorder (outside the repo; do not delete). |

`SCRATCH=/private/tmp/claude-501/-Users-jamesjordan-GitHub-perspectize/60d62a5e-f586-4932-bd37-64c4d6393b23/scratchpad`
`WT=/Users/jamesjordan/GitHub/perspectize/.claude/worktrees/design-fixes`
`APP=http://localhost:5174` (this worktree's dev server; the human's :5173 is a different branch).

## The eight fixes (why each is "universal")

| ID | Fix | Agreement |
|----|-----|-----------|
| F1 | Grid takes its colours from theme tokens (dark themes stop showing a white table with unreadable titles) | 6/6 round 1, 5/5 round 2 |
| F2 | Opaque row hover, clearly distinct from a faint zebra, plus a left accent bar | 6/6, 5/5 (bar 5/5) |
| F3 | Quiet grid header: muted band, no `\|` dividers, filter icons only on hover/active | 6/6, 4/5 |
| F4 | One "empty value" glyph (`—`); no tooltip for an empty count | 6/6, 5/5 |
| F5 | Activity page uses the same container width/gutter as header and other pages | 5/5 |
| F6 | Compare with nothing selected shows a real empty state with an action | 5/5 |
| F7 | Messages button never covers the footer/last card | 3/5 |
| F8 | Visible focus rings on header controls | round 1 several, round 2 several |

Deliberately **not** here (single-tool, so they go to the option branches): fixing the flattened `muted-foreground`/ring/primary in `derive.ts` presets, column-picker label parity, warm-paper default, palettes, zebra-off, grid-cell focus.

---

### Task 0: Environment, recording tooling, baseline clips

**Files:**
- No repo changes (the recorder already exists at `~/.claude/tools/video-capture/`).

**Interfaces:**
- Produces: a dev server for this worktree at `$APP`; the saved recorder recording the YouTube-filtered Activity table.

- [ ] **Step 1: Dev server for this worktree**

The worktree has no env file, and tooling must not read or copy one. **Human step:** ask the human to run, in a prompt with the `!` prefix:
`! cp /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/validate/frontend/<their env file> /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/design-fixes/frontend/<same name>`
(or to create it by hand). Then start the server in the background:
Run: `pnpm --dir /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/design-fixes/frontend exec vite dev --port 5174 --strictPort` (`run_in_background`).
Expected: `Local: http://localhost:5174/`.
Then `curl -s -o /dev/null -w "%{http_code}" http://localhost:5174/` → `200`.

- [ ] **Step 2: Confirm the signed-in session carries over**

With chrome-devtools: `new_page` `http://localhost:5174/?f.type=youtube`, `take_screenshot`. Expected: the Activity table with YouTube rows, not a sign-in screen. If signed out (Clerk keeps a per-origin session) → stop and ask the human to sign in once at `http://localhost:5174/` via `.claude/scripts/sv-chrome.sh`; never handle credentials.

- [ ] **Step 3: Recording tool (already saved, do not rewrite)**

The recorder is saved at `~/.claude/tools/video-capture/record-clip.mjs` (README beside it; noted in `~/.claude/rules/video-capture.md`). It attaches to the signed-in Chrome on :9222, screencasts frames, drives trusted mouse input, overlays a red pointer dot, and encodes with a bundled ffmpeg (`./.venv`). Usage:
`node ~/.claude/tools/video-capture/record-clip.mjs --out <mp4> --url "http://localhost:5174/?f.type=youtube" [--mode desktop|mobile] [--theme midnight]`
A tab for the URL must already be open in that Chrome (chrome-devtools `new_page`). Do not delete or rewrite the tool; extend it only by adding a scenario branch.

- [ ] **Step 4: Numeric hover checker**

Run the function below via chrome-devtools `evaluate_script` after a real hover (`hover` on a row uid) on row 0, then row 1:

```js
() => {
	const rows = [...document.querySelectorAll('.ag-center-cols-container .ag-row')].slice(0, 4);
	const root = document.documentElement;
	const wrapper = getComputedStyle(document.querySelector('.ag-root-wrapper'));
	const token = (n) => getComputedStyle(root).getPropertyValue(n).trim();
	return {
		theme: root.getAttribute('data-theme') ?? 'reading-room',
		rows: rows.map((r, i) => {
			const title = r.querySelector('[data-testid="item-title"]');
			return {
				i,
				hovered: r.classList.contains('ag-row-hover'),
				rowBg: getComputedStyle(r).backgroundColor,
				overlayBg: getComputedStyle(r, '::before').backgroundColor,
				overlayShadow: getComputedStyle(r, '::before').boxShadow,
				titleColor: title ? getComputedStyle(title).color : null,
			};
		}),
		tokens: {
			rowAlt: token('--color-row-alt'),
			rowHover: token('--color-row-hover'),
			rowAccent: token('--color-row-accent'),
			background: token('--color-background'),
		},
		agVars: {
			bg: wrapper.getPropertyValue('--ag-background-color').trim(),
			odd: wrapper.getPropertyValue('--ag-odd-row-background-color').trim(),
			hover: wrapper.getPropertyValue('--ag-row-hover-color').trim(),
			header: wrapper.getPropertyValue('--ag-header-background-color').trim(),
		},
	};
};
```

- [ ] **Step 5: Baseline clips (before any change) — DONE**

Recorded: `~/Downloads/screenshots/sv-baseline-desktop.mp4`, `sv-baseline-mobile.mp4`, `sv-baseline-desktop-midnight.mp4`. Baseline defects confirmed on screen: Midnight keeps light rows with near-invisible Item titles; `|` header dividers and filter icons on every column; `--` in Tags; Messages button over the pagination footer.
**Known limit (existing behaviour, not a fix target):** below 860px the grid is replaced by the card list, which does not apply the `f.type=youtube` filter (the filter lives in the AG Grid filter model), so mobile clips also show Bible items after the first YouTube rows. Record mobile as-is and say so in the log.

- [ ] **Step 7: Judging rubric (used in every task below)**

After each round, view ≥6 frames per clip (`fps=1`) and the numeric checker output, then record one verdict in `$SCRATCH/execution-log.md`:
- **PASS**: every acceptance check true, no visual regression on desktop or mobile.
- **CLOSE**: one acceptance check off by a small tweak (a constant, a class). Adjust, `--amend`, re-record.
- **PROGRESS**: better than the previous round but ≥2 checks failing.
- **DISTANT**: approach is wrong (e.g. overlay covers text). Rethink before the next round.
- **REGRESSION**: something that worked before broke. Fix or drop.
Max 5 rounds. Round 5 not PASS → `git reset --hard HEAD~1`, log "abandoned", continue.

---

### Task 1 (F1): Grid follows the theme tokens

**Files:**
- Create: `frontend/src/lib/utils/grid-theme.ts`
- Create: `frontend/tests/unit/grid-theme.test.ts`
- Modify: `frontend/src/lib/components/ActivityTable.svelte` (the `themeQuartz.withParams({...})` block, ~lines 444-466)

**Interfaces:**
- Produces: `GRID_THEME_PARAMS` (const object) and `GRID_COLOR_PARAM_KEYS` (readonly string[]), exported from `$lib/utils/grid-theme`. Later tasks edit this file only.

- [ ] **Step 1: Write the failing test** — `frontend/tests/unit/grid-theme.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { GRID_COLOR_PARAM_KEYS, GRID_THEME_PARAMS } from '$lib/utils/grid-theme';

describe('GRID_THEME_PARAMS', () => {
	it('takes every colour from a theme token so the grid follows the picker', () => {
		for (const key of GRID_COLOR_PARAM_KEYS) {
			const value = GRID_THEME_PARAMS[key as keyof typeof GRID_THEME_PARAMS];
			expect(String(value), key).toMatch(/var\(--color-[a-z-]+\)|color-mix\(|^transparent$/);
			expect(String(value), key).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
		}
	});

	it('keeps the 64px row height that avoids clipped descenders', () => {
		expect(GRID_THEME_PARAMS.rowHeight).toBe(64);
	});
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `pnpm --dir /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/design-fixes/frontend exec vitest run --project unit tests/unit/grid-theme.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `frontend/src/lib/utils/grid-theme.ts`

```ts
/**
 * AG Grid theme params for the Activity table. Colours are token references, not hex, so the
 * grid follows the theme picker (presets and custom themes) like the rest of the app. AG Grid
 * emits each param as a CSS custom property, so `var(--color-*)` resolves at paint time.
 * Row hover/zebra tokens are added by the row-token fix; until then hover stays a faint primary tint.
 */
export const GRID_THEME_PARAMS = {
	fontFamily: "'Geist', system-ui, sans-serif",
	fontSize: 14,
	headerFontWeight: 600,
	headerBackgroundColor: 'var(--color-primary)',
	headerTextColor: 'var(--color-primary-foreground)',
	backgroundColor: 'var(--color-background)',
	foregroundColor: 'var(--color-foreground)',
	borderColor: 'var(--color-border)',
	accentColor: 'var(--color-primary)',
	oddRowBackgroundColor: 'var(--color-muted)',
	rowHoverColor: 'color-mix(in srgb, var(--color-primary) 6%, transparent)',
	selectedRowBackgroundColor: 'color-mix(in srgb, var(--color-primary) 8%, transparent)',
	columnHoverColor: 'transparent',
	headerColumnResizeHandleColor: 'var(--color-primary-foreground)',
	// 64px comfortably fits a 32px thumbnail alongside a 2-line, 13px/1.5-leading title
	// with margin to spare — a tighter value clips descenders (g/y/p/q/j) on the second
	// line via the row's own overflow:hidden, even though line-clamp itself only ever
	// cuts whole lines. See CLAUDE.md's AG Grid gotcha.
	rowHeight: 64,
	headerHeight: 40,
	listItemHeight: 24,
} as const;

/** Params whose value is a colour — the ones that must never be hard-coded. */
export const GRID_COLOR_PARAM_KEYS = Object.keys(GRID_THEME_PARAMS).filter((k) => /Color$/.test(k));
```

Then in `ActivityTable.svelte` replace the literal `themeQuartz.withParams({ ... })` object with `themeQuartz.withParams(GRID_THEME_PARAMS)` and add `import { GRID_THEME_PARAMS } from '$lib/utils/grid-theme';` beside the other `$lib/utils` imports. Keep the row-height explanatory comment (it moved into `grid-theme.ts`; delete the copy in the component).

- [ ] **Step 4: Run tests + type-check**

Run: `pnpm --dir …/frontend exec vitest run --project unit tests/unit/grid-theme.test.ts` → PASS.
Run: `pnpm --dir …/frontend run check` → 0 new errors vs `origin/main` baseline (record the baseline count first with `git stash`-free approach: run `check` once before Task 1 on the clean branch and note it).

- [ ] **Step 5: Commit**

```bash
git -C $WT add frontend/src/lib/utils/grid-theme.ts frontend/tests/unit/grid-theme.test.ts frontend/src/lib/components/ActivityTable.svelte
git -C $WT commit -m "fix(grid): take Activity table colours from theme tokens"
```

- [ ] **Step 6: Record and judge (loop, max 5 rounds)**

Record `sv-F1-r<N>-desktop.mp4`, `sv-F1-r<N>-mobile.mp4`, `sv-F1-r<N>-desktop-midnight.mp4`, and run the checker in Midnight.
Acceptance:
- **G1** Midnight: `agVars.bg` resolves to Midnight's `--color-background` (dark), not `#ffffff`.
- **G2** Midnight: Item title colour contrast against the row background ≥ 4.5:1 (compute from `titleColor` and `rowBg`).
- **G3** Reading Room (default): grid looks the same as baseline (white rows, navy header) to the eye.
- **G4** Archive: header follows the theme (brown-toned), not navy.
- **G5** Mobile clip: card list unchanged.
Verdict logged; amend (`git commit --amend --no-edit` after edits) on CLOSE/PROGRESS.

---

### Task 2 (F2): Opaque row hover distinct from a faint zebra, with a left accent bar

**Files:**
- Modify: `frontend/src/lib/theme/derive.ts`, `frontend/src/lib/theme/store.svelte.ts` (`clearInlineThemeVars`), `frontend/src/app.css`, `frontend/src/lib/utils/grid-theme.ts`
- Test: `frontend/tests/unit/theme/derive.test.ts` (extend), `frontend/tests/unit/grid-theme.test.ts` (extend)

**Interfaces:**
- Consumes: `deriveTheme`, `THEME_PRESETS` (`src/lib/theme/presets.ts`), `GRID_THEME_PARAMS` from Task 1.
- Produces: `DerivedTokens.rowAlt`, `.rowHover`, `.rowAccent`; CSS vars `--color-row-alt`, `--color-row-hover`, `--color-row-accent`.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/tests/unit/theme/derive.test.ts` (follow the file's existing import style; add `wcagContrast, differenceEuclidean` from `culori`):

```ts
describe('row tokens', () => {
	const oklabDistance = differenceEuclidean('oklab');

	it.each(THEME_PRESETS.map((p) => [p.id, p] as const))(
		'%s: hover is opaque, clearly distinct from the zebra, and keeps text readable',
		(_id, preset) => {
			const t = deriveTheme(preset.base);
			expect(t.rowHover).toMatch(/^#[0-9a-f]{6}$/);
			expect(t.rowAlt).toMatch(/^#[0-9a-f]{6}$/);
			expect(t.rowHover).not.toBe(t.rowAlt);
			expect(oklabDistance(t.rowHover, t.rowAlt)).toBeGreaterThanOrEqual(0.04);
			expect(wcagContrast(t.foreground, t.rowHover)).toBeGreaterThanOrEqual(4.5);
			expect(wcagContrast(t.foreground, t.rowAlt)).toBeGreaterThanOrEqual(4.5);
		},
	);

	it('tints hover from the foreground when primary is nearly the page colour (dark presets)', () => {
		const midnight = deriveTheme(THEME_PRESETS.find((p) => p.id === 'midnight')!.base);
		expect(midnight.rowAccent).toBe(midnight.foreground);
		const light = deriveTheme(THEME_PRESETS[0].base);
		expect(light.rowAccent).toBe(light.primary);
	});

	it('exposes the row tokens as CSS variables', () => {
		const vars = toCssVarMap(deriveTheme(THEME_PRESETS[0].base));
		expect(Object.keys(vars)).toEqual(
			expect.arrayContaining(['--color-row-alt', '--color-row-hover', '--color-row-accent']),
		);
	});
});
```

Append to `grid-theme.test.ts`:

```ts
it('draws hover and zebra from the row tokens', () => {
	expect(GRID_THEME_PARAMS.rowHoverColor).toBe('var(--color-row-hover)');
	expect(GRID_THEME_PARAMS.oddRowBackgroundColor).toBe('var(--color-row-alt)');
});
```

- [ ] **Step 2: Run, expect failures** — `pnpm --dir …/frontend exec vitest run --project unit tests/unit/theme/derive.test.ts tests/unit/grid-theme.test.ts` → FAIL.

- [ ] **Step 3: Implement the tokens in `derive.ts`**

Import `interpolate`: `import { converter, formatHex, interpolate, wcagContrast } from 'culori';`. Add to `DerivedTokens`:

```ts
	rowAlt: string;
	rowHover: string;
	rowAccent: string;
```

Add above `deriveTheme`:

```ts
/** Zebra is a whisper of the foreground over the background, so it reads on light and dark alike. */
const ROW_ALT_MIX = 0.025;
/** Hover must be clearly stronger than the zebra; the unit tests pin the minimum distance. */
const ROW_HOVER_MIX = 0.12;
/** Below this contrast a primary tint would be invisible against the page (Midnight, Terminal). */
const MIN_ROW_ACCENT_CONTRAST = 1.5;

function mix(fromHex: string, toHex: string, amount: number): string {
	return formatHex(interpolate([fromHex, toHex], 'oklab')(amount)) ?? fromHex;
}

/**
 * Row colours are opaque so hover looks identical on odd and even rows (an alpha overlay
 * composites differently over the zebra stripe). Dark themes often ship a primary that is
 * nearly the background, so those tint from the foreground instead.
 */
function deriveRowTokens(background: string, foreground: string, primary: string) {
	const accent = wcagContrast(background, primary) >= MIN_ROW_ACCENT_CONTRAST ? primary : foreground;
	return {
		rowAlt: mix(background, foreground, ROW_ALT_MIX),
		rowHover: mix(background, accent, ROW_HOVER_MIX),
		rowAccent: accent,
	};
}
```

In `deriveTheme`'s returned object add `...deriveRowTokens(background, foreground, base.primary),`. In `toCssVarMap` add:

```ts
		'--color-row-alt': tokens.rowAlt,
		'--color-row-hover': tokens.rowHover,
		'--color-row-accent': tokens.rowAccent,
```

In `store.svelte.ts` add `'--color-row-alt'`, `'--color-row-hover'`, `'--color-row-accent'` to the `props` list in `clearInlineThemeVars`.

- [ ] **Step 4: app.css — default tokens, regenerated presets, hover bar**

Run: `pnpm --dir …/frontend exec tsx -e "import {deriveTheme,toCssVarMap} from './src/lib/theme/derive.ts'; import {THEME_PRESETS} from './src/lib/theme/presets.ts'; const v=toCssVarMap(deriveTheme(THEME_PRESETS[0].base)); for (const k of ['--color-row-alt','--color-row-hover','--color-row-accent']) console.log('\t'+k+': '+v[k]+';')"`
Paste those three lines into the default `@theme` block after `--color-ring` under a `/* Theme/Light — Rows */` comment.
Run: `pnpm --dir …/frontend exec tsx gen-preset-css.mjs` and replace the four `[data-theme=…]` blocks in `app.css` with its output. `git diff` on `app.css` must show **only** the three added lines per block (if any other line changed, stop and investigate: the presets file and CSS had drifted).
Append the hover bar rule to `app.css` (after the `.ag-cell` font rules):

```css
/* Hover bar — drawn on AG Grid's own hover overlay so it sits on top of the opaque hover colour. */
.ag-row-hover:not(.ag-full-width-row)::before {
	box-shadow: inset 3px 0 0 var(--color-row-accent);
}
```

- [ ] **Step 5: Point the grid at the tokens** — in `grid-theme.ts` set:

```ts
	oddRowBackgroundColor: 'var(--color-row-alt)',
	rowHoverColor: 'var(--color-row-hover)',
	selectedRowBackgroundColor: 'var(--color-row-hover)',
```

and update its doc comment (delete the "until the row-token fix" sentence).

- [ ] **Step 6: Run tests, prettier, type-check** — `vitest run --project unit` (full unit project), `pnpm --dir …/frontend run check`. If `export.test.ts` or `theme-store.test.ts` enumerates token lists, update them to include the three new tokens.

- [ ] **Step 7: Commit**

```bash
git -C $WT add frontend/src/lib/theme frontend/src/app.css frontend/src/lib/utils/grid-theme.ts frontend/tests
git -C $WT commit -m "feat(grid): opaque row hover distinct from zebra, with an accent bar"
```

- [ ] **Step 8: Record and judge (max 5 rounds)**

Acceptance (use `check-hover.js` after real hovers on row 0 and row 1, in Reading Room and Midnight):
- **H1** Hover overlay colour is identical on row 0 (odd) and row 1 (even).
- **H2** Hover overlay colour ≠ zebra colour, and visibly so in the clip (not just numerically: view frames).
- **H3** `overlayShadow` contains `3px` and the accent colour on the hovered row only.
- **H4** Title text and thumbnail remain fully visible while hovered (overlay does not cover content). If it does, fall back: keep `rowHoverColor` transparent-safe by moving the tint onto cells (`.ag-row-hover .ag-cell { background-color: var(--color-row-hover); }`) and drawing the bar on the first cell; re-run.
- **H5** Midnight: hover is visibly lighter than the rows; bar is light.
- **H6** Mobile clip: card list unaffected.

---

### Task 3 (F3): Quiet grid header

**Files:** Modify `frontend/src/lib/utils/grid-theme.ts`, `frontend/src/app.css`. Test: extend `grid-theme.test.ts`.

- [ ] **Step 1: Failing test** (append to `grid-theme.test.ts`):

```ts
it('uses a quiet header: muted band, foreground labels, no column dividers', () => {
	expect(GRID_THEME_PARAMS.headerBackgroundColor).toBe('var(--color-muted)');
	expect(GRID_THEME_PARAMS.headerTextColor).toBe('var(--color-foreground)');
	expect(GRID_THEME_PARAMS.headerColumnBorder).toBe(false);
});
```

- [ ] **Step 2: Implement** — in `grid-theme.ts`:

```ts
	headerBackgroundColor: 'var(--color-muted)',
	headerTextColor: 'var(--color-foreground)',
	headerColumnBorder: false,
	headerColumnResizeHandleColor: 'var(--color-border)',
```

and in `app.css` (near the other AG Grid rules):

```css
/* Filter buttons show on hover/focus or when a filter is active, so the header reads as labels first. */
.ag-header-cell:not(.ag-header-cell-filtered) .ag-header-cell-filter-button {
	opacity: 0;
	transition: opacity 0.15s ease;
}
.ag-header-cell:hover .ag-header-cell-filter-button,
.ag-header-cell:focus-within .ag-header-cell-filter-button {
	opacity: 1;
}
```

- [ ] **Step 3: Run tests, commit** — `git -C $WT commit -am "feat(grid): quiet header with muted band and no column dividers"` (add new files explicitly if any).

- [ ] **Step 4: Record and judge (max 5 rounds).** Acceptance:
- **Q1** Header background = `--color-muted`, text = foreground weight 600, in Reading Room and Midnight (numeric + frames).
- **Q2** No visible `|` between header cells at rest.
- **Q3** Filter icon invisible at rest, visible on header hover, and always visible on a column with an active filter (apply a filter by hand only if the human allows; otherwise verify the CSS rule via computed `opacity` on hover).
- **Q4** Column resize still works (drag one column edge in the clip).
- **Q5** Header still clearly separates from the body (border/contrast visible).

---

### Task 4 (F4): One empty-value glyph

**Files:** Modify `frontend/src/lib/utils/formatting.ts` (the `'--'` returns near lines 151, 162, 219, 227, 235), `frontend/src/lib/utils/activityTooltipSpecs.ts` if it special-cases the value. Tests: `frontend/tests/unit/formatting.test.ts`, `formatting-perspective.test.ts`.

- [ ] **Step 1:** In `formatting.ts` add near the top: `export const EMPTY_VALUE = '—';` with a comment: `// The single "no value" glyph for grid cells; keep new formatters on it.` Replace every literal `'--'` and `'—'` return in the grid formatters with `EMPTY_VALUE`.
- [ ] **Step 2: Failing test** — read the existing tests for `formatCount`, `formatCountExact`, tags/description formatters; change their expectations from `'--'` to `'—'`, and add:

```ts
it('formatCountExact returns an empty string (no tooltip) for a null count', () => {
	expect(formatCountExact(null)).toBe('');
});
```

- [ ] **Step 3:** Make `formatCountExact(null)` return `''`. Read `activityTooltipSpecs.ts` `views`/`likes` specs: confirm an empty string means no tooltip opens (the popover opens only on a non-empty string). If a spec calls `formatCountExact(null)` and expects a non-empty value, guard there instead.
- [ ] **Step 4:** Run `vitest run --project unit` (all), fix any other expectations. `grep -rn "'--'" frontend/src frontend/tests` must show no remaining grid-formatter `'--'`.
- [ ] **Step 5: Commit** — `git -C $WT commit -am "fix(grid): one empty-value glyph and no tooltip for empty counts"`.
- [ ] **Step 6: Record and judge (max 5).** Acceptance:
- **E1** In the clip, empty Views/Likes/Tags/Description cells all show the same `—`.
- **E2** Hovering an empty Views/Likes cell opens **no** tooltip (screenshot after a 1.5 s hover).
- **E3** Populated cells still show their tooltip.

---

### Task 5 (F5): Activity page container matches the rest of the app

**Files:** Modify `frontend/src/routes/+page.svelte` (page header block and content card, ~lines 62-145).

- [ ] **Step 1:** Header uses `px-4 md:px-6 lg:px-8 max-w-screen-xl mx-auto` and `PageWrapper` the same. On the Activity route add `mx-auto w-full max-w-screen-xl` to (a) the `<div class="px-4 md:px-6 lg:px-8 py-4 md:py-6">` title block and (b) the `<div class="flex-1 min-h-0 px-4 md:px-6 lg:px-8 pb-4">` card wrapper, so their padding and max width equal the header's. Do not change the vertical layout (`h-[calc(100vh-4rem)]`).
- [ ] **Step 2:** No unit test (static layout, single state). Run `check`.
- [ ] **Step 3: Commit** — `git -C $WT commit -am "fix(layout): align Activity page gutters with the header and other pages"`.
- [ ] **Step 4: Record and judge (max 5).** Acceptance (numeric via `evaluate_script` at 1440 wide):
- **P1** Left edge of the H1 title equals the left edge of the header logo text within 1px (`getBoundingClientRect().left`), and equals the Discover page's H1 left edge.
- **P2** Grid card left/right edges align with the title block.
- **P3** At 1440 the grid card is ≤ 1280 wide, centred; at 390 mobile no horizontal scroll.

---

### Task 6 (F6): Compare empty state

**Files:** Modify `frontend/src/routes/compare/+page.svelte`.

- [ ] **Step 1:** Replace the bare `<div>` in the `{:else}` branch with:

```svelte
	<div class="mx-auto flex max-w-[880px] flex-col items-center gap-4 px-5 py-16 text-center">
		<h1 class="text-xl font-semibold text-foreground">Choose something to compare</h1>
		<p class="max-w-md text-muted-foreground">
			Compare puts two perspectives on the same content side by side. Open it from a piece of
			content's details in Activity.
		</p>
		<Button href="/">Go to Activity</Button>
	</div>
```

and import `Button` from the shadcn barrel used elsewhere (`import { Button } from '$lib/components/shadcn';` — confirm the barrel path with `grep -rn "shadcn" src/lib/components/AddVideoPopover.svelte`).
- [ ] **Step 2:** Route files are excluded from coverage and the branch is a two-state route (content chosen vs not): add `frontend/tests/components/CompareRoute.test.ts` only if `tests/helpers/TestWrapper.svelte` can mount a route with a stubbed `page` store; if not feasible, note "verified by clip" in the log and skip the test.
- [ ] **Step 3: Commit** — `git -C $WT commit -am "feat(compare): empty state with a way back to Activity"`.
- [ ] **Step 4: Record and judge.** Load `$APP/compare` (no params) on desktop and mobile, screenshot/clip. Acceptance:
- **C1** Heading, one-sentence explanation and a "Go to Activity" button are visible and centred.
- **C2** The button navigates to `/` (click in the clip; Activity loads).
- **C3** Content aligns to the page gutter; no overflow at 390.

---

### Task 7 (F7): Messages button never covers content

**Files:** Modify `frontend/src/lib/components/PageWrapper.svelte`, `frontend/src/routes/+page.svelte` (Activity card wrapper bottom padding), `frontend/tests/components/PageWrapper.test.ts` if it asserts the class list.

- [ ] **Step 1:** The floating button is `fixed bottom-5 right-5 size-14` (76 px of clearance incl. margin). In `PageWrapper.svelte` change `py-6 md:py-8` handling so the bottom padding is `pb-24`: `class="px-4 pt-6 md:px-6 md:pt-8 lg:px-8 pb-24 max-w-screen-xl mx-auto {className}"`. On the Activity route change the card wrapper's `pb-4` to `pb-20` so pagination controls stay clear of the button.
- [ ] **Step 2:** Update `PageWrapper.test.ts` expectations if they name the old padding classes.
- [ ] **Step 3: Commit** — `git -C $WT commit -am "fix(layout): keep the Messages button clear of page content"`.
- [ ] **Step 4: Record and judge.** Acceptance (signed in, so the button renders):
- **M1** Activity desktop: the button's bounding box does not intersect the grid pagination footer or the last row (numeric rect intersection = none).
- **M2** Discover and Compare, scrolled to the bottom: the button does not overlap the last card/footer.
- **M3** Mobile: scrolled to the end of the card list, the last card is fully visible above the button.

---

### Task 8 (F8): Visible focus on header controls

**Files:** Modify `frontend/src/lib/components/Header.svelte`; `frontend/tests/components/Header.test.ts` only if it asserts class strings.

- [ ] **Step 1:** Add a shared constant in the script block and append it to the nav links and the Settings button classes:

```ts
	// The header sits on --color-primary, so the ring uses --color-primary-foreground (always
	// contrasts with it) rather than --color-ring, which is near-invisible on dark presets.
	const focusRing =
		'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/80 focus-visible:ring-offset-2 focus-visible:ring-offset-primary';
```

Apply `{focusRing}` to: the logo link, each nav link, and the Settings button.
- [ ] **Step 2:** Single-state static styling: no unit test. `check`.
- [ ] **Step 3: Commit** — `git -C $WT commit -am "fix(a11y): visible focus rings on header controls"`.
- [ ] **Step 4: Record and judge.** Use real `press_key` Tab from the top of the page. Acceptance:
- **A1** In Reading Room, Tab to each nav link and Settings: a light 2px ring with offset is visible in a screenshot.
- **A2** Same in Midnight and Terminal (where `--color-ring` would be invisible).
- **A3** Mouse clicks do not show the ring (focus-visible only).

---

### Task 9: Whole-branch verification, PR, merge

- [ ] **Step 1: Full checks.** Run separately: `pnpm --dir …/frontend run check`, `pnpm --dir …/frontend run test:run`, `pnpm --dir …/frontend exec prettier --check src tests`. Expected: check errors ≤ the recorded `origin/main` baseline, all tests pass. If the known-flaky AddVideoDialog test fails alone, re-run that file once and note it.
- [ ] **Step 2: Final clips of the finished branch** (desktop, mobile, desktop-Midnight) as `sv-final-*.mp4`; view frames; confirm all eight fixes together.
- [ ] **Step 3: Docs.** Update `frontend/docs/DESIGN_SPEC.md` where it prescribes the old stripe/hover/header (search for "3%" and "6%" and the grid header colour) so the spec matches the code. Commit: `git -C $WT commit -am "docs(design): update grid spec for row tokens, quiet header"`. If the spec has no such lines, skip.
- [ ] **Step 4: Session reflection** (the pre-PR hook requires `/revise-claude-md` before `gh pr create`; per project memory it is a command, not a skill): do the reflection inline, add any new durable learnings to `frontend/CLAUDE.md` (e.g. "grid colours come from `grid-theme.ts` tokens; row tokens live in `derive.ts`; hover is painted on `.ag-row-hover::before`"), commit `docs(claude): note grid token wiring`.
- [ ] **Step 5: Push and open the PR via `gh api`** (not `gh pr create`), using the `feature.md` template shape (Feature Description, Technical Changes, Demo, Test Plan): `git -C $WT push -u origin feature/design-universal-fixes`, then `gh api repos/CodeWarrior-debug/perspectize/pulls -f title="feat(design): apply the eight universally agreed design fixes" -F body=@<file> -f head="feature/design-universal-fixes" -f base="main"`. The Demo section lists the local clip names and states they were verified locally; **do not upload videos/screenshots to a release without asking the human** (they show a signed-in session).
- [ ] **Step 6: CI, then merge.** Run `gh pr checks <n> --watch`. When green: `gh pr merge <n> --squash --delete-branch --admin`. If CI fails, fix on the branch (new commit), re-run. Do not merge on red.
- [ ] **Step 7: Clean up.** Stop the :5174 dev server; remove the temporary env file the human placed in this worktree if they want (ask); `git -C /Users/jamesjordan/GitHub/perspectize worktree remove` only with the human's OK. Restore browser state (close the tab this run opened; theme key absent).
