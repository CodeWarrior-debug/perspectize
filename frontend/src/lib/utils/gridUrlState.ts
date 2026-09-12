/**
 * URL ↔ grid state synchronization utilities.
 * Serializes/deserializes AG Grid filter models to/from URL search params.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Data mode: 'all' = server-side, 'loaded' = client-side */
export type DataMode = 'all' | 'loaded';

/** Which columns the `q` search box matches against. */
export type SearchScopeKey = 'title' | 'desc' | 'channel' | 'tags';

/** All available search scopes — the search box matches everything by default. */
export const ALL_SEARCH_SCOPES: SearchScopeKey[] = ['title', 'desc', 'channel', 'tags'];

/** Parsed grid state from URL params */
export interface GridParams {
	mode: DataMode;
	sort: string; // AG Grid colId (e.g., 'views', 'updatedAt')
	dir: 'asc' | 'desc';
	page: number; // 1-indexed
	pageSize: number;
	q: string; // Text search
	qFields: SearchScopeKey[]; // Which columns `q` matches — defaults to all
	filters: Record<string, string>; // f.type=youtube, f.views=1000..5000, etc.
}

/** Default values — omitted from URL when matching */
export const GRID_DEFAULTS: GridParams = {
	mode: 'loaded',
	sort: 'updatedAt',
	dir: 'desc',
	page: 1,
	pageSize: 10,
	q: '',
	qFields: ALL_SEARCH_SCOPES,
	filters: {},
};

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

// ---------------------------------------------------------------------------
// GridParams serialization
// ---------------------------------------------------------------------------

/** Parse URLSearchParams into GridParams */
export function parseGridParams(params: URLSearchParams): GridParams {
	const mode = params.get('mode');
	const sort = params.get('sort');
	const dir = params.get('dir');
	const page = params.get('page');
	const pageSize = params.get('pageSize');
	const q = params.get('q');
	const qf = params.get('qf');

	const filters: Record<string, string> = {};
	for (const [key, value] of params.entries()) {
		if (key.startsWith('f.')) {
			const filterKey = key.slice(2); // strip 'f.' prefix
			filters[filterKey] = value;
		}
	}

	return {
		mode: mode === 'all' ? 'all' : GRID_DEFAULTS.mode,
		sort: sort ?? GRID_DEFAULTS.sort,
		dir: dir === 'asc' ? 'asc' : dir === 'desc' ? 'desc' : GRID_DEFAULTS.dir,
		page: page !== null && !isNaN(Number(page)) && Number(page) >= 1 ? Number(page) : GRID_DEFAULTS.page,
		pageSize:
			pageSize !== null && !isNaN(Number(pageSize)) && Number(pageSize) > 0 ? Number(pageSize) : GRID_DEFAULTS.pageSize,
		q: q ?? GRID_DEFAULTS.q,
		qFields: parseSearchScopes(qf),
		filters,
	};
}

/** Parse the `qf` URL value into a validated, de-duped list of scope keys. Falls back to "all" when absent, empty, or entirely invalid. */
function parseSearchScopes(qf: string | null): SearchScopeKey[] {
	if (!qf) return ALL_SEARCH_SCOPES;
	const valid = new Set(ALL_SEARCH_SCOPES);
	const parsed = qf
		.split(',')
		.map((s) => s.trim())
		.filter((s): s is SearchScopeKey => valid.has(s as SearchScopeKey));
	// De-dupe while preserving ALL_SEARCH_SCOPES order for a stable serialized form.
	const selected = new Set(parsed);
	return selected.size > 0 ? ALL_SEARCH_SCOPES.filter((s) => selected.has(s)) : ALL_SEARCH_SCOPES;
}

/** Serialize GridParams to URL search string (omitting defaults) */
export function serializeGridParams(state: GridParams): string {
	const params = new URLSearchParams();

	if (state.mode !== GRID_DEFAULTS.mode) params.set('mode', state.mode);
	if (state.sort !== GRID_DEFAULTS.sort) params.set('sort', state.sort);
	if (state.dir !== GRID_DEFAULTS.dir) params.set('dir', state.dir);
	if (state.page !== GRID_DEFAULTS.page) params.set('page', String(state.page));
	if (state.pageSize !== GRID_DEFAULTS.pageSize) params.set('pageSize', String(state.pageSize));
	if (state.q !== GRID_DEFAULTS.q) params.set('q', state.q);
	if (!sameScopes(state.qFields, GRID_DEFAULTS.qFields)) params.set('qf', state.qFields.join(','));

	for (const [key, value] of Object.entries(state.filters)) {
		params.set(`f.${key}`, value);
	}

	return params.toString();
}

function sameScopes(a: SearchScopeKey[], b: SearchScopeKey[]): boolean {
	return a.length === b.length && a.every((s) => b.includes(s));
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

/** GraphQL ContentSearchField enum values (backend `schema.graphql`) */
export type ContentSearchFieldGQL = 'TITLE' | 'DESCRIPTION' | 'CHANNEL_TITLE' | 'TAGS';

/** UI scope key → GraphQL ContentSearchField enum value */
const SCOPE_TO_GQL_FIELD: Record<SearchScopeKey, ContentSearchFieldGQL> = {
	title: 'TITLE',
	desc: 'DESCRIPTION',
	channel: 'CHANNEL_TITLE',
	tags: 'TAGS',
};

/** GraphQL ContentFilter input — defined here so Plan 02 (Wave 1) doesn't depend on Plan 03 */
export interface ContentFilterInput {
	contentType?: string;
	minLengthSeconds?: number;
	maxLengthSeconds?: number;
	search?: string;
	searchFields?: ContentSearchFieldGQL[];
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
	searchFields: SearchScopeKey[] = ALL_SEARCH_SCOPES,
): ContentFilterInput | undefined {
	const result: ContentFilterInput = {};
	let hasAny = false;

	if (search) {
		result.search = search;
		// The backend defaults an omitted searchFields to TITLE only, so the UI's default
		// (search everything) must always be sent explicitly — only a single-field scope
		// that happens to be exactly TITLE can safely rely on the server default instead.
		if (!(searchFields.length === 1 && searchFields[0] === 'title')) {
			result.searchFields = searchFields.map((s) => SCOPE_TO_GQL_FIELD[s]);
		}
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
