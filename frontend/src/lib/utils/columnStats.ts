/** Pure statistics and binning helpers for numeric column charts. */

export type Summary = {
	count: number;
	min: number;
	median: number;
	mean: number;
	max: number;
	stdDev: number;
};

export type Bin = { lo: number; hi: number; count: number };

export type TopBottom = {
	top: { title: string; value: number }[];
	bottom: { title: string; value: number }[];
};

type Point = { x: number; y: number };

const finiteSorted = (values: number[]): number[] => values.filter(Number.isFinite).sort((a, b) => a - b);

/** Linear-interpolated quantile of an ascending, non-empty array. */
function quantile(sorted: number[], q: number): number {
	const pos = (sorted.length - 1) * q;
	const lo = Math.floor(pos);
	const hi = Math.ceil(pos);
	return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function sampleStdDev(sorted: number[], mean: number): number {
	if (sorted.length < 2) return 0;
	const sumSq = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0);
	return Math.sqrt(sumSq / (sorted.length - 1));
}

export function summarize(values: number[]): Summary | null {
	const sorted = finiteSorted(values);
	if (sorted.length === 0) return null;
	const count = sorted.length;
	const mean = sorted.reduce((acc, v) => acc + v, 0) / count;
	return {
		count,
		min: sorted[0],
		median: quantile(sorted, 0.5),
		mean,
		max: sorted[count - 1],
		stdDev: sampleStdDev(sorted, mean),
	};
}

/** Equal-width bins over [min, max]; the max value lands in the last bin. */
export function histogram(values: number[], binCount: number): Bin[] {
	const sorted = finiteSorted(values);
	if (sorted.length === 0 || binCount < 1) return [];
	const min = sorted[0];
	const max = sorted[sorted.length - 1];
	if (min === max) return [{ lo: min, hi: max, count: sorted.length }];
	const width = (max - min) / binCount;
	const bins: Bin[] = Array.from({ length: binCount }, (_, i) => ({
		lo: min + i * width,
		hi: i === binCount - 1 ? max : min + (i + 1) * width,
		count: 0,
	}));
	for (const v of sorted) {
		const i = Math.min(Math.floor((v - min) / width), binCount - 1);
		bins[i].count++;
	}
	return bins;
}

export function frequencyPoints(bins: Bin[]): Point[] {
	return bins.map((b) => ({ x: (b.lo + b.hi) / 2, y: b.count }));
}

export function cumulative(values: number[]): { x: number; share: number }[] {
	const sorted = finiteSorted(values);
	return sorted.map((x, i) => ({ x, share: (i + 1) / sorted.length }));
}

/** Tukey box: whiskers end at the most extreme values within 1.5 x IQR of the quartiles. */
export function boxStats(values: number[]): {
	min: number;
	q1: number;
	median: number;
	q3: number;
	max: number;
	outliers: number[];
} | null {
	const sorted = finiteSorted(values);
	if (sorted.length === 0) return null;
	const q1 = quantile(sorted, 0.25);
	const q3 = quantile(sorted, 0.75);
	const iqr = q3 - q1;
	const lowFence = q1 - 1.5 * iqr;
	const highFence = q3 + 1.5 * iqr;
	const inside = sorted.filter((v) => v >= lowFence && v <= highFence);
	return {
		min: inside[0],
		q1,
		median: quantile(sorted, 0.5),
		q3,
		max: inside[inside.length - 1],
		outliers: sorted.filter((v) => v < lowFence || v > highFence),
	};
}

/** Gaussian kernel density estimate with Silverman's bandwidth. */
export function density(values: number[], points: number): Point[] {
	const sorted = finiteSorted(values);
	const n = sorted.length;
	if (n < 2 || sorted[0] === sorted[n - 1] || points < 2) return [];
	const mean = sorted.reduce((acc, v) => acc + v, 0) / n;
	const sd = sampleStdDev(sorted, mean);
	const iqr = quantile(sorted, 0.75) - quantile(sorted, 0.25);
	// A zero IQR (many ties) would collapse the bandwidth, so fall back to sd.
	const spread = iqr > 0 ? Math.min(sd, iqr / 1.34) : sd;
	const h = 0.9 * spread * n ** -0.2;
	const start = sorted[0] - 3 * h;
	const step = (sorted[n - 1] + 3 * h - start) / (points - 1);
	const norm = 1 / (n * h * Math.sqrt(2 * Math.PI));
	return Array.from({ length: points }, (_, i) => {
		const x = start + i * step;
		const y = norm * sorted.reduce((acc, v) => acc + Math.exp(-0.5 * ((x - v) / h) ** 2), 0);
		return { x, y };
	});
}

const formatEdge = (n: number): string => String(Number(n.toPrecision(4)));

export function pieSlices(bins: Bin[], cap: number): { label: string; count: number }[] {
	const kept = bins.slice(0, Math.max(cap, 0)).map((b) => ({
		label: b.lo === b.hi ? formatEdge(b.lo) : `${formatEdge(b.lo)}–${formatEdge(b.hi)}`,
		count: b.count,
	}));
	const rest = bins.slice(Math.max(cap, 0));
	if (rest.length === 0) return kept;
	return [...kept, { label: 'Other', count: rest.reduce((acc, b) => acc + b.count, 0) }];
}

export function coverage(total: number, withValue: number): { filled: number; empty: number } {
	return { filled: withValue, empty: Math.max(total - withValue, 0) };
}

/** Highest and lowest n rows by value; lists never overlap. Only null/undefined count as empty. */
export function topBottom<T>(
	rows: T[],
	value: (row: T) => number | null | undefined,
	title: (row: T) => string | null | undefined,
	n: number,
): TopBottom {
	const items = rows.flatMap((row) => {
		const v = value(row);
		return v === null || v === undefined || !Number.isFinite(v) ? [] : [{ title: title(row) ?? 'Untitled', value: v }];
	});
	const k = Math.max(Math.min(n, Math.floor(items.length / 2)), 0);
	const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title);
	const desc = [...items].sort((a, b) => b.value - a.value || byTitle(a, b));
	const asc = [...items].sort((a, b) => a.value - b.value || byTitle(a, b));
	return { top: desc.slice(0, k), bottom: asc.slice(0, k) };
}
