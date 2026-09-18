# Compare Perspectives Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/compare` page that lets a signed-in user deep-dive-compare their perspective on a piece of content against another user's perspective on the same content, reached from the header nav and from `ActivityDetailsModal`.

**Architecture:** Frontend-only (no backend/schema changes). One new GraphQL query variant (existing `perspectives` field, filtered by `contentID`), one pure comparison-logic utility module (unit tested), a `Compare.svelte` orchestrator component with four small sub-components, and two entry points wired into existing components (`Header.svelte`, `ActivityDetailsModal.svelte`).

**Tech Stack:** SvelteKit + Svelte 5 runes, TanStack Svelte Query, `graphql-request`, Tailwind v4 tokens from `frontend/src/app.css`, native HTML `<select>` (not shadcn Select — see Global Constraints), Vitest + @testing-library/svelte.

**Spec:** `docs/superpowers/specs/2026-09-16-compare-perspectives-page-design.md`

## Global Constraints

- No backend/schema/resolver changes — the existing `perspectives(filter: PerspectiveFilter)` query already supports `contentID` and the backend's default `RestrictToPublicOrOwner` authorization already enforces the privacy-gating rule (a perspective private to someone else is never returned).
- Replace every occurrence of the prototype's `#a3a3a3` text color with `var(--color-muted-foreground)` (`#525252`) — the prototype's own accessibility bug, not a design choice to preserve.
- Use **native `<select>`** elements for the left/right user pickers, not the shadcn `Select` (bits-ui) component — matches the design handoff and matches this codebase's own established testing precedent (`FilterBar.test.ts`'s comment: "bits-ui Select interactions are not reliably testable in jsdom").
- New components live flat under `frontend/src/lib/components/` (not a `compare/` subfolder), matching the existing convention (`ActivityDetailsModal.svelte`, `UserActivityView.svelte`).
- Follow Svelte 5 runes only (`$state`, `$derived`, `$props`, `$effect`) — no Svelte 4 syntax (see `frontend/CLAUDE.md`).
- `queryKey` must mirror every variable `queryFn` actually sends (see `frontend/CLAUDE.md` gotcha) — every new `createQuery` call in this plan follows that rule.
- Rating values are stored 0–10000, displayed 0.000–10.000 via `ratingToDisplay`/`displayToRating` (`frontend/src/lib/utils/ratings.ts`) — the comparison module works in **display units** (post-`ratingToDisplay`, parsed back to `number`) so its thresholds (1.0 / 3.0) match the handoff's stated scale.
- Per Testing Principles: only components/modules with real state or branching get unit/component tests. Static layout (spacing, colors) is verified visually, not unit-tested.
- Co-author trailer on every commit: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

## Task 1: `LIST_PERSPECTIVES_BY_CONTENT` query

**Files:**
- Modify: `frontend/src/lib/queries/perspectives/index.ts`
- Modify: `frontend/src/lib/queries/keys.ts`

**Interfaces:**
- Produces: `LIST_PERSPECTIVES_BY_CONTENT` (gql document), `type ListPerspectivesByContentResponse = { perspectives: { items: PerspectiveItem[] } }`, `queryKeys.perspectives.listByContent(contentId: number)`.
- Consumes: existing `PERSPECTIVE_FIELDS` fragment and `PerspectiveItem` interface already in `frontend/src/lib/queries/perspectives/index.ts`.

- [ ] **Step 1: Add the query key**

In `frontend/src/lib/queries/keys.ts`, inside the existing `perspectives` block (alongside `listByUser`), add:

```ts
		listByContent: (contentId: number) =>
			[...queryKeys.perspectives.lists(), { contentId }] as const,
```

- [ ] **Step 2: Add the query document + response type**

In `frontend/src/lib/queries/perspectives/index.ts`, after the existing `LIST_PERSPECTIVES_BY_USER` export, add:

```ts
export interface ListPerspectivesByContentResponse {
	perspectives: {
		items: PerspectiveItem[];
	};
}

// Compare page: every perspective on one content row, public + viewer's own
// private (the backend's default RestrictToPublicOrOwner authorization does
// this scoping server-side — this is the whole privacy-gating enforcement
// point, no client-side filtering needed on top of it).
export const LIST_PERSPECTIVES_BY_CONTENT = gql`
	${PERSPECTIVE_FIELDS}
	query ListPerspectivesByContent($contentID: IntID) {
		perspectives(filter: { contentID: $contentID }) {
			items {
				...PerspectiveFields
			}
		}
	}
`;
```

- [ ] **Step 3: Verify it type-checks**

Run: `cd frontend && pnpm run check`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/queries/perspectives/index.ts frontend/src/lib/queries/keys.ts
git commit -m "$(cat <<'EOF'
feat(frontend): add perspectives-by-content query for compare page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Comparison-logic utility module + unit tests

**Files:**
- Create: `frontend/src/lib/utils/comparePerspectives.ts`
- Test: `frontend/tests/utils/comparePerspectives.test.ts`

**Interfaces:**
- Consumes: `PerspectiveItem`, `FeelingEntry` from `$lib/queries/perspectives` (Task 1's module); `ratingToDisplay` from `$lib/utils/ratings`.
- Produces (consumed by Task 4's `Compare.svelte` and Task 5's `CompareRatingTable.svelte`):
  - `type RatingStatus = 'similar' | 'diverges' | 'conflict'`
  - `interface RatingRow { key: string; label: string; leftDisplay: number; rightDisplay: number; delta: number; pctDiff: number; status: RatingStatus }`
  - `interface FilledInDifferentlyRow { key: string; label: string; side: 'left' | 'right'; display: number }`
  - `interface FeelingComparison { shared: { emoji: string; label: string | null }[]; leftOnly: { emoji: string; label: string | null }[]; rightOnly: { emoji: string; label: string | null }[] }`
  - `interface OverallComparison { left: string | null; right: string | null; agree: boolean }` (`left`/`right` are `'THUMBS_UP' | 'THUMBS_DOWN' | null`)
  - `interface ComparisonSummary { similar: number; diverges: number; conflict: number }`
  - `function compareRatings(left: PerspectiveItem, right: PerspectiveItem): RatingRow[]`
  - `function filledInDifferently(left: PerspectiveItem, right: PerspectiveItem): FilledInDifferentlyRow[]`
  - `function compareFeelings(left: PerspectiveItem, right: PerspectiveItem): FeelingComparison`
  - `function compareOverall(left: PerspectiveItem, right: PerspectiveItem): OverallComparison`
  - `function summarize(rows: RatingRow[]): ComparisonSummary`
  - `function sortRatingRows(rows: RatingRow[], desc: boolean): RatingRow[]` (sorts by `delta`; does not mutate input)
  - `const SIMILAR_THRESHOLD = 1.0`, `const DIVERGES_THRESHOLD = 3.0` (exported constants)

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/utils/comparePerspectives.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
	compareRatings,
	filledInDifferently,
	compareFeelings,
	compareOverall,
	summarize,
	sortRatingRows,
	SIMILAR_THRESHOLD,
	DIVERGES_THRESHOLD,
} from '$lib/utils/comparePerspectives';
import type { PerspectiveItem } from '$lib/queries/perspectives';

function makePerspective(overrides: Partial<PerspectiveItem>): PerspectiveItem {
	return {
		id: '1',
		userID: '1',
		contentID: '1',
		quality: null,
		agreement: null,
		importance: null,
		confidence: null,
		like: null,
		review: null,
		privacy: 'PUBLIC',
		description: null,
		primaryPerspectiveID: null,
		relatedPerspectiveIDs: null,
		customFields: null,
		feelings: null,
		createdAt: '2026-01-01T00:00:00Z',
		updatedAt: '2026-01-01T00:00:00Z',
		...overrides,
	};
}

