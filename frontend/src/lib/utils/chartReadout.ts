/**
 * Text and selection helpers for the column chart readout: what a hovered or
 * focused mark says, and what the chart's axes mean.
 */
import type { ChartType } from '#lib/utils/columnCharts';
import type { ColumnView } from '#lib/utils/grid-config';

type Format = (n: number) => string;

/** What one charted row is called in a readout or caption, singular and plural. */
export type ItemNoun = { one: string; many: string };

export const MOVIE_NOUN: ItemNoun = { one: 'movie', many: 'movies' };

const NOUNS: Record<ColumnView, ItemNoun> = {
	movie: MOVIE_NOUN,
	book: { one: 'book', many: 'books' },
	webpage: { one: 'webpage', many: 'webpages' },
	claim: { one: 'claim', many: 'claims' },
	general: { one: 'item', many: 'items' },
};

/** The noun for the rows the Library shows in `view`. */
export function itemNounFor(view: ColumnView): ItemNoun {
	return NOUNS[view];
}

export function moviesText(n: number, noun: ItemNoun = MOVIE_NOUN): string {
	return `${n} ${n === 1 ? noun.one : noun.many}`;
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

/** How many titles a readout names before the rest collapse into "+N more". */
export const TITLES_SHOWN = 3;

/** Movie title for a readout; rows with no title still get a label. */
export const displayName = (name: string): string => name || 'Untitled';

/** The `max` titles with the largest values, for a readout. Ties fall back to title order so the text is stable. */
export function rankTitles(entries: { name: string; value: number }[], max = TITLES_SHOWN): string[] {
	return [...entries]
		.sort((a, b) => b.value - a.value || displayName(a.name).localeCompare(displayName(b.name)))
		.slice(0, max)
		.map((e) => displayName(e.name));
}

/**
 * Titles for a readout: the `shown` names, then "+N more" for the movies that weren't shown.
 * `total` is every movie behind the point, so the count stays right when `shown` is trimmed.
 * Empty when there are no movies.
 */
export function titlesText(shown: string[], total: number): string {
	if (total === 0) return '';
	const more = total - shown.length;
	return more > 0 ? `${shown.join(', ')}, +${more} more` : shown.join(', ');
}

/** Titles are appended after the aggregate with a middle dot, and only when there are any. */
const withTitles = (text: string, titles: string): string => (titles ? `${text} · ${titles}` : text);

/** `titles` is an optional `titlesText` for the movies in the bin. */
export function binReadout(
	bin: { lo: number; hi: number; count: number },
	format: Format,
	titles = '',
	noun: ItemNoun = MOVIE_NOUN,
): string {
	return withTitles(`${format(bin.lo)}–${format(bin.hi)} · ${moviesText(bin.count, noun)}`, titles);
}

export function lineReadout(
	bin: { lo: number; hi: number; count: number },
	format: Format,
	titles = '',
	noun: ItemNoun = MOVIE_NOUN,
): string {
	const mid = (bin.lo + bin.hi) / 2;
	return withTitles(
		`${format(mid)}: ${moviesText(bin.count, noun)} from ${format(bin.lo)} to ${format(bin.hi)}`,
		titles,
	);
}

/**
 * `rank` is 1-based: the movie at that position in ascending order, and everything below it.
 * `titles` is an optional `titlesText` for the movies at or below the point.
 */
export function cumulativeReadout(
	x: number,
	rank: number,
	total: number,
	format: Format,
	titles = '',
	noun: ItemNoun = MOVIE_NOUN,
): string {
	return withTitles(`${format(x)} · ${rank} of ${total} ${noun.many} (${percentOf(rank, total)}%) at or below`, titles);
}

/** `expected` is the density scaled to a count of movies per band of width `bandWidth`. */
export function densityReadout(
	x: number,
	expected: number,
	bandWidth: number,
	format: Format,
	noun: ItemNoun = MOVIE_NOUN,
): string {
	const rounded = Math.round(expected);
	const count = rounded === 0 ? `under 1 ${noun.one}` : `about ${moviesText(rounded, noun)}`;
	return `${format(x)} · ${count} in the ${format(bandWidth)} band around it`;
}

export function movieReadout(name: string, value: number, format: Format): string {
	return `${name || 'Untitled'} · ${format(value)}`;
}

export function pieReadout(label: string, count: number, valueCount: number, noun: ItemNoun = MOVIE_NOUN): string {
	return `${label} · ${moviesText(count, noun)} (${percentOf(count, valueCount)}%)`;
}

export function coverageReadout(kind: 'filled' | 'empty', count: number, total: number): string {
	const state = kind === 'filled' ? 'with a value' : 'empty';
	return `${count} ${state} (${percentOf(count, total)}%)`;
}

/** Heading for the popover: the column name and how many rows the grid shows. */
export function chartHeading(label: string, total: number, noun: ItemNoun = MOVIE_NOUN): string {
	return `${label} · ${moviesText(total, noun)}`;
}

/** One line under the heading that says what the axes are. */
export function chartCaption(type: ChartType, label: string, noun: ItemNoun = MOVIE_NOUN): string {
	const cap = noun.many.charAt(0).toUpperCase() + noun.many.slice(1);
	switch (type) {
		case 'histogram':
			return `Number of ${noun.many} (height) by ${label} (across)`;
		case 'line':
			return `Number of ${noun.many} (height) by ${label} (across), joined as a line`;
		case 'cumulative':
			return `Share of ${noun.many} (height) with a ${label} at or below each value (across)`;
		case 'density':
			return `Estimated share of ${noun.many} (height) at each ${label} (across)`;
		case 'pie':
			return `Share of ${noun.many} in each ${label} range`;
		case 'box':
			return `${label} (across). Box = middle half, line = median, dots = ${noun.many}`;
		case 'strip':
			return `Each dot is one ${noun.one}, placed by ${label} (across)`;
		case 'summary':
			return `Summary statistics for ${label}`;
		case 'topBottom':
			return `Highest and lowest ${noun.many} by ${label}`;
		case 'coverage':
			return `${cap} with and without a ${label}`;
	}
}
