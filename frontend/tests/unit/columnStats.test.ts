import { describe, it, expect } from 'vitest';
import {
	summarize,
	binRows,
	histogram,
	frequencyPoints,
	cumulative,
	boxStats,
	density,
	pieSlices,
	coverage,
	topBottom,
} from '#lib/utils/columnStats';

describe('summarize', () => {
	it('computes count, min, median, mean, max and sample std dev', () => {
		expect(summarize([2, 4, 4, 4, 5, 5, 7, 9])).toEqual({
			count: 8,
			min: 2,
			median: 4.5,
			mean: 5,
			max: 9,
			stdDev: expect.closeTo(2.138, 3),
		});
	});

	it('returns null for empty input', () => {
		expect(summarize([])).toBeNull();
	});

	it('has zero std dev for a single value', () => {
		expect(summarize([7])?.stdDev).toBe(0);
	});

	it('uses the middle value as median for odd counts', () => {
		expect(summarize([9, 1, 5])?.median).toBe(5);
	});

	it('drops non-finite values and treats zero as a value', () => {
		const s = summarize([0, NaN, Infinity, 4]);
		expect(s?.count).toBe(2);
		expect(s?.min).toBe(0);
	});
});

describe('histogram', () => {
	it('returns an empty array for empty input', () => {
		expect(histogram([], 4)).toEqual([]);
	});

	it('yields one bin when all values are identical', () => {
		expect(histogram([1, 1, 1], 4)).toHaveLength(1);
		expect(histogram([1, 1, 1], 4)[0].count).toBe(3);
	});

	it('splits into equal-width bins and puts the max in the last bin', () => {
		expect(histogram([0, 1, 2, 3, 4], 2)).toEqual([
			{ lo: 0, hi: 2, count: 2 },
			{ lo: 2, hi: 4, count: 3 },
		]);
	});

	it('returns an empty array when binCount is below 1', () => {
		expect(histogram([1, 2], 0)).toEqual([]);
	});
});

describe('binRows', () => {
	it('gives each bin the rows that fall in it, so the readout names the same movies the bar counts', () => {
		const rows = [0, 1, 2, 3, 4, 4.5, 7].map((value, i) => ({ name: `M${i}`, value }));
		const binned = binRows(rows, 3);
		for (const { bin, members } of binned) {
			expect(members).toHaveLength(bin.count);
			for (const m of members) {
				expect(m.value).toBeGreaterThanOrEqual(bin.lo);
				expect(m.value).toBeLessThanOrEqual(bin.hi);
			}
		}
		expect(binned.map((b) => b.bin)).toEqual(
			histogram(
				rows.map((r) => r.value),
				3,
			),
		);
	});

	it('puts a value that sits on a shared edge in the upper bin, and the max in the last', () => {
		const binned = binRows(
			[
				{ name: 'A', value: 0 },
				{ name: 'B', value: 2 },
				{ name: 'C', value: 4 },
			],
			2,
		);
		expect(binned[0].members.map((m) => m.name)).toEqual(['A']);
		expect(binned[1].members.map((m) => m.name)).toEqual(['B', 'C']);
	});

	it('drops non-finite values and returns nothing for empty input', () => {
		expect(binRows([{ name: 'A', value: NaN }], 2)).toEqual([]);
		expect(binRows([], 2)).toEqual([]);
	});

	it('puts every movie in one bin when all values are identical', () => {
		const binned = binRows(
			[
				{ name: 'A', value: 5 },
				{ name: 'B', value: 5 },
			],
			4,
		);
		expect(binned).toHaveLength(1);
		expect(binned[0].members.map((m) => m.name)).toEqual(['A', 'B']);
	});
});

describe('frequencyPoints', () => {
	it('returns bin midpoints with counts', () => {
		expect(
			frequencyPoints([
				{ lo: 0, hi: 2, count: 2 },
				{ lo: 2, hi: 4, count: 3 },
			]),
		).toEqual([
			{ x: 1, y: 2 },
			{ x: 3, y: 3 },
		]);
	});

	it('returns an empty array for no bins', () => {
		expect(frequencyPoints([])).toEqual([]);
	});
});

describe('cumulative', () => {
	it('sorts ascending with share between 0 and 1', () => {
		expect(cumulative([3, 1, 2])).toEqual([
			{ x: 1, share: 1 / 3 },
			{ x: 2, share: 2 / 3 },
			{ x: 3, share: 1 },
		]);
	});

	it('returns an empty array for empty input', () => {
		expect(cumulative([])).toEqual([]);
	});
});

describe('boxStats', () => {
	it('returns null for empty input', () => {
		expect(boxStats([])).toBeNull();
	});

	it('computes quartiles with no outliers', () => {
		expect(boxStats([1, 2, 3, 4, 5])).toEqual({
			min: 1,
			q1: 2,
			median: 3,
			q3: 4,
			max: 5,
			outliers: [],
		});
	});

	it('separates Tukey outliers and ends whiskers at the extreme non-outliers', () => {
		const box = boxStats([1, 2, 3, 4, 5, 100]);
		expect(box?.outliers).toEqual([100]);
		expect(box?.max).toBe(5);
		expect(box?.min).toBe(1);
	});
});

