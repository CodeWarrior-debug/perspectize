/**
 * URL ↔ grid state synchronization utilities.
 * Serializes/deserializes AG Grid filter models to/from URL search params.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Data mode: 'all' = server-side, 'loaded' = client-side */
export type DataMode = 'all' | 'loaded';

/** One column of a multi-column sort, in priority order (first = primary). */
export interface SortSpec {
	col: string; // AG Grid colId (e.g., 'views', 'updatedAt')
	dir: 'asc' | 'desc';
}

/** Parsed grid state from URL params */
export interface GridParams {
	mode: DataMode;
	sorts: SortSpec[]; // Multi-column sort, priority order. Empty means "no sort" (client mode only).
	page: number; // 1-indexed
	pageSize: number;
	q: string; // Text search
	filters: Record<string, string>; // f.type=youtube, f.views=1000..5000, etc.
}

/** Default values — omitted from URL when matching */
export const GRID_DEFAULTS: GridParams = {
	mode: 'loaded',
	sorts: [{ col: 'updatedAt', dir: 'desc' }],
	page: 1,
	pageSize: 10,
	q: '',
	filters: {},
};

/** Max columns considered for a multi-column sort — matches AG Grid's practical limit for this table. */
const MAX_SORT_COLUMNS = 5;

function sortsEqual(a: SortSpec[], b: SortSpec[]): boolean {
	return a.length === b.length && a.every((s, i) => s.col === b[i].col && s.dir === b[i].dir);
}

/** Serialize a SortSpec[] to the URL `sort` param format: "colA.desc,colB.asc" */
function serializeSorts(sorts: SortSpec[]): string {
	return sorts.map((s) => `${s.col}.${s.dir}`).join(',');
}

/** Sentinel URL value for "sorting explicitly cleared" (distinct from the param being absent). */
const NO_SORT = 'none';

/** Parse the URL `sort` param ("colA.desc,colB.asc") back into a SortSpec[]. */
function parseSorts(raw: string | null): SortSpec[] {
	if (!raw) return GRID_DEFAULTS.sorts;
	if (raw === NO_SORT) return [];
	const sorts: SortSpec[] = [];
	const seen = new Set<string>();
	for (const part of raw.split(',')) {
		const dotIdx = part.lastIndexOf('.');
		if (dotIdx === -1) continue;
		const col = part.slice(0, dotIdx);
		const dir = part.slice(dotIdx + 1);
		if (!col || (dir !== 'asc' && dir !== 'desc') || seen.has(col)) continue;
		seen.add(col);
		sorts.push({ col, dir });
		if (sorts.length >= MAX_SORT_COLUMNS) break;
	}
	// A non-empty but entirely malformed param (no dot, bad direction) parses to
	// nothing usable — fall back to the default rather than silently clearing sort.
	return sorts.length > 0 ? sorts : GRID_DEFAULTS.sorts;
}

/** Serialize a SortSpec[] to its URL form, using the NO_SORT sentinel for an explicit clear. */
function serializeSortsForUrl(sorts: SortSpec[]): string {
	return sorts.length === 0 ? NO_SORT : serializeSorts(sorts);
}

// ---------------------------------------------------------------------------
// AG Grid colId ↔ GraphQL ContentSortBy bidirectional maps
// ---------------------------------------------------------------------------

/** AG Grid colId → GraphQL ContentSortBy */
export const COL_TO_SORT: Record<string, string> = {
	item: 'NAME',
	type: 'NAME', // Type column not independently sortable
	duration: 'LENGTH', // New! Was NAME fallback
	views: 'VIEW_COUNT',
	likes: 'LIKE_COUNT',
	publishDate: 'PUBLISHED_AT',
	channel: 'CHANNEL_TITLE', // New! Was NAME fallback
	createdAt: 'CREATED_AT',
	updatedAt: 'UPDATED_AT',
};

/** GraphQL ContentSortBy → AG Grid colId (for URL → grid state) */
export const SORT_TO_COL: Record<string, string> = {
	NAME: 'item',
	LENGTH: 'duration',
	VIEW_COUNT: 'views',
	LIKE_COUNT: 'likes',
	PUBLISHED_AT: 'publishDate',
	CHANNEL_TITLE: 'channel',
	CREATED_AT: 'createdAt',
	UPDATED_AT: 'updatedAt',
};

