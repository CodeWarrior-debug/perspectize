/**
 * URL filter value syntax shared by the Library's column filters: set lists (`youtube_video,claim`),
 * number and date ranges (`1000..5000`, `2024-01..`, `..2024-06`), and the GraphQL ContentFilter
 * input those values become in "All Items" mode. A leaf module: nothing here reads the column list.
 */
import type { WebPageRole } from '#lib/queries/content/index.js';

/** GraphQL ContentFilter input the server accepts (backend `schema.graphql`). */
export interface ContentFilterInput {
	contentType?: string;
	contentTypes?: string[];
	/** Webpage rows only; any of the listed roles matches (OR). Other content types never match. */
	webPageRoles?: WebPageRole[];
	minLengthSeconds?: number;
	maxLengthSeconds?: number;
	search?: string;
	searchFields?: ('TITLE' | 'DESCRIPTION' | 'CHANNEL_TITLE' | 'TAGS' | 'CAST' | 'DIRECTOR')[];
	minViewCount?: number;
	maxViewCount?: number;
	minLikeCount?: number;
	maxLikeCount?: number;
	publishedAfter?: string;
	publishedBefore?: string;
	channelTitle?: string;
	tagContains?: string;
	descriptionSearch?: string;
	addedByUsername?: string;
	createdAfter?: string;
	createdBefore?: string;
	updatedAfter?: string;
	updatedBefore?: string;
	// Movie filters (movie rows only; other rows never match)
	personId?: string;
	personRole?: 'CAST' | 'DIRECTOR';
	genreContains?: string;
	castContains?: string;
	// Book filter (book rows only): case-insensitive contains on the first author.
	authorContains?: string;
	minPublishYear?: number;
	maxPublishYear?: number;
	minPages?: number;
	maxPages?: number;
	minBookRating?: number;
	maxBookRating?: number;
	ageRating?: string[];
	releasedAfter?: string;
	releasedBefore?: string;
	minBoxOffice?: number;
	maxBoxOffice?: number;
	minTmdbScore?: number;
	maxTmdbScore?: number;
}

/**
 * Split a comma-separated set-filter URL value, dropping blanks and duplicates.
 * Bookmarked URLs from before the youtube → youtube_video rename still say "youtube".
 */
export function parseSetValue(value: string): string[] {
	return [
		...new Set(
			value
				.split(',')
				.map((v) => v.trim().toLowerCase())
				.map((v) => (v === 'youtube' ? 'youtube_video' : v))
				.filter(Boolean),
		),
	];
}

/** Parse a `min..max` range string into numbers (either bound may be omitted; a bare number is both bounds). */
export function parseNumberRange(value: string): { min?: number; max?: number } {
	const sep = value.indexOf('..');
	if (sep === -1) {
		const n = Number(value);
		return isNaN(n) ? {} : { min: n, max: n };
	}
	const minStr = value.substring(0, sep);
	const maxStr = value.substring(sep + 2);
	const min = minStr ? Number(minStr) : undefined;
	const max = maxStr ? Number(maxStr) : undefined;
	return {
		min: min !== undefined && !isNaN(min) ? min : undefined,
		max: max !== undefined && !isNaN(max) ? max : undefined,
	};
}

/** Parse a `from..to` date range string (a bare date is the `from` bound only). */
export function parseDateRange(value: string): { from?: string; to?: string } {
	const sep = value.indexOf('..');
	if (sep === -1) return { from: value };
	return {
		from: value.substring(0, sep) || undefined,
		to: value.substring(sep + 2) || undefined,
	};
}

/**
 * GraphQL fields for a number range: the lower bound to `minKey`, the upper to `maxKey`. Only
 * bounds present in the value are set, so an empty bound never reaches the server.
 */
export function numberRangeFields(
	minKey: keyof ContentFilterInput,
	maxKey: keyof ContentFilterInput,
): (value: string) => Partial<ContentFilterInput> {
	return (value) => {
		const { min, max } = parseNumberRange(value);
		return {
			...(min !== undefined ? { [minKey]: min } : {}),
			...(max !== undefined ? { [maxKey]: max } : {}),
		};
	};
}

/** GraphQL fields for a date range: `from` to `fromKey`, `to` to `toKey`. */
export function dateRangeFields(
	fromKey: keyof ContentFilterInput,
	toKey: keyof ContentFilterInput,
): (value: string) => Partial<ContentFilterInput> {
	return (value) => {
		const { from, to } = parseDateRange(value);
		return {
			...(from ? { [fromKey]: from } : {}),
			...(to ? { [toKey]: to } : {}),
		};
	};
}

/** GraphQL field for a plain text filter (contains / exact, decided by the server field). */
export function textField(field: keyof ContentFilterInput): (value: string) => Partial<ContentFilterInput> {
	return (value) => ({ [field]: value });
}
