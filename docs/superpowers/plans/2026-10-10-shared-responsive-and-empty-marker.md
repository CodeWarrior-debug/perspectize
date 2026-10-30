# Shared responsive tiers + faint empty marker (#577, slices 1 and theming) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the responsive-tier and card-mode breakpoints in one module used by Activity and Plan, and render every null/empty cell marker (`—`) fainter from one shared, token-based rule in the grids and the Plan card list.

**Architecture:** A new `responsive.svelte.ts` wraps Svelte's `MediaQuery` and exposes `useResponsiveTier()` / `useCardMode()` plus the breakpoint constants. A new `grid-empty.ts` owns the empty-cell predicate and class; `app.css` styles that class with a theme token (`color-mix` of `--color-muted-foreground`). `EMPTY_VALUE` (formatting.ts) becomes the only dash literal.

**Tech Stack:** SvelteKit / Svelte 5 runes, AG Grid (ag-grid-svelte5), Vitest (unit + jsdom component), Tailwind v4 tokens.

**Spec:** GitHub issue #577 (steps 1 of "Suggested order" and the "Empty cells" addition). Branch is stacked on `feature/user-todos` (PR #576) because `PlanTable` only exists there.

## Global Constraints

- No raw hex/rgb in `src/lib/components/**` (pre-commit colour guard); colours come from theme tokens.
- Existing test ids stay: `ag-grid-container`, `activity-card-list`, `plan-grid-container`, `plan-card-list`, `plan-card-type`.
- Breakpoints stay exactly: tiers `min-width` 445 / 640 / 900px; card mode `max-width: 859px`.
- No chained `&&` shell commands; run targeted tests only (not full suites) while iterating.
- Do not run migrations. No GitHub issue creation. Do not push without the user's go-ahead.

## Review Focus

- Viewport exactly 859px / 860px and 444/445, 639/640, 899/900: correct tier and card flag at each edge (Task 1 test).
- `window.matchMedia` absent (SSR / jsdom without mock): defaults to tier `lg`, card mode `false`, no throw (Task 1 test).
- A real value that merely looks like a dash (e.g. `'-'`, `'—x'`) must NOT get the faint class (Task 2 test).
- Value `0`, `''`, `false` are not "empty" markers; only the exact `EMPTY_VALUE` string is (Task 2 test).
- High-contrast / dark themes: the faint marker stays visible (Task 4 browser check under `midnight` plus a high-contrast preset).

---

### Task 1: Shared responsive module

**Files:**
- Create: `frontend/src/lib/utils/responsive.svelte.ts`
- Test: `frontend/tests/unit/responsive.test.ts`

**Interfaces:**
- Produces: `GRID_BREAKPOINTS = { sm: 445, md: 640, lg: 900, cardMax: 859 }`; `tierFromMatches(m: { sm: boolean; md: boolean; lg: boolean }): ResponsiveTier`; `useResponsiveTier(): { readonly current: ResponsiveTier }`; `useCardMode(): { readonly current: boolean }`. Both hooks are called during component init.
- Consumes: `ResponsiveTier` from `$lib/utils/grid-config`.

- [ ] **Step 1: Write the failing test** (`tests/unit/responsive.test.ts`)