/**
 * Convert a SortSpec[] (URL/AG Grid shape) to the GraphQL `sorts` input list.
 * Unknown colIds (not in COL_TO_SORT) are dropped. Returns undefined for an
 * empty result so callers can omit the variable entirely.
 */
export function sortsToGraphQL(sorts: SortSpec[]): { field: string; order: 'ASC' | 'DESC' }[] | undefined {
	const result = sorts
		.filter((s) => COL_TO_SORT[s.col])
		.map((s) => ({ field: COL_TO_SORT[s.col], order: s.dir === 'asc' ? ('ASC' as const) : ('DESC' as const) }));
	return result.length > 0 ? result : undefined;
}

// ---------------------------------------------------------------------------
// GridParams serialization
// ---------------------------------------------------------------------------

/** Parse URLSearchParams into GridParams */
export function parseGridParams(params: URLSearchParams): GridParams {
	const mode = params.get('mode');
	const sort = params.get('sort');
	const page = params.get('page');
	const pageSize = params.get('pageSize');
	const q = params.get('q');

	const filters: Record<string, string> = {};
	for (const [key, value] of params.entries()) {
		if (key.startsWith('f.')) {
			const filterKey = key.slice(2); // strip 'f.' prefix
			filters[filterKey] = value;
		}
	}

	return {
		mode: mode === 'all' ? 'all' : GRID_DEFAULTS.mode,
		sorts: parseSorts(sort),
		page: page !== null && !isNaN(Number(page)) && Number(page) >= 1 ? Number(page) : GRID_DEFAULTS.page,
		pageSize:
			pageSize !== null && !isNaN(Number(pageSize)) && Number(pageSize) > 0 ? Number(pageSize) : GRID_DEFAULTS.pageSize,
		q: q ?? GRID_DEFAULTS.q,
		filters,
	};
}

/** Serialize GridParams to URL search string (omitting defaults) */
export function serializeGridParams(state: GridParams): string {
	const params = new URLSearchParams();

	if (state.mode !== GRID_DEFAULTS.mode) params.set('mode', state.mode);
	if (!sortsEqual(state.sorts, GRID_DEFAULTS.sorts)) params.set('sort', serializeSortsForUrl(state.sorts));
	if (state.page !== GRID_DEFAULTS.page) params.set('page', String(state.page));
	if (state.pageSize !== GRID_DEFAULTS.pageSize) params.set('pageSize', String(state.pageSize));
	if (state.q !== GRID_DEFAULTS.q) params.set('q', state.q);

	for (const [key, value] of Object.entries(state.filters)) {
		params.set(`f.${key}`, value);
	}

	return params.toString();
}

// ---------------------------------------------------------------------------
// AG Grid filter model types
// ---------------------------------------------------------------------------

type AGTextFilter = { filterType: 'text'; type: string; filter: string };
type AGNumberFilter = { filterType: 'number'; type: string; filter?: number; filterTo?: number };
type AGDateFilter = { filterType: 'date'; type: string; dateFrom?: string; dateTo?: string };

// ---------------------------------------------------------------------------
// Column mappings: AG Grid colId ↔ URL f.* param key
// ---------------------------------------------------------------------------

/** AG Grid colId → URL f.* param key */
const COL_TO_FILTER_KEY: Record<string, string> = {
	item: 'item',
	type: 'type',
	duration: 'duration',
	views: 'views',
	likes: 'likes',
	publishDate: 'date',
	channel: 'channel',
	tags: 'tags',
	description: 'desc',
	createdAt: 'added',
	updatedAt: 'updated',
};

/** URL f.* param key → AG Grid colId */
const FILTER_KEY_TO_COL: Record<string, string> = Object.fromEntries(
	Object.entries(COL_TO_FILTER_KEY).map(([col, key]) => [key, col]),
);

/** Columns whose f.* params are number ranges (vs date ranges or text) */
const NUMBER_RANGE_COLS = new Set(['duration', 'views', 'likes']);

/** Columns whose f.* params are date ranges */
const DATE_RANGE_COLS = new Set(['publishDate', 'createdAt', 'updatedAt']);

// ---------------------------------------------------------------------------
// filterToUrlParams — AG Grid FilterModel → URL f.* params
// ---------------------------------------------------------------------------

/**
 * Convert AG Grid FilterModel to URL f.* params.
 * Handles text, number (greaterThan/lessThan/inRange), and date filters.
 */