describe('compareRatings', () => {
	it('excludes a dimension where either side is null', () => {
		const left = makePerspective({ quality: 8000, agreement: null });
		const right = makePerspective({ quality: null, agreement: 8000 });
		expect(compareRatings(left, right)).toEqual([]);
	});

	it('classifies a delta at or below 1.0 as similar', () => {
		const left = makePerspective({ quality: 8000 }); // 8.0
		const right = makePerspective({ quality: 7000 }); // 7.0, delta 1.0
		const [row] = compareRatings(left, right);
		expect(row.status).toBe('similar');
		expect(row.delta).toBeCloseTo(1.0);
	});

	it('classifies a delta just above 1.0 up to 3.0 as diverges', () => {
		const left = makePerspective({ quality: 8000 });
		const right = makePerspective({ quality: 5000 }); // delta 3.0
		const [row] = compareRatings(left, right);
		expect(row.status).toBe('diverges');
	});

	it('classifies a delta above 3.0 as conflict', () => {
		const left = makePerspective({ quality: 10000 });
		const right = makePerspective({ quality: 0 }); // delta 10.0
		const [row] = compareRatings(left, right);
		expect(row.status).toBe('conflict');
		expect(row.pctDiff).toBeCloseTo(100);
	});

	it('compares every shared standard dimension', () => {
		const left = makePerspective({ quality: 8000, agreement: 8000, importance: 8000, confidence: 8000 });
		const right = makePerspective({ quality: 8000, agreement: 8000, importance: 8000, confidence: 8000 });
		expect(compareRatings(left, right).map((r) => r.key).sort()).toEqual(
			['agreement', 'confidence', 'importance', 'quality'].sort(),
		);
	});

	it('compares shared numeric customFields keys', () => {
		const left = makePerspective({ customFields: { pacing: 6000 } });
		const right = makePerspective({ customFields: { pacing: 4000 } });
		const rows = compareRatings(left, right);
		expect(rows.find((r) => r.key === 'pacing')?.delta).toBeCloseTo(2.0);
	});

	it('skips a customFields key present on only one side', () => {
		const left = makePerspective({ customFields: { pacing: 6000 } });
		const right = makePerspective({ customFields: {} });
		expect(compareRatings(left, right).find((r) => r.key === 'pacing')).toBeUndefined();
	});
});

describe('filledInDifferently', () => {
	it('lists a dimension only the left side filled in', () => {
		const left = makePerspective({ quality: 8000 });
		const right = makePerspective({ quality: null });
		const rows = filledInDifferently(left, right);
		expect(rows).toEqual([{ key: 'quality', label: 'Quality', side: 'left', display: 8.0 }]);
	});

	it('lists a dimension only the right side filled in', () => {
		const left = makePerspective({ confidence: null });
		const right = makePerspective({ confidence: 9000 });
		const rows = filledInDifferently(left, right);
		expect(rows).toEqual([{ key: 'confidence', label: 'Confidence', side: 'right', display: 9.0 }]);
	});

	it('excludes a dimension both sides filled in', () => {
		const left = makePerspective({ quality: 8000 });
		const right = makePerspective({ quality: 7000 });
		expect(filledInDifferently(left, right)).toEqual([]);
	});

	it('excludes a dimension neither side filled in', () => {
		const left = makePerspective({});
		const right = makePerspective({});
		expect(filledInDifferently(left, right)).toEqual([]);
	});
});

describe('compareFeelings', () => {
	it('matches shared feelings by label', () => {
		const left = makePerspective({ feelings: [{ emoji: '🤔', label: 'curious', intensity: 5000, note: null }] });
		const right = makePerspective({ feelings: [{ emoji: '🤔', label: 'curious', intensity: 3000, note: null }] });
		const result = compareFeelings(left, right);
		expect(result.shared).toEqual([{ emoji: '🤔', label: 'curious' }]);
		expect(result.leftOnly).toEqual([]);
		expect(result.rightOnly).toEqual([]);
	});

	it('falls back to emoji when label is null', () => {
		const left = makePerspective({ feelings: [{ emoji: '😀', label: null, intensity: 5000, note: null }] });
		const right = makePerspective({ feelings: [{ emoji: '😀', label: null, intensity: 5000, note: null }] });
		expect(compareFeelings(left, right).shared).toEqual([{ emoji: '😀', label: null }]);
	});

	it('sorts non-matching feelings into leftOnly/rightOnly', () => {
		const left = makePerspective({ feelings: [{ emoji: '😀', label: 'happy', intensity: 5000, note: null }] });
		const right = makePerspective({ feelings: [{ emoji: '😢', label: 'sad', intensity: 5000, note: null }] });
		const result = compareFeelings(left, right);
		expect(result.leftOnly).toEqual([{ emoji: '😀', label: 'happy' }]);
		expect(result.rightOnly).toEqual([{ emoji: '😢', label: 'sad' }]);
		expect(result.shared).toEqual([]);
	});

	it('handles null feelings arrays on either side', () => {
		const left = makePerspective({ feelings: null });
		const right = makePerspective({ feelings: null });
		expect(compareFeelings(left, right)).toEqual({ shared: [], leftOnly: [], rightOnly: [] });
	});
});

describe('compareOverall', () => {
	it('agrees when both thumbs match', () => {
		const left = makePerspective({ like: 'THUMBS_UP' });
		const right = makePerspective({ like: 'THUMBS_UP' });
		expect(compareOverall(left, right)).toEqual({ left: 'THUMBS_UP', right: 'THUMBS_UP', agree: true });
	});

	it('differs when thumbs are opposite', () => {
		const left = makePerspective({ like: 'THUMBS_UP' });
		const right = makePerspective({ like: 'THUMBS_DOWN' });
		expect(compareOverall(left, right).agree).toBe(false);
	});

	it('differs when either side has no thumb set', () => {
		const left = makePerspective({ like: 'THUMBS_UP' });
		const right = makePerspective({ like: null });
		expect(compareOverall(left, right).agree).toBe(false);
	});
});

describe('summarize', () => {
	it('counts rows by status', () => {
		const rows = [
			{ key: 'a', label: 'A', leftDisplay: 0, rightDisplay: 0, delta: 0, pctDiff: 0, status: 'similar' as const },
			{ key: 'b', label: 'B', leftDisplay: 0, rightDisplay: 0, delta: 2, pctDiff: 20, status: 'diverges' as const },
			{ key: 'c', label: 'C', leftDisplay: 0, rightDisplay: 0, delta: 10, pctDiff: 100, status: 'conflict' as const },
			{ key: 'd', label: 'D', leftDisplay: 0, rightDisplay: 0, delta: 0.5, pctDiff: 5, status: 'similar' as const },
		];
		expect(summarize(rows)).toEqual({ similar: 2, diverges: 1, conflict: 1 });
	});
});

describe('sortRatingRows', () => {
	const rows = [
		{ key: 'a', label: 'A', leftDisplay: 0, rightDisplay: 0, delta: 3, pctDiff: 30, status: 'diverges' as const },
		{ key: 'b', label: 'B', leftDisplay: 0, rightDisplay: 0, delta: 1, pctDiff: 10, status: 'similar' as const },
	];

	it('sorts ascending by delta when desc is false', () => {
		expect(sortRatingRows(rows, false).map((r) => r.key)).toEqual(['b', 'a']);
	});

	it('sorts descending by delta when desc is true', () => {
		expect(sortRatingRows(rows, true).map((r) => r.key)).toEqual(['a', 'b']);
	});

	it('does not mutate the input array', () => {
		const copy = [...rows];
		sortRatingRows(rows, true);
		expect(rows).toEqual(copy);
	});
});