```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { GRID_BREAKPOINTS, tierFromMatches, useResponsiveTier, useCardMode } from '$lib/utils/responsive.svelte';

function setViewport(width: number) {
	window.matchMedia = vi.fn((query: string) => {
		const min = /min-width:\s*(\d+)px/.exec(query);
		const max = /max-width:\s*(\d+)px/.exec(query);
		const matches = min ? width >= Number(min[1]) : max ? width <= Number(max[1]) : false;
		return { matches, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() };
	}) as unknown as typeof window.matchMedia;
}

const original = window.matchMedia;
afterEach(() => {
	window.matchMedia = original;
});

describe('tierFromMatches', () => {
	it('picks the widest matching tier', () => {
		expect(tierFromMatches({ sm: true, md: true, lg: true })).toBe('lg');
		expect(tierFromMatches({ sm: true, md: true, lg: false })).toBe('md');
		expect(tierFromMatches({ sm: true, md: false, lg: false })).toBe('sm');
		expect(tierFromMatches({ sm: false, md: false, lg: false })).toBe('xs');
	});
});

describe('useResponsiveTier / useCardMode', () => {
	it.each([
		[444, 'xs'],
		[445, 'sm'],
		[639, 'sm'],
		[640, 'md'],
		[899, 'md'],
		[900, 'lg'],
	])('width %i -> tier %s', (width, tier) => {
		setViewport(width);
		const cleanup = $effect.root(() => {
			expect(useResponsiveTier().current).toBe(tier);
		});
		cleanup();
	});

	it.each([
		[859, true],
		[860, false],
	])('width %i -> card mode %s', (width, card) => {
		setViewport(width);
		const cleanup = $effect.root(() => {
			expect(useCardMode().current).toBe(card);
		});
		cleanup();
	});

	it('exposes the breakpoint constants', () => {
		expect(GRID_BREAKPOINTS).toEqual({ sm: 445, md: 640, lg: 900, cardMax: 859 });
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run (in `frontend/`): `pnpm exec vitest run --project unit tests/unit/responsive.test.ts`
Expected: FAIL, cannot resolve `$lib/utils/responsive.svelte`.

- [ ] **Step 3: Implement** (`src/lib/utils/responsive.svelte.ts`)

```ts
import { MediaQuery } from 'svelte/reactivity';
import type { ResponsiveTier } from './grid-config';

/** The one place the grid breakpoints live. Tiers are min-width; card mode is below `cardMax + 1`. */
export const GRID_BREAKPOINTS = { sm: 445, md: 640, lg: 900, cardMax: 859 } as const;

export function tierFromMatches(m: { sm: boolean; md: boolean; lg: boolean }): ResponsiveTier {
	if (m.lg) return 'lg';
	if (m.md) return 'md';
	if (m.sm) return 'sm';
	return 'xs';
}

/** Reactive progressive-column tier. Fallbacks (no window) are the widest tier. */
export function useResponsiveTier(): { readonly current: ResponsiveTier } {
	const sm = new MediaQuery(`min-width: ${GRID_BREAKPOINTS.sm}px`, true);
	const md = new MediaQuery(`min-width: ${GRID_BREAKPOINTS.md}px`, true);
	const lg = new MediaQuery(`min-width: ${GRID_BREAKPOINTS.lg}px`, true);
	return {
		get current() {
			return tierFromMatches({ sm: sm.current, md: md.current, lg: lg.current });
		},
	};
}

/** Reactive card-list flag: below 860px the grid is replaced by stacked cards. */
export function useCardMode(): { readonly current: boolean } {
	const card = new MediaQuery(`max-width: ${GRID_BREAKPOINTS.cardMax}px`, false);
	return {
		get current() {
			return card.current;
		},
	};
}
```

- [ ] **Step 4: Run to verify it passes** — same command; Expected: PASS. If `$effect.root` is unavailable in the unit project, drop the wrapper and call the hooks directly (MediaQuery reads work outside effects); keep the assertions.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/utils/responsive.svelte.ts frontend/tests/unit/responsive.test.ts
git commit -m "feat(frontend): shared responsive tier and card-mode hooks"
```

### Task 2: Adopt the hooks in ActivityTable and PlanTable

**Files:**
- Modify: `frontend/src/lib/components/ActivityTable.svelte` (state at ~208 and the two `$effect` blocks at ~1255-1288)
- Modify: `frontend/src/lib/components/plan/PlanTable.svelte` (state `tier` at ~54 and the two effects at ~105-139)
- Test: existing `tests/components/ActivityTable.test.ts`, `tests/components/PlanTable.test.ts` (must still pass unchanged)

**Interfaces:**
- Consumes: `useResponsiveTier`, `useCardMode` from Task 1.

- [ ] **Step 1: PlanTable.** Add `import { useResponsiveTier, useCardMode } from '$lib/utils/responsive.svelte';`. Replace `let tier = $state<ResponsiveTier>('lg');` and the `cardMode` state with `const responsive = useResponsiveTier();` and `const card = useCardMode();`, then replace every read of `tier` with `responsive.current` and `cardMode` with `card.current` (the visibility effect uses `planColumnsForTier(responsive.current)`; the clear-on-card-mode effect reads `card.current`; the template `{#if card.current}`). Delete the two `matchMedia` `$effect` blocks. Drop the now-unused `ResponsiveTier` import if nothing else uses it.
- [ ] **Step 2: ActivityTable.** Same replacement: `responsiveTier` -> `responsive.current`, `cardMode` -> `card.current`; delete the two `matchMedia` effects (the "Responsive breakpoint detection" and "Card-mode breakpoint" blocks). Keep all other effects.
- [ ] **Step 3: Verify no stragglers**