export function filterToUrlParams(filterModel: Record<string, unknown>): Record<string, string> {
	const result: Record<string, string> = {};

	for (const [colId, raw] of Object.entries(filterModel)) {
		const filterKey = COL_TO_FILTER_KEY[colId];
		if (!filterKey) continue; // unknown column — skip

		const f = raw as AGTextFilter | AGNumberFilter | AGDateFilter;

		if (f.filterType === 'text') {
			const textFilter = f as AGTextFilter;
			if (textFilter.filter) {
				result[filterKey] = textFilter.filter;
			}
		} else if (f.filterType === 'number') {
			const numFilter = f as AGNumberFilter;
			const min = numFilter.filter;
			const max = numFilter.filterTo;

			if (numFilter.type === 'inRange' && min !== undefined && max !== undefined) {
				result[filterKey] = `${min}..${max}`;
			} else if ((numFilter.type === 'greaterThan' || numFilter.type === 'greaterThanOrEqual') && min !== undefined) {
				result[filterKey] = `${min}..`;
			} else if ((numFilter.type === 'lessThan' || numFilter.type === 'lessThanOrEqual') && min !== undefined) {
				result[filterKey] = `..${min}`;
			}
		} else if (f.filterType === 'date') {
			const dateFilter = f as AGDateFilter;
			const from = dateFilter.dateFrom ? dateFilter.dateFrom.substring(0, 7) : ''; // YYYY-MM
			const to = dateFilter.dateTo ? dateFilter.dateTo.substring(0, 7) : '';

			if (from && to) {
				result[filterKey] = `${from}..${to}`;
			} else if (from) {
				result[filterKey] = `${from}..`;
			} else if (to) {
				result[filterKey] = `..${to}`;
			}
		}
	}

	return result;
}

// ---------------------------------------------------------------------------
// urlParamsToFilter — URL f.* params → AG Grid FilterModel
// ---------------------------------------------------------------------------

/**
 * Convert URL f.* params back to AG Grid FilterModel.
 * Range syntax: "1000.." (min only), "..5000" (max only), "1000..5000" (both).
 */
export function urlParamsToFilter(filters: Record<string, string>): Record<string, unknown> {
	const result: Record<string, unknown> = {};

	for (const [filterKey, value] of Object.entries(filters)) {
		const colId = FILTER_KEY_TO_COL[filterKey];
		if (!colId) continue;

		if (DATE_RANGE_COLS.has(colId)) {
			// Date range filter
			const sep = value.indexOf('..');
			if (sep === -1) {
				// Plain text date — treat as exact (from only)
				result[colId] = {
					filterType: 'date',
					type: 'equals',
					dateFrom: value,
				} satisfies AGDateFilter;
			} else {
				const from = value.substring(0, sep);
				const to = value.substring(sep + 2);

				if (from && to) {
					result[colId] = {
						filterType: 'date',
						type: 'inRange',
						dateFrom: from,
						dateTo: to,
					} satisfies AGDateFilter;
				} else if (from) {
					result[colId] = {
						filterType: 'date',
						type: 'greaterThanOrEqual',
						dateFrom: from,
					} satisfies AGDateFilter;
				} else if (to) {
					result[colId] = {
						filterType: 'date',
						type: 'lessThanOrEqual',
						dateTo: to,
					} satisfies AGDateFilter;
				}
			}
		} else if (NUMBER_RANGE_COLS.has(colId)) {
			// Number range filter
			const sep = value.indexOf('..');
			if (sep === -1) {
				// Exact number
				const num = Number(value);
				if (!isNaN(num)) {
					result[colId] = {
						filterType: 'number',
						type: 'equals',
						filter: num,
					} satisfies AGNumberFilter;
				}
			} else {
				const minStr = value.substring(0, sep);
				const maxStr = value.substring(sep + 2);
				const min = minStr ? Number(minStr) : undefined;
				const max = maxStr ? Number(maxStr) : undefined;

				if (min !== undefined && max !== undefined && !isNaN(min) && !isNaN(max)) {
					result[colId] = {
						filterType: 'number',
						type: 'inRange',
						filter: min,
						filterTo: max,
					} satisfies AGNumberFilter;
				} else if (min !== undefined && !isNaN(min)) {
					result[colId] = {
						filterType: 'number',
						type: 'greaterThan',
						filter: min,
					} satisfies AGNumberFilter;
				} else if (max !== undefined && !isNaN(max)) {
					result[colId] = {
						filterType: 'number',
						type: 'lessThan',
						filter: max,
					} satisfies AGNumberFilter;
				}
			}
		} else {
			// Text filter (type, channel, tags, description)
			result[colId] = {
				filterType: 'text',
				type: 'contains',
				filter: value,
			} satisfies AGTextFilter;
		}
	}

	return result;
}

