/**
 * Text and selection helpers for the column chart readout: what a hovered or
 * focused mark says, and what the chart's axes mean.
 */
import type { ChartType } from '#lib/utils/columnCharts';

type Format = (n: number) => string;

export function moviesText(n: number): string {
	return `${n} ${n === 1 ? 'movie' : 'movies'}`;
}

/** Index of the item closest to (px, py), or null for an empty list. Without py, only x counts. */
export function nearestIndex(items: readonly { x: number; y?: number }[], px: number, py?: number): number | null {
	let best: number | null = null;
	let bestDistance = Infinity;
	for (let i = 0; i < items.length; i++) {
		const dx = items[i].x - px;
		const dy = py === undefined || items[i].y === undefined ? 0 : (items[i].y as number) - py;
		const distance = dx * dx + dy * dy;
		if (distance < bestDistance) {
			bestDistance = distance;
			best = i;
		}
	}
	return best;
}

/** Arrow-key step through `count` items. From no selection, forward starts at the first item and back at the last. */
export function stepIndex(current: number | null, delta: number, count: number): number | null {
	if (count <= 0) return null;
	if (current === null) return delta >= 0 ? 0 : count - 1;
	return Math.min(Math.max(current + delta, 0), count - 1);
}

const percentOf = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export function binReadout(bin: { lo: number; hi: number; count: number }, format: Format): string {
	return `${format(bin.lo)}–${format(bin.hi)} · ${moviesText(bin.count)}`;
}

export function lineReadout(bin: { lo: number; hi: number; count: number }, format: Format): string {
	const mid = (bin.lo + bin.hi) / 2;
	return `${format(mid)}: ${moviesText(bin.count)} from ${format(bin.lo)} to ${format(bin.hi)}`;
}

/** `rank` is 1-based: the movie at that position in ascending order, and everything below it. */
export function cumulativeReadout(x: number, rank: number, total: number, format: Format): string {
	return `${format(x)} · ${rank} of ${total} movies (${percentOf(rank, total)}%) at or below`;
}

/** `expected` is the density scaled to a count of movies per band of width `bandWidth`. */
export function densityReadout(x: number, expected: number, bandWidth: number, format: Format): string {
	const rounded = Math.round(expected);
	const count = rounded === 0 ? 'under 1 movie' : `about ${moviesText(rounded)}`;
	return `${format(x)} · ${count} in the ${format(bandWidth)} band around it`;
}

export function movieReadout(name: string, value: number, format: Format): string {
	return `${name || 'Untitled'} · ${format(value)}`;
}

export function pieReadout(label: string, count: number, valueCount: number): string {
	return `${label} · ${moviesText(count)} (${percentOf(count, valueCount)}%)`;
}

export function coverageReadout(kind: 'filled' | 'empty', count: number, total: number): string {
	const state = kind === 'filled' ? 'with a value' : 'empty';
	return `${count} ${state} (${percentOf(count, total)}%)`;
}

/** Heading for the popover: the column name and how many movies the grid shows. */
export function chartHeading(label: string, total: number): string {
	return `${label} · ${moviesText(total)}`;
}

/** One line under the heading that says what the axes are. */
export function chartCaption(type: ChartType, label: string): string {
	switch (type) {
		case 'histogram':
			return `Number of movies (height) by ${label} (across)`;
		case 'line':
			return `Number of movies (height) by ${label} (across), joined as a line`;
		case 'cumulative':
			return `Share of movies (height) with a ${label} at or below each value (across)`;
		case 'density':
			return `Estimated share of movies (height) at each ${label} (across)`;
		case 'pie':
			return `Share of movies in each ${label} range`;
		case 'box':
			return `${label} (across). Box = middle half, line = median, dots = movies`;
		case 'strip':
			return `Each dot is one movie, placed by ${label} (across)`;
		case 'summary':
			return `Summary statistics for ${label}`;
		case 'topBottom':
			return `Highest and lowest movies by ${label}`;
		case 'coverage':
			return `Movies with and without a ${label}`;
	}
}