Run: `grep -n "matchMedia\|responsiveTier\|cardMode" frontend/src/lib/components/ActivityTable.svelte frontend/src/lib/components/plan/PlanTable.svelte`
Expected: no `matchMedia`; no leftover bare `responsiveTier`/`cardMode` identifiers (only `responsive.current` / `card.current`). Check any child props passed `cardMode`.
- [ ] **Step 4: Run targeted tests**

Run: `pnpm exec vitest run --project unit tests/components/PlanTable.test.ts tests/components/ActivityTable.test.ts tests/unit/responsive.test.ts` and `pnpm run check`
Expected: PASS, 0 svelte-check errors. The existing `setViewport` mocks provide `addEventListener`, which `MediaQuery` uses.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/components/ActivityTable.svelte frontend/src/lib/components/plan/PlanTable.svelte
git commit -m "refactor(frontend): Activity and Plan share the responsive hooks"
```

### Task 3: Shared faint empty marker (grids + Plan cards)

**Files:**
- Create: `frontend/src/lib/utils/grid-empty.ts`
- Create: `frontend/src/lib/components/EmptyAware.svelte`
- Modify: `frontend/src/lib/utils/plan-grid-config.ts` (replace `PLAN_EMPTY` with `EMPTY_VALUE`)
- Modify: `frontend/tests/unit/plan-grid-config.test.ts` (rename `PLAN_EMPTY` references)
- Modify: `frontend/src/lib/components/ActivityTable.svelte:955` (literal `'—'` -> `EMPTY_VALUE`) and `defaultColDef` (~1066)
- Modify: `frontend/src/lib/components/plan/PlanTable.svelte` (`defaultColDef` in `buildGridOptions`; card list status line)
- Modify: `frontend/src/app.css` (rule next to `.ag-cell`, ~995)
- Test: `frontend/tests/unit/grid-empty.test.ts`, `frontend/tests/components/EmptyAware.test.ts`

**Interfaces:**
- Produces: `EMPTY_CLASS = 'empty-marker'`; `isEmptyMarker(v: unknown): boolean` (true only for the exact `EMPTY_VALUE` string); `emptyCellClassRules: Record<string, (p: { value?: unknown; formattedValue?: unknown }) => boolean>`; component `EmptyAware` with prop `text: string` rendering `<span class="empty-marker">` iff `isEmptyMarker(text)`.

- [ ] **Step 1: Write failing tests**

`tests/unit/grid-empty.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { EMPTY_CLASS, emptyCellClassRules, isEmptyMarker } from '$lib/utils/grid-empty';
import { EMPTY_VALUE } from '$lib/utils/formatting';

describe('isEmptyMarker', () => {
	it('is true only for the exact empty marker', () => {
		expect(isEmptyMarker(EMPTY_VALUE)).toBe(true);
	});
	it.each(['-', '—x', '', 0, false, null, undefined])('is false for %s', (v) => {
		expect(isEmptyMarker(v)).toBe(false);
	});
});

describe('emptyCellClassRules', () => {
	const rule = emptyCellClassRules[EMPTY_CLASS];
	it('matches on the formatted value (what the user sees)', () => {
		expect(rule({ value: null, formattedValue: EMPTY_VALUE })).toBe(true);
		expect(rule({ value: 'x', formattedValue: 'x' })).toBe(false);
	});
});
```

`tests/components/EmptyAware.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import EmptyAware from '$lib/components/EmptyAware.svelte';

describe('EmptyAware', () => {
	it('marks the empty dash', () => {
		render(EmptyAware, { text: '—' });
		expect(screen.getByText('—')).toHaveClass('empty-marker');
	});
	it('leaves real values unmarked', () => {
		render(EmptyAware, { text: 'Done' });
		expect(screen.getByText('Done')).not.toHaveClass('empty-marker');
	});
});
```

- [ ] **Step 2: Run to verify fail** — `pnpm exec vitest run --project unit tests/unit/grid-empty.test.ts tests/components/EmptyAware.test.ts`; Expected: FAIL (modules missing).
- [ ] **Step 3: Implement**

`src/lib/utils/grid-empty.ts`:
```ts
import { EMPTY_VALUE } from './formatting';

