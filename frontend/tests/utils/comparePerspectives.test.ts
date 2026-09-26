import { describe, it, expect } from 'vitest';
import {
	compareRatings,
	filledInDifferently,
	compareFeelings,
	compareOverall,
	summarize,
	sortRatingRows,
	agreementPercent,
	SIMILAR_THRESHOLD,
	DIVERGES_THRESHOLD,
} from '$lib/utils/comparePerspectives';
import type { RatingRow } from '$lib/utils/comparePerspectives';
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
		expect(
			compareRatings(left, right)
				.map((r) => r.key)
				.sort(),
		).toEqual(['agreement', 'confidence', 'importance', 'quality'].sort());
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

	it('lists a customFields key only the left side filled in, with a title-cased label', () => {
		const left = makePerspective({ customFields: { 'story-pacing': 6000 } });
		const right = makePerspective({ customFields: {} });
		const rows = filledInDifferently(left, right);
		expect(rows).toEqual([{ key: 'story-pacing', label: 'Story Pacing', side: 'left', display: 6.0 }]);
	});

	it('lists a customFields key only the right side filled in', () => {
		const left = makePerspective({ customFields: null });
		const right = makePerspective({ customFields: { pacing: 4000 } });
		const rows = filledInDifferently(left, right);
		expect(rows).toEqual([{ key: 'pacing', label: 'Pacing', side: 'right', display: 4.0 }]);
	});

	it('excludes a customFields key both sides filled in', () => {
		const left = makePerspective({ customFields: { pacing: 6000 } });
		const right = makePerspective({ customFields: { pacing: 4000 } });
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

describe('agreementPercent', () => {
	function makeRow(pctDiff: number): RatingRow {
		return { key: 'k', label: 'K', leftDisplay: 0, rightDisplay: 0, delta: 0, pctDiff, status: 'similar' };
	}

	it('returns null when there are no shared rating dimensions', () => {
		expect(agreementPercent([])).toBeNull();
	});

	it('is 100 when every shared dimension matches exactly', () => {
		expect(agreementPercent([makeRow(0), makeRow(0)])).toBe(100);
	});

	it('is 0 when every shared dimension is maximally different', () => {
		expect(agreementPercent([makeRow(100)])).toBe(0);
	});

	it('averages pctDiff across rows and inverts it', () => {
		// avg pctDiff = (20 + 40) / 2 = 30 -> 70% aligned
		expect(agreementPercent([makeRow(20), makeRow(40)])).toBe(70);
	});
});