describe('thresholds', () => {
	it('exposes the exact handoff-specified cutoffs', () => {
		expect(SIMILAR_THRESHOLD).toBe(1.0);
		expect(DIVERGES_THRESHOLD).toBe(3.0);
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && pnpm exec vitest run tests/utils/comparePerspectives.test.ts`
Expected: FAIL — `comparePerspectives` module not found.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/utils/comparePerspectives.ts`:

```ts
/**
 * Pure comparison logic for the Compare Perspectives page. Given two
 * PerspectiveItems on the same content, computes per-dimension rating
 * comparisons, "filled in differently" rows, feelings overlap, and overall
 * (thumbs) agreement. No I/O, no Svelte — unit tested directly.
 */
import type { PerspectiveItem, FeelingEntry } from '$lib/queries/perspectives';
import { ratingToDisplay } from '$lib/utils/ratings';

export type RatingStatus = 'similar' | 'diverges' | 'conflict';

export interface RatingRow {
	key: string;
	label: string;
	leftDisplay: number;
	rightDisplay: number;
	delta: number;
	pctDiff: number;
	status: RatingStatus;
}

export interface FilledInDifferentlyRow {
	key: string;
	label: string;
	side: 'left' | 'right';
	display: number;
}

export interface FeelingRef {
	emoji: string;
	label: string | null;
}

export interface FeelingComparison {
	shared: FeelingRef[];
	leftOnly: FeelingRef[];
	rightOnly: FeelingRef[];
}

export interface OverallComparison {
	left: string | null;
	right: string | null;
	agree: boolean;
}

export interface ComparisonSummary {
	similar: number;
	diverges: number;
	conflict: number;
}

/** Handoff-specified thresholds, in display units (0.0-10.0 scale). */
export const SIMILAR_THRESHOLD = 1.0;
export const DIVERGES_THRESHOLD = 3.0;

const STANDARD_DIMENSIONS: { key: 'quality' | 'agreement' | 'importance' | 'confidence'; label: string }[] = [
	{ key: 'quality', label: 'Quality' },
	{ key: 'agreement', label: 'Agreement' },
	{ key: 'importance', label: 'Importance' },
	{ key: 'confidence', label: 'Confidence' },
];

function statusFor(delta: number): RatingStatus {
	if (delta <= SIMILAR_THRESHOLD) return 'similar';
	if (delta <= DIVERGES_THRESHOLD) return 'diverges';
	return 'conflict';
}

function toDisplay(value: number): number {
	return Number(ratingToDisplay(value));
}

/** Numeric-only entries of customFields, coercing string numbers, skipping the rest. */
function numericCustomFields(customFields: Record<string, unknown> | null): Map<string, number> {
	const result = new Map<string, number>();
	if (!customFields) return result;
	for (const [key, value] of Object.entries(customFields)) {
		const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
		if (!Number.isNaN(num)) result.set(key, num);
	}
	return result;
}

function labelFor(key: string): string {
	const standard = STANDARD_DIMENSIONS.find((d) => d.key === key);
	if (standard) return standard.label;
	return key.charAt(0).toUpperCase() + key.slice(1);
}

export function compareRatings(left: PerspectiveItem, right: PerspectiveItem): RatingRow[] {
	const rows: RatingRow[] = [];

	for (const { key, label } of STANDARD_DIMENSIONS) {
		const leftValue = left[key];
		const rightValue = right[key];
		if (leftValue === null || rightValue === null) continue;
		const leftDisplay = toDisplay(leftValue);
		const rightDisplay = toDisplay(rightValue);
		const delta = Math.abs(leftDisplay - rightDisplay);
		rows.push({
			key,
			label,
			leftDisplay,
			rightDisplay,
			delta,
			pctDiff: (delta / 10) * 100,
			status: statusFor(delta),
		});
	}

	const leftCustom = numericCustomFields(left.customFields as Record<string, unknown> | null);
	const rightCustom = numericCustomFields(right.customFields as Record<string, unknown> | null);
	for (const [key, leftRaw] of leftCustom) {
		if (!rightCustom.has(key)) continue;
		const rightRaw = rightCustom.get(key)!;
		const leftDisplay = toDisplay(leftRaw);
		const rightDisplay = toDisplay(rightRaw);
		const delta = Math.abs(leftDisplay - rightDisplay);
		rows.push({
			key,
			label: labelFor(key),
			leftDisplay,
			rightDisplay,
			delta,
			pctDiff: (delta / 10) * 100,
			status: statusFor(delta),
		});
	}

	return rows;
}

export function filledInDifferently(left: PerspectiveItem, right: PerspectiveItem): FilledInDifferentlyRow[] {
	const rows: FilledInDifferentlyRow[] = [];
	for (const { key, label } of STANDARD_DIMENSIONS) {
		const leftValue = left[key];
		const rightValue = right[key];
		if (leftValue !== null && rightValue === null) {
			rows.push({ key, label, side: 'left', display: toDisplay(leftValue) });
		} else if (leftValue === null && rightValue !== null) {
			rows.push({ key, label, side: 'right', display: toDisplay(rightValue) });
		}
	}
	return rows;
}

function feelingKey(f: FeelingEntry): string {
	return f.label ?? f.emoji;
}

export function compareFeelings(left: PerspectiveItem, right: PerspectiveItem): FeelingComparison {
	const leftFeelings = left.feelings ?? [];
	const rightFeelings = right.feelings ?? [];
	const rightByKey = new Map(rightFeelings.map((f) => [feelingKey(f), f]));
	const matchedRightKeys = new Set<string>();

	const shared: FeelingRef[] = [];
	const leftOnly: FeelingRef[] = [];
	for (const f of leftFeelings) {
		const key = feelingKey(f);
		if (rightByKey.has(key)) {
			shared.push({ emoji: f.emoji, label: f.label });
			matchedRightKeys.add(key);
		} else {
			leftOnly.push({ emoji: f.emoji, label: f.label });
		}
	}
	const rightOnly = rightFeelings
		.filter((f) => !matchedRightKeys.has(feelingKey(f)))
		.map((f) => ({ emoji: f.emoji, label: f.label }));

	return { shared, leftOnly, rightOnly };
}

export function compareOverall(left: PerspectiveItem, right: PerspectiveItem): OverallComparison {
	const agree = left.like !== null && right.like !== null && left.like === right.like;
	return { left: left.like, right: right.like, agree };
}

export function summarize(rows: RatingRow[]): ComparisonSummary {
	const summary: ComparisonSummary = { similar: 0, diverges: 0, conflict: 0 };
	for (const row of rows) summary[row.status]++;
	return summary;
}

export function sortRatingRows(rows: RatingRow[], desc: boolean): RatingRow[] {
	return [...rows].sort((a, b) => (desc ? b.delta - a.delta : a.delta - b.delta));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && pnpm exec vitest run tests/utils/comparePerspectives.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/utils/comparePerspectives.ts frontend/tests/utils/comparePerspectives.test.ts
git commit -m "$(cat <<'EOF'
feat(frontend): add comparePerspectives utility for compare page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `ComparePickerRow.svelte` (user pickers + swap button)

**Files:**
- Create: `frontend/src/lib/components/ComparePickerRow.svelte`
- Test: `frontend/tests/components/ComparePickerRow.test.ts`

**Interfaces:**
- Consumes props: `{ options: { id: string; name: string }[]; leftId: string; rightId: string; onLeftChange: (id: string) => void; onRightChange: (id: string) => void; onSwap: () => void }`. `options` is the full eligible candidate list (already privacy-filtered upstream by Task 4).
- Produces: renders two native `<select>`s (`data-testid="picker-left"` / `data-testid="picker-right"`) each excluding the *other* side's currently-selected id from its own option list, plus a swap button (`aria-label="Swap sides"`).

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/components/ComparePickerRow.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ComparePickerRow from '$lib/components/ComparePickerRow.svelte';

const options = [
	{ id: '1', name: 'You' },
	{ id: '2', name: 'Jamie Lee' },
	{ id: '3', name: 'Alex Kim' },
];

describe('ComparePickerRow', () => {
	it('renders both selects with the current selections', () => {
		render(ComparePickerRow, {
			props: { options, leftId: '1', rightId: '2', onLeftChange: vi.fn(), onRightChange: vi.fn(), onSwap: vi.fn() },
		});
		expect(screen.getByTestId('picker-left')).toHaveValue('1');
		expect(screen.getByTestId('picker-right')).toHaveValue('2');
	});

	it("excludes the right side's selection from the left picker's options", () => {
		render(ComparePickerRow, {
			props: { options, leftId: '1', rightId: '2', onLeftChange: vi.fn(), onRightChange: vi.fn(), onSwap: vi.fn() },
		});
		const leftSelect = screen.getByTestId('picker-left') as HTMLSelectElement;
		const leftOptionValues = Array.from(leftSelect.options).map((o) => o.value);
		expect(leftOptionValues).not.toContain('2');
		expect(leftOptionValues).toEqual(expect.arrayContaining(['1', '3']));
	});

	it("excludes the left side's selection from the right picker's options", () => {
		render(ComparePickerRow, {
			props: { options, leftId: '1', rightId: '2', onLeftChange: vi.fn(), onRightChange: vi.fn(), onSwap: vi.fn() },
		});
		const rightSelect = screen.getByTestId('picker-right') as HTMLSelectElement;
		const rightOptionValues = Array.from(rightSelect.options).map((o) => o.value);
		expect(rightOptionValues).not.toContain('1');
	});

	it('calls onLeftChange when the left select changes', async () => {
		const onLeftChange = vi.fn();
		render(ComparePickerRow, {
			props: { options, leftId: '1', rightId: '2', onLeftChange, onRightChange: vi.fn(), onSwap: vi.fn() },
		});
		await fireEvent.change(screen.getByTestId('picker-left'), { target: { value: '3' } });
		expect(onLeftChange).toHaveBeenCalledWith('3');
	});

	it('calls onSwap when the swap button is clicked', async () => {
		const onSwap = vi.fn();
		render(ComparePickerRow, {
			props: { options, leftId: '1', rightId: '2', onLeftChange: vi.fn(), onRightChange: vi.fn(), onSwap },
		});
		await fireEvent.click(screen.getByRole('button', { name: /swap sides/i }));
		expect(onSwap).toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm exec vitest run tests/components/ComparePickerRow.test.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/components/ComparePickerRow.svelte`:

```svelte
<script lang="ts">
	import ArrowLeftRightIcon from '@lucide/svelte/icons/arrow-left-right';

	let {
		options,
		leftId,
		rightId,
		onLeftChange,
		onRightChange,
		onSwap,
	}: {
		options: { id: string; name: string }[];
		leftId: string;
		rightId: string;
		onLeftChange: (id: string) => void;
		onRightChange: (id: string) => void;
		onSwap: () => void;
	} = $props();

	const leftOptions = $derived(options.filter((o) => o.id !== rightId));
	const rightOptions = $derived(options.filter((o) => o.id !== leftId));

	function avatarColor(id: string): string {
		return id === leftId ? 'var(--color-primary)' : 'var(--color-logo-purple)';
	}

	function initials(name: string): string {
		return name
			.split(' ')
			.map((part) => part[0])
			.join('')
			.slice(0, 2)
			.toUpperCase();
	}

	const leftName = $derived(options.find((o) => o.id === leftId)?.name ?? '');
	const rightName = $derived(options.find((o) => o.id === rightId)?.name ?? '');
</script>

<div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
	<div class="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5">
		<span
			class="flex size-[26px] flex-none items-center justify-center rounded-full text-[11px] font-semibold text-white"
			style="background-color: {avatarColor(leftId)};"
		>
			{initials(leftName)}
		</span>
		<select
			data-testid="picker-left"
			class="w-full min-w-0 bg-transparent text-sm font-medium text-foreground"
			value={leftId}
			onchange={(e) => onLeftChange(e.currentTarget.value)}
		>
			{#each leftOptions as option (option.id)}
				<option value={option.id}>{option.name}</option>
			{/each}
		</select>
	</div>

	<button
		type="button"
		onclick={onSwap}
		aria-label="Swap sides"
		class="flex flex-none items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-primary/[0.06]"
	>
		<ArrowLeftRightIcon class="size-4" />
	</button>

	<div class="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5">
		<span
			class="flex size-[26px] flex-none items-center justify-center rounded-full text-[11px] font-semibold text-white"
			style="background-color: {avatarColor(rightId)};"
		>
			{initials(rightName)}
		</span>
		<select
			data-testid="picker-right"
			class="w-full min-w-0 bg-transparent text-sm font-medium text-foreground"
			value={rightId}
			onchange={(e) => onRightChange(e.currentTarget.value)}
		>
			{#each rightOptions as option (option.id)}
				<option value={option.id}>{option.name}</option>
			{/each}
		</select>
	</div>
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm exec vitest run tests/components/ComparePickerRow.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/components/ComparePickerRow.svelte frontend/tests/components/ComparePickerRow.test.ts
git commit -m "$(cat <<'EOF'
feat(frontend): add ComparePickerRow component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `CompareOverallRow.svelte`

**Files:**
- Create: `frontend/src/lib/components/CompareOverallRow.svelte`
- Test: `frontend/tests/components/CompareOverallRow.test.ts`

**Interfaces:**
- Consumes props: `{ overall: OverallComparison }` (type from Task 2's `comparePerspectives.ts`).
- Produces: a bordered row rendering left thumb icon, agree/different dot+label, right thumb icon. Read-only — copies `Thumbs.svelte`'s two `<path>` `d` strings, not the interactive component.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/components/CompareOverallRow.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import CompareOverallRow from '$lib/components/CompareOverallRow.svelte';

describe('CompareOverallRow', () => {
	it('shows "Agree overall" when both thumbs match', () => {
		render(CompareOverallRow, { props: { overall: { left: 'THUMBS_UP', right: 'THUMBS_UP', agree: true } } });
		expect(screen.getByText('Agree overall')).toBeInTheDocument();
	});

	it('shows "Different" when thumbs differ', () => {
		render(CompareOverallRow, { props: { overall: { left: 'THUMBS_UP', right: 'THUMBS_DOWN', agree: false } } });
		expect(screen.getByText('Different')).toBeInTheDocument();
	});

	it('renders a dash for a side with no thumb set', () => {
		render(CompareOverallRow, { props: { overall: { left: null, right: 'THUMBS_UP', agree: false } } });
		expect(screen.getByTestId('overall-left')).toHaveTextContent('—');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm exec vitest run tests/components/CompareOverallRow.test.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/components/CompareOverallRow.svelte`:

```svelte
<script lang="ts">
	import type { OverallComparison } from '$lib/utils/comparePerspectives';

	let { overall }: { overall: OverallComparison } = $props();

	const THUMB_UP_PATH = 'M7 10v12 M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H7V10l4.34-9.66a1 1 0 0 1 1.66.43z';
	const THUMB_DOWN_PATH = 'M17 14V2 M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H17v12l-4.34 9.66a1 1 0 0 1-1.66-.43z';
</script>

{#snippet thumbIcon(value: string | null, testId: string)}
	<span data-testid={testId} class="flex items-center justify-center">
		{#if value === 'THUMBS_UP'}
			<svg width="20" height="20" viewBox="0 0 24 24" fill="#16a34a" stroke="#16a34a" stroke-width="1.6">
				<path d={THUMB_UP_PATH.split(' ').slice(0, 2).join(' ')} />
				<path d={THUMB_UP_PATH.split(' ').slice(2).join(' ')} />
			</svg>
		{:else if value === 'THUMBS_DOWN'}
			<svg width="20" height="20" viewBox="0 0 24 24" fill="#dc2626" stroke="#dc2626" stroke-width="1.6">
				<path d={THUMB_DOWN_PATH.split(' ').slice(0, 2).join(' ')} />
				<path d={THUMB_DOWN_PATH.split(' ').slice(2).join(' ')} />
			</svg>
		{:else}
			<span class="text-sm text-muted-foreground">—</span>
		{/if}
	</span>
{/snippet}

<div class="flex items-center justify-between rounded-lg border border-border px-3.5 py-2.5">
	<span class="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Overall</span>
	<div class="flex items-center gap-2.5">
		{@render thumbIcon(overall.left, 'overall-left')}
		<span
			class="flex items-center gap-1.5 text-[13px] font-medium"
			style="color: {overall.agree ? 'var(--color-rating-positive)' : 'var(--color-rating-neutral)'};"
		>
			<span
				class="size-1.5 rounded-full"
				style="background-color: {overall.agree ? 'var(--color-rating-positive)' : 'var(--color-rating-neutral)'};"
			></span>
			{overall.agree ? 'Agree overall' : 'Different'}
		</span>
		{@render thumbIcon(overall.right, 'overall-right')}
	</div>
</div>
```

Note: the `THUMB_*_PATH.split(' ').slice(...)` juggling above is to keep the two-path SVG shape but store both `d` strings as one constant each. Simplify while implementing if it reads awkwardly — the important, non-negotiable part is that the path data is copied verbatim from `Thumbs.svelte`'s two `<path>` elements (`M17 14V2` / `M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H17v12l-4.34 9.66a1 1 0 0 1-1.66-.43z` for down; `M7 10v12` / `M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H7V10l4.34-9.66a1 1 0 0 1 1.66.43z` for up), so store them as two separate constants per icon instead:

```ts
const THUMB_UP_PATHS = ['M7 10v12', 'M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H7V10l4.34-9.66a1 1 0 0 1 1.66.43z'];
const THUMB_DOWN_PATHS = ['M17 14V2', 'M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H17v12l-4.34 9.66a1 1 0 0 1-1.66-.43z'];
```

and render `{#each THUMB_UP_PATHS as d}<path {d} />{/each}` (same for down) instead of the `.split(' ')` hack.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm exec vitest run tests/components/CompareOverallRow.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/components/CompareOverallRow.svelte frontend/tests/components/CompareOverallRow.test.ts
git commit -m "$(cat <<'EOF'
feat(frontend): add CompareOverallRow component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `CompareRatingTable.svelte`

**Files:**
- Create: `frontend/src/lib/components/CompareRatingTable.svelte`
- Test: `frontend/tests/components/CompareRatingTable.test.ts`

**Interfaces:**
- Consumes props: `{ rows: RatingRow[]; filledInDifferently: FilledInDifferentlyRow[]; feelings: FeelingComparison; sortDesc: boolean; onToggleSort: () => void }` (types from Task 2).
- Produces: the sort toggle button (`data-testid="sort-toggle"`), one row per `RatingRow` (sorted via `sortRatingRows` — sorting itself happens in the parent so this component just renders in the order given), the "Filled in differently" sublist, and the "Matching feelings" row when `feelings.shared.length > 0`.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/components/CompareRatingTable.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import CompareRatingTable from '$lib/components/CompareRatingTable.svelte';
import type { RatingRow, FilledInDifferentlyRow, FeelingComparison } from '$lib/utils/comparePerspectives';

const rows: RatingRow[] = [
	{ key: 'quality', label: 'Quality', leftDisplay: 8, rightDisplay: 7, delta: 1, pctDiff: 10, status: 'similar' },
	{ key: 'agreement', label: 'Agreement', leftDisplay: 9, rightDisplay: 3, delta: 6, pctDiff: 60, status: 'conflict' },
];
const filledInDifferently: FilledInDifferentlyRow[] = [
	{ key: 'confidence', label: 'Confidence', side: 'left', display: 6 },
];
const noFeelings: FeelingComparison = { shared: [], leftOnly: [], rightOnly: [] };
const withSharedFeelings: FeelingComparison = {
	shared: [{ emoji: '🤔', label: 'curious' }],
	leftOnly: [],
	rightOnly: [],
};

describe('CompareRatingTable', () => {
	it('renders one row per rating dimension with its label and status', () => {
		render(CompareRatingTable, {
			props: { rows, filledInDifferently, feelings: noFeelings, sortDesc: false, onToggleSort: vi.fn() },
		});
		expect(screen.getByText('Quality')).toBeInTheDocument();
		expect(screen.getByText('Agreement')).toBeInTheDocument();
		expect(screen.getByText('Similar')).toBeInTheDocument();
		expect(screen.getByText('Conflict')).toBeInTheDocument();
	});

	it('shows the ascending sort label when sortDesc is false', () => {
		render(CompareRatingTable, {
			props: { rows, filledInDifferently, feelings: noFeelings, sortDesc: false, onToggleSort: vi.fn() },
		});
		expect(screen.getByText('Most similar first')).toBeInTheDocument();
	});

	it('shows the descending sort label when sortDesc is true', () => {
		render(CompareRatingTable, {
			props: { rows, filledInDifferently, feelings: noFeelings, sortDesc: true, onToggleSort: vi.fn() },
		});
		expect(screen.getByText('Most similar last')).toBeInTheDocument();
	});

	it('calls onToggleSort when the sort toggle is clicked', async () => {
		const onToggleSort = vi.fn();
		render(CompareRatingTable, {
			props: { rows, filledInDifferently, feelings: noFeelings, sortDesc: false, onToggleSort },
		});
		await fireEvent.click(screen.getByTestId('sort-toggle'));
		expect(onToggleSort).toHaveBeenCalled();
	});

	it('renders the filled-in-differently sublist', () => {
		render(CompareRatingTable, {
			props: { rows, filledInDifferently, feelings: noFeelings, sortDesc: false, onToggleSort: vi.fn() },
		});
		expect(screen.getByText(/Confidence/)).toBeInTheDocument();
	});

	it('shows the matching-feelings row only when there are shared feelings', () => {
		const { rerender } = render(CompareRatingTable, {
			props: { rows, filledInDifferently, feelings: noFeelings, sortDesc: false, onToggleSort: vi.fn() },
		});
		expect(screen.queryByText('Matching feelings')).not.toBeInTheDocument();

		rerender({ rows, filledInDifferently, feelings: withSharedFeelings, sortDesc: false, onToggleSort: vi.fn() });
		expect(screen.getByText('Matching feelings')).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm exec vitest run tests/components/CompareRatingTable.test.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/components/CompareRatingTable.svelte`:

```svelte
<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import type { RatingRow, FilledInDifferentlyRow, FeelingComparison } from '$lib/utils/comparePerspectives';

	let {
		rows,
		filledInDifferently,
		feelings,
		sortDesc,
		onToggleSort,
	}: {
		rows: RatingRow[];
		filledInDifferently: FilledInDifferentlyRow[];
		feelings: FeelingComparison;
		sortDesc: boolean;
		onToggleSort: () => void;
	} = $props();

	const STATUS_LABEL: Record<RatingRow['status'], string> = {
		similar: 'Similar',
		diverges: 'Diverges',
		conflict: 'Conflict',
	};
	const STATUS_COLOR: Record<RatingRow['status'], string> = {
		similar: 'var(--color-rating-positive)',
		diverges: 'var(--color-rating-neutral)',
		conflict: 'var(--color-rating-negative)',
	};

	function fmt(n: number): string {
		return n.toFixed(1);
	}
</script>

<div class="mx-auto flex w-full max-w-[300px] flex-col gap-3">
	{#if feelings.shared.length > 0}
		<div class="flex items-center gap-2 rounded-full border border-[var(--color-rating-positive)] px-3 py-1.5 text-[13px]">
			<span class="font-medium" style="color: var(--color-rating-positive);">Matching feelings</span>
			{#each feelings.shared as f (f.label ?? f.emoji)}
				<span>{f.emoji} {f.label ?? ''}</span>
			{/each}
		</div>
	{/if}

	<button
		type="button"
		data-testid="sort-toggle"
		onclick={onToggleSort}
		class="flex items-center justify-center gap-1 self-center text-[12.5px] font-medium text-muted-foreground"
	>
		{sortDesc ? 'Most similar last' : 'Most similar first'}
		<ChevronDownIcon class="size-3.5 transition-transform" style="transform: rotate({sortDesc ? 180 : 0}deg);" />
	</button>

	<div class="flex flex-col gap-3">
		{#each rows as row (row.key)}
			<div class="flex flex-col gap-1">
				<div class="flex items-center justify-between">
					<span class="text-[13px] font-semibold text-foreground">{row.label}</span>
					<span class="flex items-center gap-1 text-[11.5px]" style="color: {STATUS_COLOR[row.status]};">
						<span class="size-1.5 rounded-full" style="background-color: {STATUS_COLOR[row.status]};"></span>
						{STATUS_LABEL[row.status]}
					</span>
				</div>
				<div class="flex items-center justify-between text-[12.5px] text-foreground">
					<span>{fmt(row.leftDisplay)}</span>
					<span style="color: var(--color-muted-foreground);">{fmt(row.pctDiff)}% different</span>
					<span>{fmt(row.rightDisplay)}</span>
				</div>
			</div>
		{/each}
	</div>

	{#if filledInDifferently.length > 0}
		<div class="mt-1 flex flex-col gap-1 border-t border-border pt-2.5">
			<span class="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
				Filled in differently
			</span>
			{#each filledInDifferently as row (row.key)}
				<div class="text-[12.5px] text-foreground">
					{row.label} &mdash; {row.side === 'left' ? 'left' : 'right'} filled in {fmt(row.display)}
				</div>
			{/each}
		</div>
	{/if}
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm exec vitest run tests/components/CompareRatingTable.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/components/CompareRatingTable.svelte frontend/tests/components/CompareRatingTable.test.ts
git commit -m "$(cat <<'EOF'
feat(frontend): add CompareRatingTable component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `CompareTakeColumn.svelte`

**Files:**
- Create: `frontend/src/lib/components/CompareTakeColumn.svelte`
- Test: `frontend/tests/components/CompareTakeColumn.test.ts`

**Interfaces:**
- Consumes props: `{ name: string; avatarColor: string; review: string | null; uniqueFeelings: { emoji: string; label: string | null }[] }`.
- Produces: bordered card with "TAKE" eyebrow, avatar initials + name, review quote (or a muted placeholder when null), and a "UNIQUE FEELINGS" section shown only when `uniqueFeelings.length > 0`.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/components/CompareTakeColumn.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import CompareTakeColumn from '$lib/components/CompareTakeColumn.svelte';

describe('CompareTakeColumn', () => {
	it('renders the name and review text', () => {
		render(CompareTakeColumn, {
			props: { name: 'Jamie Lee', avatarColor: '#8b5cf6', review: 'Solid overview.', uniqueFeelings: [] },
		});
		expect(screen.getByText('Jamie Lee')).toBeInTheDocument();
		expect(screen.getByText('Solid overview.')).toBeInTheDocument();
	});

	it('shows a placeholder when there is no review text', () => {
		render(CompareTakeColumn, {
			props: { name: 'Jamie Lee', avatarColor: '#8b5cf6', review: null, uniqueFeelings: [] },
		});
		expect(screen.getByText('No written review.')).toBeInTheDocument();
	});

	it('does not render the unique feelings section when empty', () => {
		render(CompareTakeColumn, {
			props: { name: 'Jamie Lee', avatarColor: '#8b5cf6', review: 'x', uniqueFeelings: [] },
		});
		expect(screen.queryByText('Unique feelings')).not.toBeInTheDocument();
	});

	it('renders unique feelings when present', () => {
		render(CompareTakeColumn, {
			props: {
				name: 'Jamie Lee',
				avatarColor: '#8b5cf6',
				review: 'x',
				uniqueFeelings: [{ emoji: '🤔', label: 'curious' }],
			},
		});
		expect(screen.getByText('Unique feelings')).toBeInTheDocument();
		expect(screen.getByText(/curious/)).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm exec vitest run tests/components/CompareTakeColumn.test.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/components/CompareTakeColumn.svelte`:

```svelte
<script lang="ts">
	let {
		name,
		avatarColor,
		review,
		uniqueFeelings,
	}: {
		name: string;
		avatarColor: string;
		review: string | null;
		uniqueFeelings: { emoji: string; label: string | null }[];
	} = $props();

	function initials(value: string): string {
		return value
			.split(' ')
			.map((part) => part[0])
			.join('')
			.slice(0, 2)
			.toUpperCase();
	}
</script>

<div class="flex flex-col gap-3 rounded-lg border border-border p-3.5">
	<span class="text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">Take</span>
	<div class="flex items-center gap-2">
		<span
			class="flex size-6 flex-none items-center justify-center rounded-full text-[10px] font-semibold text-white"
			style="background-color: {avatarColor};"
		>
			{initials(name)}
		</span>
		<span class="text-[13px] font-semibold text-foreground">{name}</span>
	</div>
	<p class="font-[family-name:var(--font-family-serif)] text-[13.5px] leading-snug text-foreground">
		{#if review}
			&ldquo;{review}&rdquo;
		{:else}
			<span class="text-muted-foreground">No written review.</span>
		{/if}
	</p>

	{#if uniqueFeelings.length > 0}
		<div class="flex flex-col gap-1.5 border-t border-border pt-2.5">
			<span class="text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">
				Unique feelings
			</span>
			<div class="flex flex-wrap gap-1.5">
				{#each uniqueFeelings as f (f.label ?? f.emoji)}
					<span class="rounded-full border border-border px-2 py-0.5 text-[12px]">{f.emoji} {f.label ?? ''}</span>
				{/each}
			</div>
		</div>
	{/if}
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm exec vitest run tests/components/CompareTakeColumn.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/components/CompareTakeColumn.svelte frontend/tests/components/CompareTakeColumn.test.ts
git commit -m "$(cat <<'EOF'
feat(frontend): add CompareTakeColumn component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `Compare.svelte` orchestrator + `/compare` route

**Files:**
- Create: `frontend/src/lib/components/Compare.svelte`
- Create: `frontend/src/routes/compare/+page.svelte`
- Test: `frontend/tests/components/Compare.test.ts`

**Interfaces:**
- Consumes: `LIST_PERSPECTIVES_BY_CONTENT`/`ListPerspectivesByContentResponse` (Task 1), `LIST_USERS`/`UsersResponse` (existing `$lib/queries/users`), `contentByID` — reuse the existing content query the codebase already has (`$lib/queries/content`, `LIST_CONTENT` or a single-content fetch — inspect `frontend/src/lib/queries/content/index.ts` for the exact single-item query name and use it; if only a list query exists, fetch with a `filter: { id: contentId }` the same way `useContentAggregates` does for a single row), `useMe()` (`$lib/queries/users/useMe.svelte`), all of Task 2's `comparePerspectives` functions, `ComparePickerRow`/`CompareOverallRow`/`CompareRatingTable`/`CompareTakeColumn` (Tasks 3-6), `ActivityDetailsModal` (existing).
- Produces: `Compare.svelte` takes `{ contentId: string; initialLeftId: string | null; initialRightId: string | null }` props and calls `goto` to sync `leftId`/`rightId` back into the URL on change. `+page.svelte` reads `page.url.searchParams` (`contentId`, `left`, `right`) and passes them through.

- [ ] **Step 1: Confirm the exact content-by-id query name**

Run: `grep -n "export const" frontend/src/lib/queries/content/index.ts`

Use whatever single-content query already exists (e.g. `CONTENT_BY_ID` returning `contentByID`). If none exists, add a minimal one following the exact pattern of `LIST_CONTENT` in that same file (same fields as `ModalContent` in `ActivityDetailsModal.svelte`: id, name, url, channelTitle, viewCount, likeCount, length, lengthUnits, publishedAt, updatedAt, description, tags) — this is additive to an existing query file, not a new subsystem, so it's in-scope for this task rather than a separate one.

- [ ] **Step 2: Write the failing test**

Create `frontend/tests/components/Compare.test.ts`. This test mocks `graphqlRequest` (follow the mocking pattern already used in `tests/components/CategoryTypeahead.test.ts` or `UserActivityView`'s test file — inspect one of those for the exact `vi.mock('$lib/queries/client', ...)` shape used in this repo before writing this file) so it need not hit a real backend:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import Compare from '$lib/components/Compare.svelte';

const mockGraphqlRequest = vi.fn();
vi.mock('$lib/queries/client', () => ({
	graphqlRequest: (...args: unknown[]) => mockGraphqlRequest(...args),
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/queries/users/useMe.svelte', () => ({
	useMe: () => ({ me: { id: '1', username: 'me' }, isSuccess: true, isError: false, isSettled: true, isAdmin: false }),
}));

function queueResponses(responses: Record<string, unknown>) {
	mockGraphqlRequest.mockImplementation((doc: string) => {
		if (doc.includes('ListUsers')) return Promise.resolve(responses.users);
		if (doc.includes('ListPerspectivesByContent')) return Promise.resolve(responses.perspectives);
		if (doc.includes('ContentByID') || doc.includes('contentByID')) return Promise.resolve(responses.content);
		return Promise.reject(new Error(`Unexpected query: ${doc}`));
	});
}

beforeEach(() => {
	mockGraphqlRequest.mockReset();
});

describe('Compare', () => {
	it('shows an empty state when only one perspective exists on the content', async () => {
		queueResponses({
			users: { users: [{ id: '1', username: 'me' }] },
			perspectives: { perspectives: { items: [{ id: 'p1', userID: '1', contentID: '10', quality: 8000, agreement: null, importance: null, confidence: null, like: null, review: 'x', privacy: 'PUBLIC', description: null, primaryPerspectiveID: null, relatedPerspectiveIDs: null, customFields: null, feelings: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }] } },
			content: { contentByID: { id: '10', name: 'Video', url: null, channelTitle: null, viewCount: null, likeCount: null, length: null, lengthUnits: null, publishedAt: null, updatedAt: '2026-01-01T00:00:00Z', description: null, tags: null } },
		});

		render(Compare, { props: { contentId: '10', initialLeftId: null, initialRightId: null } });

		await waitFor(() => {
			expect(screen.getByText(/no other perspectives/i)).toBeInTheDocument();
		});
	});

	it('renders the comparison summary line when two perspectives exist', async () => {
		queueResponses({
			users: { users: [{ id: '1', username: 'me' }, { id: '2', username: 'Jamie Lee' }] },
			perspectives: {
				perspectives: {
					items: [
						{ id: 'p1', userID: '1', contentID: '10', quality: 8000, agreement: null, importance: null, confidence: null, like: 'THUMBS_UP', review: 'Great', privacy: 'PUBLIC', description: null, primaryPerspectiveID: null, relatedPerspectiveIDs: null, customFields: null, feelings: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
						{ id: 'p2', userID: '2', contentID: '10', quality: 7000, agreement: null, importance: null, confidence: null, like: 'THUMBS_UP', review: 'Good', privacy: 'PUBLIC', description: null, primaryPerspectiveID: null, relatedPerspectiveIDs: null, customFields: null, feelings: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
					],
				},
			},
			content: { contentByID: { id: '10', name: 'Video', url: null, channelTitle: null, viewCount: null, likeCount: null, length: null, lengthUnits: null, publishedAt: null, updatedAt: '2026-01-01T00:00:00Z', description: null, tags: null } },
		});

		render(Compare, { props: { contentId: '10', initialLeftId: null, initialRightId: null } });

		await waitFor(() => {
			expect(screen.getByText(/1 similar/i)).toBeInTheDocument();
		});
	});
});
```

If this repo's `QueryClient`/`createQuery` setup requires a `QueryClientProvider` wrapper in tests, follow the exact wrapper pattern from an existing passing test file that renders a component using `createQuery` (e.g. `UserActivityView`'s test, if one exists, or `ActivityTable.test.ts`) rather than inventing a new one.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && pnpm exec vitest run tests/components/Compare.test.ts`
Expected: FAIL — component not found.

- [ ] **Step 4: Write the implementation**

Create `frontend/src/lib/components/Compare.svelte`:

```svelte
<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { goto } from '$app/navigation';
	import { graphqlRequest } from '$lib/queries/client';
	import { LIST_USERS, type UsersResponse } from '$lib/queries/users';
	import {
		LIST_PERSPECTIVES_BY_CONTENT,
		type ListPerspectivesByContentResponse,
		type PerspectiveItem,
	} from '$lib/queries/perspectives';
	import { queryKeys } from '$lib/queries/keys';
	import { useMe } from '$lib/queries/users/useMe.svelte';
	import {
		compareRatings,
		filledInDifferently,
		compareFeelings,
		compareOverall,
		summarize,
		sortRatingRows,
	} from '$lib/utils/comparePerspectives';
	import ComparePickerRow from '$lib/components/ComparePickerRow.svelte';
	import CompareOverallRow from '$lib/components/CompareOverallRow.svelte';
	import CompareRatingTable from '$lib/components/CompareRatingTable.svelte';
	import CompareTakeColumn from '$lib/components/CompareTakeColumn.svelte';
	import GlassesIcon from '@lucide/svelte/icons/glasses';
	import { extractVideoIdFromUrl, formatDuration } from '$lib/utils/formatting';

	let {
		contentId,
		initialLeftId,
		initialRightId,
	}: {
		contentId: string;
		initialLeftId: string | null;
		initialRightId: string | null;
	} = $props();

	const meCtx = useMe();

	const usersQuery = createQuery(() => ({
		queryKey: queryKeys.users.list(),
		queryFn: () => graphqlRequest<UsersResponse>(LIST_USERS),
		staleTime: 5 * 60 * 1000,
	}));

	const perspectivesQuery = createQuery(() => ({
		queryKey: queryKeys.perspectives.listByContent(Number(contentId)),
		queryFn: () =>
			graphqlRequest<ListPerspectivesByContentResponse>(LIST_PERSPECTIVES_BY_CONTENT, {
				contentID: Number(contentId),
			}),
	}));

	const perspectives = $derived(perspectivesQuery.data?.perspectives.items ?? []);
	const users = $derived(usersQuery.data?.users ?? []);

	function displayName(userID: string): string {
		if (meCtx.me && userID === meCtx.me.id) return 'You';
		return users.find((u) => u.id === userID)?.username ?? `User ${userID}`;
	}

	// Picker candidates: every user with a fetched perspective row (privacy
	// gating already happened server-side — see LIST_PERSPECTIVES_BY_CONTENT).
	const options = $derived(
		perspectives.map((p) => ({ id: p.userID, name: displayName(p.userID) })),
	);

	function defaultLeftId(): string | null {
		if (meCtx.me && perspectives.some((p) => p.userID === meCtx.me!.id)) return meCtx.me.id;
		return perspectives[0]?.userID ?? null;
	}

	function defaultRightId(excludeId: string | null): string | null {
		const candidates = perspectives.filter((p) => p.userID !== excludeId);
		if (candidates.length === 0) return null;
		return candidates.reduce((latest, p) => (p.updatedAt > latest.updatedAt ? p : latest)).userID;
	}

	const leftId = $derived(initialLeftId ?? defaultLeftId());
	const rightId = $derived(initialRightId ?? defaultRightId(leftId));

	function updateUrl(next: { left?: string; right?: string }) {
		const params = new URLSearchParams();
		params.set('contentId', contentId);
		params.set('left', next.left ?? leftId ?? '');
		params.set('right', next.right ?? rightId ?? '');
		goto(`/compare?${params.toString()}`, { replaceState: true, keepFocus: true, noScroll: true });
	}

	function handleLeftChange(id: string) {
		updateUrl({ left: id });
	}
	function handleRightChange(id: string) {
		updateUrl({ right: id });
	}
	function handleSwap() {
		if (!leftId || !rightId) return;
		updateUrl({ left: rightId, right: leftId });
	}

	const leftPerspective = $derived(perspectives.find((p) => p.userID === leftId) ?? null);
	const rightPerspective = $derived(perspectives.find((p) => p.userID === rightId) ?? null);

	let sortDesc = $state(false);

	const ratingRows = $derived.by(() => {
		if (!leftPerspective || !rightPerspective) return [];
		return sortRatingRows(compareRatings(leftPerspective, rightPerspective), sortDesc);
	});
	const filledInDifferentlyRows = $derived.by(() =>
		leftPerspective && rightPerspective ? filledInDifferently(leftPerspective, rightPerspective) : [],
	);
	const feelingsComparison = $derived.by(() =>
		leftPerspective && rightPerspective
			? compareFeelings(leftPerspective, rightPerspective)
			: { shared: [], leftOnly: [], rightOnly: [] },
	);
	const overall = $derived.by(() =>
		leftPerspective && rightPerspective
			? compareOverall(leftPerspective, rightPerspective)
			: { left: null, right: null, agree: false },
	);
	const summary = $derived(summarize(ratingRows));

	const loading = $derived(usersQuery.isLoading || perspectivesQuery.isLoading);
	const hasComparison = $derived(perspectives.length >= 2 && !!leftPerspective && !!rightPerspective);

	function thumbSrc(url: string | null | undefined): string | null {
		const videoId = extractVideoIdFromUrl(url ?? null);
		return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
	}
</script>

<div class="mx-auto flex max-w-[880px] flex-col gap-4 px-5 py-5">
	<a href="/" class="text-[13px] text-muted-foreground hover:text-foreground">&larr; Back to Activity</a>

	<div class="flex items-center gap-2">
		<GlassesIcon class="size-[18px]" style="color: var(--color-primary);" />
		<h1 class="text-xl font-semibold text-foreground">Compare perspectives</h1>
	</div>
	<p class="-mt-2 text-[12.5px]" style="color: var(--color-muted-foreground);">
		Where ratings align, conflict, or were filled in differently.
	</p>

	{#if loading}
		<div class="py-12 text-center text-muted-foreground">Loading comparison…</div>
	{:else if usersQuery.isError || perspectivesQuery.isError}
		<div class="py-12 text-center text-muted-foreground">Failed to load this comparison. Please try again.</div>
	{:else if !hasComparison}
		<div class="rounded-lg border border-border bg-accent p-6 text-center text-[13.5px] text-muted-foreground">
			No other perspectives on this content yet to compare against.
		</div>
	{:else}
		<ComparePickerRow
			{options}
			leftId={leftId!}
			rightId={rightId!}
			onLeftChange={handleLeftChange}
			onRightChange={handleRightChange}
			onSwap={handleSwap}
		/>

		<div class="flex items-center gap-4 text-[12.5px]">
			<span class="flex items-center gap-1.5">
				<span class="size-1.5 rounded-full" style="background-color: var(--color-rating-positive);"></span>
				{summary.similar} similar
			</span>
			<span class="flex items-center gap-1.5">
				<span class="size-1.5 rounded-full" style="background-color: var(--color-rating-neutral);"></span>
				{summary.diverges} diverge
			</span>
			<span class="flex items-center gap-1.5">
				<span class="size-1.5 rounded-full" style="background-color: var(--color-rating-negative);"></span>
				{summary.conflict} conflict
			</span>
		</div>

		<CompareOverallRow {overall} />

		<div class="grid gap-4" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
			<CompareTakeColumn
				name={displayName(leftId!)}
				avatarColor="var(--color-primary)"
				review={leftPerspective!.review}
				uniqueFeelings={feelingsComparison.leftOnly}
			/>
			<CompareRatingTable
				rows={ratingRows}
				filledInDifferently={filledInDifferentlyRows}
				feelings={feelingsComparison}
				{sortDesc}
				onToggleSort={() => (sortDesc = !sortDesc)}
			/>
			<CompareTakeColumn
				name={displayName(rightId!)}
				avatarColor="var(--color-logo-purple)"
				review={rightPerspective!.review}
				uniqueFeelings={feelingsComparison.rightOnly}
			/>
		</div>
	{/if}
</div>
```

Create `frontend/src/routes/compare/+page.svelte`:

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import Compare from '$lib/components/Compare.svelte';

	const contentId = $derived(page.url.searchParams.get('contentId') ?? '');
	const initialLeftId = $derived(page.url.searchParams.get('left'));
	const initialRightId = $derived(page.url.searchParams.get('right'));
</script>

{#if contentId}
	<Compare {contentId} {initialLeftId} {initialRightId} />
{:else}
	<div class="mx-auto max-w-[880px] px-5 py-12 text-center text-muted-foreground">
		No content selected. Open Compare from a piece of content's details.
	</div>
{/if}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && pnpm exec vitest run tests/components/Compare.test.ts`
Expected: all PASS. If the `QueryClientProvider` wrapper is missing and tests fail with a TanStack Query context error, add the wrapper following the exact existing pattern (do not invent one — find it in another test file first).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/components/Compare.svelte frontend/src/routes/compare/+page.svelte frontend/tests/components/Compare.test.ts
git commit -m "$(cat <<'EOF'
feat(frontend): add Compare page orchestrator and /compare route

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Entry points — `Header.svelte` nav + `ActivityDetailsModal.svelte` "Compare" button

**Files:**
- Modify: `frontend/src/lib/components/Header.svelte`
- Modify: `frontend/src/lib/components/ActivityDetailsModal.svelte`
- Test: `frontend/tests/components/ActivityDetailsModal.test.ts` (add cases to the existing file if present; otherwise check `frontend/tests/components/` for its current name first — inspect before creating a duplicate)

**Interfaces:**
- Consumes: nothing new.
- Produces: `Header.svelte`'s `navLinks` gains a `Compare` entry. `ActivityDetailsModal.svelte` renders a "Compare" link/button next to "Update source data" that navigates to `/compare?contentId=<content.id>`.

- [ ] **Step 1: Check for an existing `ActivityDetailsModal.test.ts`**

Run: `ls frontend/tests/components/ | grep -i activitydetails`

If it exists, read it fully before editing so the new test cases match its existing mocking setup (it likely already mocks `useContentAggregates`/`useUpdateSourceData`).

- [ ] **Step 2: Write the failing test(s)**

Add to (or create) `frontend/tests/components/ActivityDetailsModal.test.ts` a case for the new button, matching whatever render/props setup the existing tests in that file use:

```ts
it('renders a Compare link pointing at /compare for this content', () => {
	// Use this file's existing `content` fixture and render helper.
	render(ActivityDetailsModal, { props: { content: /* existing fixture */ someContent, open: true, onClose: vi.fn() } });
	const link = screen.getByRole('link', { name: /compare/i });
	expect(link).toHaveAttribute('href', `/compare?contentId=${someContent.id}`);
});
```

Adjust the exact fixture variable name to match the file's existing convention.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && pnpm exec vitest run tests/components/ActivityDetailsModal.test.ts`
Expected: FAIL — no "Compare" link found.

- [ ] **Step 4: Add the nav link to `Header.svelte`**

In `frontend/src/lib/components/Header.svelte`, change:

```ts
	const navLinks = [
		{ href: '/', label: 'Activity' },
		{ href: '/discover', label: 'Discover' },
	];
```

to:

```ts
	const navLinks = [
		{ href: '/', label: 'Activity' },
		{ href: '/discover', label: 'Discover' },
		{ href: '/compare', label: 'Compare' },
	];
```

- [ ] **Step 5: Add the Compare button to `ActivityDetailsModal.svelte`**

In `frontend/src/lib/components/ActivityDetailsModal.svelte`, in the action row that currently holds only "Update source data" (around line 185-203), add a plain link before or after the existing button:

```svelte
			<a
				href={`/compare?contentId=${content.id}`}
				class="inline-flex items-center gap-1.5 rounded-md border border-primary px-3.5 py-2 text-[13px] font-semibold text-primary hover:bg-primary/5"
			>
				Compare
			</a>
```

Place it inside the existing `<div class="flex flex-col items-end gap-1">` block, above or below the "Update source data" button — group the two actions together in that same flex container.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && pnpm exec vitest run tests/components/ActivityDetailsModal.test.ts`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/components/Header.svelte frontend/src/lib/components/ActivityDetailsModal.svelte frontend/tests/components/ActivityDetailsModal.test.ts
git commit -m "$(cat <<'EOF'
feat(frontend): wire Compare entry points into Header nav and details modal

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Full verification pass + PR

**Files:** none (verification only).

- [ ] **Step 1: Type-check**

Run: `cd frontend && pnpm run check`
Expected: zero errors.

- [ ] **Step 2: Run the full frontend test suite**

Run: `cd frontend && pnpm run test:run`
Expected: all tests pass (including every test added in Tasks 1-8).

- [ ] **Step 3: Backend verification (no backend changes, but confirm nothing broke)**

Run: `cd backend && go build ./... && gofmt -l . && go test ./...`
Expected: build succeeds, `gofmt -l .` prints nothing, all tests pass.

- [ ] **Step 4: Manual/visual note for the PR**

This plan's execution happens without a locally-authenticated browser session (see root `CLAUDE.md`: "Cloud / CI / fresh-machine sessions must not attempt the Clerk sign-in"). The PR description must say so explicitly and list what a human should verify locally: `/compare?contentId=<id>` renders correctly for content with 2+ perspectives, the empty state for content with only 1, picker exclusion/swap, sort toggle, and the Compare button from `ActivityDetailsModal`.

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin feature/compare-perspectives-page
```

Create the PR with `gh api` per root `CLAUDE.md` (not `gh pr create`, since a pre-PR hook requires `/revise-claude-md` first — run that command, then create the PR), using the `feature.md` PR template's sections (Feature Description, Technical Changes, Demo, Test Plan). Since no local browser session is available in this environment, the Demo section should say so and list the manual verification steps from Step 4 instead of screenshots. Reference the spec (`docs/superpowers/specs/2026-09-16-compare-perspectives-page-design.md`) and this plan in the PR body.

---

## Plan Self-Review Notes

- **Spec coverage:** Route/entry points (Task 8), layout/components (Tasks 3-7), data/GraphQL (Task 1), comparison logic + thresholds (Task 2), state/URL sync + defaults + empty state (Task 7), accessibility fix (`#a3a3a3` never introduced — all new components use `var(--color-muted-foreground)` from the start), testing (unit tests in Task 2, component tests in Tasks 3-8) are each covered by name above.
- **Type consistency:** `RatingRow`/`FilledInDifferentlyRow`/`FeelingComparison`/`OverallComparison`/`ComparisonSummary` are defined once in Task 2 and referenced identically (same field names) in Tasks 5-7.
- **Known follow-up for the executor:** Task 7 Step 1 and Task 8 Step 1 both require a short look at existing files (content query module, existing modal test file) before writing code, because this plan was written without executing those commands — the exact single-content query name and the existing modal test's fixture variable name aren't guessed at above; the executor confirms them first.