/** Class on any cell/inline text showing the empty marker; styled once in app.css. */
export const EMPTY_CLASS = 'empty-marker';

export function isEmptyMarker(v: unknown): boolean {
	return v === EMPTY_VALUE;
}

/** AG Grid `cellClassRules` for `defaultColDef`: a valueFormatter can only return text, so style via class. */
export const emptyCellClassRules: Record<string, (p: { value?: unknown; formattedValue?: unknown }) => boolean> = {
	[EMPTY_CLASS]: (p) => isEmptyMarker(p.formattedValue ?? p.value),
};
```

`src/lib/components/EmptyAware.svelte`:
```svelte
<script lang="ts">
	import { EMPTY_CLASS, isEmptyMarker } from '$lib/utils/grid-empty';

	let { text }: { text: string } = $props();
</script>

<span class={isEmptyMarker(text) ? EMPTY_CLASS : undefined}>{text}</span>
```

`app.css` (after the `.ag-cell` rule):
```css
/* One faint style for every "no value" dash (grids and cards). Token-based, so it follows the theme. */
.empty-marker {
	color: color-mix(in srgb, var(--color-muted-foreground) 55%, transparent);
}
```

Wiring:
- `plan-grid-config.ts`: `import { EMPTY_VALUE } from './formatting';` replace all `PLAN_EMPTY` with `EMPTY_VALUE` and delete the `PLAN_EMPTY` export; update `tests/unit/plan-grid-config.test.ts` the same way.
- `ActivityTable.svelte`: import `EMPTY_VALUE` (if not already) and `emptyCellClassRules`; line 955 -> `params.value == null ? EMPTY_VALUE : String(params.value)`; `defaultColDef: { resizable: true, cellClassRules: emptyCellClassRules }`.
- `PlanTable.svelte` `buildGridOptions`: add `defaultColDef: { cellClassRules: emptyCellClassRules }`. In the card list replace the status line with `<EmptyAware text={todo.action.label} /> · <EmptyAware text={planStatusLabel(todo.status)} /> · <EmptyAware text={planPercentLabel(todo.percentComplete)} />` inside the same `<span class="text-muted-foreground text-xs">`, and wrap `planListLabel(...)`/`planTypeLabel(...)` the same way. Keep `data-testid="plan-card-type"` on the span containing the type text.

- [ ] **Step 4: Run to verify pass** — `pnpm exec vitest run --project unit tests/unit/grid-empty.test.ts tests/components/EmptyAware.test.ts tests/unit/plan-grid-config.test.ts tests/components/PlanTable.test.ts tests/components/ActivityTable.test.ts`, then `pnpm run check`. Expected: PASS, 0 errors. Add one assertion to `PlanTable.test.ts` that the grid's `defaultColDef.cellClassRules` is `emptyCellClassRules` (`grid.props.gridOptions` is captured by the mock), and one to `ActivityTable.test.ts` likewise if its mock exposes options; otherwise cover it in browser verification (Task 4).
- [ ] **Step 5: Commit**

```bash
git add frontend/src frontend/tests
git commit -m "feat(frontend): one faint, token-based marker for empty cells"
```

### Task 4: Verify under a dark theme and record evidence

**Files:** none (evidence only; clips/screenshots to `~/Downloads/screenshots/` with `sv-` prefix).

- [ ] **Step 1:** `pnpm run check` and `pnpm exec vitest run --project unit` once at the end (allowed before push; do not run before this step).
- [ ] **Step 2:** Start the worktree frontend in demo mode (see `.docs/DEMO_MODE.md`; `make demo-*`), open Plan and Activity in the signed-in Chrome on :9222 (never enter credentials; ask the user to re-login if signed out).
- [ ] **Step 3:** Capture the faint dash on Plan and Activity under default theme, `midnight` and one high-contrast preset (`frontend/src/lib/theme/presets.ts`); record a clip with `node ~/.claude/tools/video-capture/record-clip.mjs --out ~/Downloads/screenshots/sv-empty-marker-themes.mp4 --url <plan url> --theme midnight`. Also a 375px-wide card-list screenshot.
- [ ] **Step 4:** Resize across 859/860px and confirm grid/card switching and column reveal still work (the point of Task 2).
- [ ] **Step 5:** Report results; do not upload publicly or push without the user's go-ahead.