// ---------------------------------------------------------------------------
// GraphQL ContentFilter input
// ---------------------------------------------------------------------------

/** GraphQL ContentFilter input — defined here so Plan 02 (Wave 1) doesn't depend on Plan 03 */
export interface ContentFilterInput {
	contentType?: string;
	minLengthSeconds?: number;
	maxLengthSeconds?: number;
	search?: string;
	minViewCount?: number;
	maxViewCount?: number;
	minLikeCount?: number;
	maxLikeCount?: number;
	publishedAfter?: string;
	publishedBefore?: string;
	channelTitle?: string;
	tagContains?: string;
	descriptionSearch?: string;
	createdAfter?: string;
	createdBefore?: string;
	updatedAfter?: string;
	updatedBefore?: string;
}

/**
 * Parse a range string into {min, max} numbers.
 * Returns undefined for unparseable values.
 */
function parseNumberRange(value: string): { min?: number; max?: number } {
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

/**
 * Parse a range string into {from, to} date strings.
 */
function parseDateRange(value: string): { from?: string; to?: string } {
	const sep = value.indexOf('..');
	if (sep === -1) return { from: value };
	return {
		from: value.substring(0, sep) || undefined,
		to: value.substring(sep + 2) || undefined,
	};
}

/**
 * Convert URL f.* params and search string to GraphQL ContentFilter input for server-side mode.
 * Returns undefined if no filters are active.
 */
export function urlParamsToGraphQLFilter(
	filters: Record<string, string>,
	search: string,
): ContentFilterInput | undefined {
	const result: ContentFilterInput = {};
	let hasAny = false;

	if (search) {
		result.search = search;
		hasAny = true;
	}

	for (const [filterKey, value] of Object.entries(filters)) {
		if (!value) continue;

		switch (filterKey) {
			case 'item':
				result.search = value;
				hasAny = true;
				break;

			case 'type':
				result.contentType = value.toUpperCase();
				hasAny = true;
				break;

			case 'views': {
				const { min, max } = parseNumberRange(value);
				if (min !== undefined) {
					result.minViewCount = min;
					hasAny = true;
				}
				if (max !== undefined) {
					result.maxViewCount = max;
					hasAny = true;
				}
				break;
			}

			case 'likes': {
				const { min, max } = parseNumberRange(value);
				if (min !== undefined) {
					result.minLikeCount = min;
					hasAny = true;
				}
				if (max !== undefined) {
					result.maxLikeCount = max;
					hasAny = true;
				}
				break;
			}

			case 'duration': {
				const { min, max } = parseNumberRange(value);
				if (min !== undefined) {
					result.minLengthSeconds = min;
					hasAny = true;
				}
				if (max !== undefined) {
					result.maxLengthSeconds = max;
					hasAny = true;
				}
				break;
			}

			case 'date': {
				const { from, to } = parseDateRange(value);
				if (from) {
					result.publishedAfter = from;
					hasAny = true;
				}
				if (to) {
					result.publishedBefore = to;
					hasAny = true;
				}
				break;
			}

			case 'channel':
				result.channelTitle = value;
				hasAny = true;
				break;

			case 'tags':
				result.tagContains = value;
				hasAny = true;
				break;

			case 'desc':
				result.descriptionSearch = value;
				hasAny = true;
				break;

			case 'added': {
				const { from, to } = parseDateRange(value);
				if (from) {
					result.createdAfter = from;
					hasAny = true;
				}
				if (to) {
					result.createdBefore = to;
					hasAny = true;
				}
				break;
			}

			case 'updated': {
				const { from, to } = parseDateRange(value);
				if (from) {
					result.updatedAfter = from;
					hasAny = true;
				}
				if (to) {
					result.updatedBefore = to;
					hasAny = true;
				}
				break;
			}
		}
	}

	return hasAny ? result : undefined;
}