describe('density', () => {
	it('returns an empty array for empty input', () => {
		expect(density([], 20)).toEqual([]);
	});

	it('returns an empty array for identical values', () => {
		expect(density([5, 5, 5], 20)).toEqual([]);
	});

	it('returns an empty array for a single value', () => {
		expect(density([5], 20)).toEqual([]);
	});

	it('returns the requested number of points, ascending in x, with positive y', () => {
		const pts = density([1, 2, 2, 3, 3, 3, 4, 4, 5], 25);
		expect(pts).toHaveLength(25);
		expect(pts.every((p, i) => i === 0 || p.x > pts[i - 1].x)).toBe(true);
		expect(pts.every((p) => p.y > 0)).toBe(true);
	});

	it('peaks near the mode', () => {
		const pts = density([1, 2, 2, 3, 3, 3, 4, 4, 5], 41);
		const peak = pts.reduce((a, b) => (b.y > a.y ? b : a));
		expect(peak.x).toBeGreaterThan(2.5);
		expect(peak.x).toBeLessThan(3.5);
	});
});

describe('pieSlices', () => {
	const bins = [
		{ lo: 0, hi: 1, count: 4 },
		{ lo: 1, hi: 2, count: 3 },
		{ lo: 2, hi: 3, count: 2 },
		{ lo: 3, hi: 4, count: 1 },
	];

	it('returns an empty array for no bins', () => {
		expect(pieSlices([], 3)).toEqual([]);
	});

	it('keeps all bins when within the cap', () => {
		expect(pieSlices(bins, 4)).toHaveLength(4);
		expect(pieSlices(bins, 4).some((s) => s.label === 'Other')).toBe(false);
	});

	it('folds the remaining bins into one Other slice', () => {
		const slices = pieSlices(bins, 2);
		expect(slices).toHaveLength(3);
		expect(slices.map((s) => s.count)).toEqual([4, 3, 3]);
		expect(slices[2].label).toBe('Other');
	});

	it('carries the raw bin edges so the chart can format them, with Other open-ended', () => {
		const slices = pieSlices(bins, 2);
		expect(slices[1]).toMatchObject({ lo: 1, hi: 2 });
		expect(slices[2]).toMatchObject({ lo: 2, hi: null });
	});
});

describe('coverage', () => {
	it('splits total into filled and empty', () => {
		expect(coverage(10, 7)).toEqual({ filled: 7, empty: 3 });
	});

	it('handles zero total', () => {
		expect(coverage(0, 0)).toEqual({ filled: 0, empty: 0 });
	});

	it('never reports negative empty', () => {
		expect(coverage(3, 5)).toEqual({ filled: 5, empty: 0 });
	});
});

describe('topBottom', () => {
	type Row = { t: string | null; v: number | null | undefined };
	const val = (r: Row) => r.v;
	const title = (r: Row) => r.t;

	it('returns empty lists for empty input', () => {
		expect(topBottom<Row>([], val, title, 10)).toEqual({ top: [], bottom: [] });
	});

	it('returns empty lists when only one row has a value', () => {
		expect(topBottom([{ t: 'a', v: 1 }], val, title, 10)).toEqual({ top: [], bottom: [] });
	});

	it('gives 10 top and 10 bottom with no shared title for 20 rows', () => {
		const rows = Array.from({ length: 20 }, (_, i) => ({ t: `t${i}`, v: i }));
		const { top, bottom } = topBottom(rows, val, title, 10);
		expect(top).toHaveLength(10);
		expect(bottom).toHaveLength(10);
		expect(top[0]).toEqual({ title: 't19', value: 19 });
		expect(bottom[0]).toEqual({ title: 't0', value: 0 });
		const shared = top.filter((a) => bottom.some((b) => b.title === a.title));
		expect(shared).toEqual([]);
	});

	it('caps each list at half the count when n is larger', () => {
		const rows = [1, 2, 3, 4, 5].map((v) => ({ t: `t${v}`, v }));
		const { top, bottom } = topBottom(rows, val, title, 10);
		expect(top.map((r) => r.value)).toEqual([5, 4]);
		expect(bottom.map((r) => r.value)).toEqual([1, 2]);
	});

	it('excludes null and undefined values but keeps zero', () => {
		const rows: Row[] = [
			{ t: 'n', v: null },
			{ t: 'u', v: undefined },
			{ t: 'z', v: 0 },
			{ t: 'o', v: 1 },
		];
		expect(topBottom(rows, val, title, 5)).toEqual({
			top: [{ title: 'o', value: 1 }],
			bottom: [{ title: 'z', value: 0 }],
		});
	});

	it('replaces missing titles with Untitled', () => {
		const rows: Row[] = [
			{ t: null, v: 9 },
			{ t: 'x', v: 1 },
		];
		const { top } = topBottom(rows, val, title, 1);
		expect(top[0].title).toBe('Untitled');
	});

	it('breaks ties by title', () => {
		const rows: Row[] = [
			{ t: 'b', v: 5 },
			{ t: 'a', v: 5 },
			{ t: 'c', v: 1 },
			{ t: 'd', v: 1 },
		];
		const { top, bottom } = topBottom(rows, val, title, 2);
		expect(top.map((r) => r.title)).toEqual(['a', 'b']);
		expect(bottom.map((r) => r.title)).toEqual(['c', 'd']);
	});
});
