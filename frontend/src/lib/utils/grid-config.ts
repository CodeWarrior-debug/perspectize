/**
 * Extracted AG Grid configuration logic from ActivityTable.svelte.
 * Pure functions and constants that can be unit-tested without a browser.
 */
import type { ContentItem, ContentType } from '$lib/queries/content';
import {
	percentLikedValueGetter,
	formatTags,
	contentTags,
	movieResponse,
	ageRatingRank,
	boxOfficeValueGetter,
	vsBudgetValueGetter,
	genreValueGetter,
	ratedValueGetter,
	releasedValueGetter,
	tmdbScoreValueGetter,
	moviePeople,
} from './formatting';

/**
 * Display label for a content type — used by the type column valueGetter.
 * Known types use CONTENT_TYPE_LABELS; others get first letter capitalized, rest lowercased.
 */
export function capitalizeContentType(contentType: string | undefined): string {
	if (!contentType) return '';
	const label = CONTENT_TYPE_LABELS[contentType.toUpperCase() as ContentType];
	if (label) return label;
	return contentType.charAt(0).toUpperCase() + contentType.slice(1).toLowerCase();
}

/**
 * Every content type, in the order the Type column's checkbox filter lists them.
 * Hardcoded on purpose (mirrors the backend ContentType enum) — the Record forces
 * a new ContentType to be given a label here (Partial while CLAIM is commented out).
 */
const CONTENT_TYPE_LABELS: Partial<Record<ContentType, string>> = {
	YOUTUBE_VIDEO: 'YouTube Video',
	// CLAIM: 'Claim', // not ready in the UI yet; uncomment to offer it in the filter
	BIBLE_PASSAGE: 'Bible Passage',
	MOVIE: 'Movie',
};

/** Type-filter options. `value` is the lowercased form used in the filter model and `f.type=` URL param. */
export const CONTENT_TYPE_OPTIONS: readonly { value: string; label: string }[] = Object.entries(
	CONTENT_TYPE_LABELS,
).map(([type, label]) => ({ value: type.toLowerCase(), label }));

/** Rated-filter options: the standard US certifications. `value` is lowercased like every set-filter URL value; the server gets it uppercased. */
export const AGE_RATING_OPTIONS: readonly { value: string; label: string }[] = [
	'G',
	'PG',
	'PG-13',
	'R',
	'NC-17',
	'NR',
].map((r) => ({ value: r.toLowerCase(), label: r }));

/** Display label for a set-filter value on column `colId` (content type name, or the certification in capitals). */
export function setFilterValueLabel(colId: string, value: string): string {
	return colId === 'rated' ? value.toUpperCase() : contentTypeLabel(value);
}

/** Display label for a lowercased content type value (falls back to the raw value). */
export function contentTypeLabel(value: string): string {
	return CONTENT_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/**
 * Duration comparator for AG Grid column sorting.
 * Compares by raw length (seconds) from row data.
 */
export function durationComparator(
	_valueA: unknown,
	_valueB: unknown,
	nodeA: { data?: Pick<ContentItem, 'length'> } | undefined,
	nodeB: { data?: Pick<ContentItem, 'length'> } | undefined,
): number {
	const a = nodeA?.data?.length ?? 0;
	const b = nodeB?.data?.length ?? 0;
	return a - b;
}

/**
 * AG Grid comparator that keeps unknown (null) values last in BOTH directions.
 * AG Grid negates the comparator result for descending sorts, so when descending the
 * sign for a null is flipped. Used for Loaded-mode (client) sort of Movie columns,
 * matching the server (NULLs last) and compareContentBySorts.
 */
export function unknownLastComparator(
	valueA: number | null | undefined,
	valueB: number | null | undefined,
	_nodeA?: unknown,
	_nodeB?: unknown,
	isDescending?: boolean,
): number {
	const aNull = valueA == null;
	const bNull = valueB == null;
	if (aNull && bNull) return 0;
	if (aNull) return isDescending ? -1 : 1;
	if (bNull) return isDescending ? 1 : -1;
	return valueA - valueB;
}

/** Comparator for the Rated column (string certification values): by rating rank, unrated last in both directions. */
export function ratedComparator(
	valueA: string | null | undefined,
	valueB: string | null | undefined,
	nodeA?: unknown,
	nodeB?: unknown,
	isDescending?: boolean,
): number {
	return unknownLastComparator(ageRatingRank(valueA), ageRatingRank(valueB), nodeA, nodeB, isDescending);
}

/** Comparator for the Released column (ISO dates): chronological, unknown last in both directions. */
export function releasedComparator(
	valueA: string | null | undefined,
	valueB: string | null | undefined,
	nodeA?: unknown,
	nodeB?: unknown,
	isDescending?: boolean,
): number {
	const time = (v: string | null | undefined) => {
		const t = v ? Date.parse(v) : NaN;
		return Number.isNaN(t) ? null : t;
	};
	return unknownLastComparator(time(valueA), time(valueB), nodeA, nodeB, isDescending);
}

// ---------------------------------------------------------------------------
// Column metadata — the single source of truth
// ---------------------------------------------------------------------------

/**
 * One entry per ActivityTable column. Everything below that used to be five
 * separately hand-maintained lists (the column picker's DATA_COLUMNS/
 * INTERNAL_COLUMNS, the sort picker's SORTABLE_COLUMNS, the mobile/Loaded-mode
 * SORT_VALUE_GETTERS, gridUrlState.ts's COL_TO_SORT/SORT_TO_COL and
 * COL_TO_FILTER_KEY, and FilterChips.svelte's COLUMN_LABELS) is now derived
 * from this one array, so a column can no longer be added to the grid and
 * left out of one of those places by mistake — see the UI gap audit, gap #1
 * (the missing Category column), and the structural fix suggested in
 * .docs/UI_THOROUGHNESS_CHECKLIST.md §3.1.
 *
 * `colId` and `label` must match the `colId`/`headerName` on the
 * corresponding ColDef in ActivityTable.svelte — column-registry-parity.test.ts
 * and column-label-parity.test.ts read that file's source and fail if they
 * don't (kept as an extra guard even though this refactor makes the drift
 * this project actually hit — a column present in one list but not
 * another — structurally impossible for anything derived from COLUMNS below).
 */
export interface ColumnMeta {
	colId: string;
	/** Canonical label — must equal the grid column's headerName. */
	label: string;
	/**
	 * Column-picker visibility: 'data' = every user can toggle it,
	 * 'admin' = admin-only, 'none' = never offered (always visible, or an
	 * action column like perspectize with no data to hide).
	 */
	picker: 'data' | 'admin' | 'none';
	/**
	 * Offered in the sort picker and used for client-side (Loaded mode /
	 * mobile card list) sorting. `type` is sortable in the grid itself (as a
	 * NAME alias — see serverSort) but deliberately excluded from the picker,
	 * since it isn't an independently sortable column.
	 */
	sortable: boolean;
	/** Row-value extractor for client-side sorting. Required when `sortable`. */
	sortValue?: (row: ContentItem) => string | number | null;
	/**
	 * Backend ContentSortBy enum value this column sorts by in "All Items"
	 * mode. Some non-sortable-in-the-picker columns still have one (e.g.
	 * `type`, aliased to NAME) because the grid's own header click can still
	 * trigger a sort for them.
	 */
	serverSort?: string;
	/**
	 * Sortable only client-side ("Loaded" mode and the mobile card list): the backend's
	 * ContentSortBy has no matching key. Disabled in "All Items" mode, where a header
	 * click or picker entry would otherwise silently do nothing.
	 */
	clientOnlySort?: boolean;
	/** URL `f.<filterKey>=` param key, if this column has a filter. */
	filterKey?: string;
	/** Row-value extractor for client-side filtering (mobile card list). */
	filterValue?: (row: ContentItem) => string | number | null;
	/** How a filter value string is parsed: a `min..max` range, or plain text `contains`. */
	filterRange?: 'number' | 'date';
	/** Date filter is whole-day (`YYYY-MM-DD`) rather than the default month (`YYYY-MM`) URL precision. */
	filterDay?: boolean;
	/** Filter is a checkbox list: URL value is comma-separated, model is `{ filterType: 'set', values }`. */
	filterSet?: boolean;
}

/**
 * Every ActivityTable column, in the same order they appear in the grid.
 * `perspectize` and `item` are `picker: 'none'` — perspectize has no data to
 * filter/sort/hide, and item is the only column carrying a video's title/
 * thumbnail, so hiding it would leave rows with no way to identify which
 * video they are; it's always visible and never offered as a toggle.
 */
export const COLUMNS: readonly ColumnMeta[] = [
	{ colId: 'perspectize', label: '', picker: 'none', sortable: false },
	{
		colId: 'item',
		label: 'Item',
		picker: 'none',
		sortable: true,
		sortValue: (row) => row.name?.toLowerCase() ?? null,
		serverSort: 'NAME',
	},
	{
		colId: 'type',
		label: 'Type',
		picker: 'data',
		sortable: false, // NAME alias, not independently sortable — see serverSort below
		serverSort: 'NAME',
		filterKey: 'type',
		filterValue: (row) => row.contentType?.toLowerCase() ?? null,
		filterSet: true,
	},
	{ colId: 'category', label: 'Category', picker: 'data', sortable: false },
	// Movie columns (MOVIE rows read their `response` JSON; see formatting.ts). Shown by
	// default only when the type filter is exactly MOVIE (defaultColumnVisibility below).
	{
		colId: 'genre',
		label: 'Genre',
		picker: 'data',
		sortable: false,
		filterKey: 'genre',
		filterValue: (row) => genreValueGetter({ data: row })?.toLowerCase() ?? null,
	},
	{
		colId: 'rated',
		label: 'Rated',
		picker: 'data',
		sortable: true,
		// Orders by rating (G < PG < PG-13 < R < NC-17, unrated last), not A-Z; the server does the same.
		sortValue: (row) => ageRatingRank(movieResponse(row)?.certification),
		serverSort: 'AGE_RATING',
		filterKey: 'rated',
		filterValue: (row) => ratedValueGetter({ data: row })?.toLowerCase() ?? null,
		filterSet: true,
	},
	// One column for people: directors first, then billed cast. Not sortable (a person list has no order);
	// searched via the Cast / Director search scopes instead.
	{ colId: 'cast', label: 'Cast', picker: 'data', sortable: false },
	{
		colId: 'duration',
		label: 'Duration',
		picker: 'data',
		sortable: true,
		sortValue: (row) => row.length,
		serverSort: 'LENGTH',
		filterKey: 'duration',
		filterValue: (row) => row.length,
		filterRange: 'number',
	},
	{
		colId: 'views',
		label: 'Views',
		picker: 'data',
		sortable: true,
		sortValue: (row) => row.viewCount,
		serverSort: 'VIEW_COUNT',
		filterKey: 'views',
		filterValue: (row) => row.viewCount,
		filterRange: 'number',
	},
	{
		colId: 'likes',
		label: 'Likes',
		picker: 'data',
		sortable: true,
		sortValue: (row) => row.likeCount,
		serverSort: 'LIKE_COUNT',
		filterKey: 'likes',
		filterValue: (row) => row.likeCount,
		filterRange: 'number',
	},
	{
		colId: 'percentLiked',
		label: '% Liked',
		picker: 'data',
		sortable: true,
		// Sorts server-side via ContentSortBy.PERCENT_LIKED in "All Items" mode and
		// client-side here (percentLikedValueGetter, shared with the grid column
		// itself) for "Loaded" mode and the mobile card list. No filter — a real
		// filter would need a backend field (see PR notes).
		sortValue: (row) => percentLikedValueGetter({ data: row }),
		serverSort: 'PERCENT_LIKED',
	},
	// Released has no server sort key (PUBLISHED_AT reads the YouTube path), so it sorts client-side only.
	{
		colId: 'released',
		label: 'Released',
		picker: 'data',
		sortable: true,
		sortValue: (row) => releasedValueGetter({ data: row }),
		clientOnlySort: true,
		filterKey: 'released',
		filterValue: (row) => releasedValueGetter({ data: row }),
		filterRange: 'date',
		filterDay: true,
	},
	{
		colId: 'boxOffice',
		label: 'Box office',
		picker: 'data',
		sortable: true,
		sortValue: (row) => boxOfficeValueGetter({ data: row }),
		serverSort: 'BOX_OFFICE',
		filterKey: 'boxoffice',
		filterValue: (row) => boxOfficeValueGetter({ data: row }),
		filterRange: 'number',
	},
	{
		colId: 'vsBudget',
		label: 'Vs. budget',
		picker: 'data',
		sortable: true,
		sortValue: (row) => vsBudgetValueGetter({ data: row }),
		serverSort: 'VS_BUDGET',
		// No filter on purpose: it is derived (revenue / budget) and the server has no field for it, so
		// a filter would apply in "Loaded" mode only and be silently dropped in "All Items".
	},
	{
		colId: 'tmdbScore',
		label: 'TMDB Score',
		picker: 'data',
		sortable: true,
		// No ContentSortBy key for the TMDB vote average, so client-side only.
		sortValue: (row) => tmdbScoreValueGetter({ data: row }),
		clientOnlySort: true,
		filterKey: 'tmdb',
		filterValue: (row) => tmdbScoreValueGetter({ data: row }),
		filterRange: 'number',
	},
	{
		colId: 'publishDate',
		label: 'Date',
		picker: 'data',
		sortable: true,
		sortValue: (row) => row.publishedAt,
		serverSort: 'PUBLISHED_AT',
		filterKey: 'date',
		filterValue: (row) => row.publishedAt,
		filterRange: 'date',
	},
	{
		colId: 'channel',
		label: 'Channel',
		picker: 'data',
		sortable: true,
		sortValue: (row) => row.channelTitle?.toLowerCase() ?? null,
		serverSort: 'CHANNEL_TITLE',
		filterKey: 'channel',
		filterValue: (row) => row.channelTitle?.toLowerCase() ?? null,
	},
	{
		colId: 'user',
		label: 'User',
		picker: 'data',
		sortable: true,
		sortValue: (row) => row.addedByUsername?.toLowerCase() ?? null,
		serverSort: 'ADDED_BY',
		filterKey: 'user',
		filterValue: (row) => row.addedByUsername?.toLowerCase() ?? null,
	},
	{
		colId: 'tags',
		label: 'Tags',
		picker: 'data',
		sortable: false,
		filterKey: 'tags',
		filterValue: (row) => formatTags(contentTags(row)).toLowerCase(),
	},
	{
		colId: 'description',
		label: 'Description',
		picker: 'data',
		sortable: false,
		filterKey: 'desc',
		filterValue: (row) => row.description?.toLowerCase() ?? null,
	},
	// Movie picker-only columns (never in the default set).
	{ colId: 'budget', label: 'Budget', picker: 'data', sortable: false },
	{ colId: 'votes', label: 'Votes', picker: 'data', sortable: false },
	{ colId: 'collection', label: 'Collection', picker: 'data', sortable: false },
	{ colId: 'synopsis', label: 'Synopsis', picker: 'data', sortable: false },
	{ colId: 'tmdbId', label: 'TMDB ID', picker: 'data', sortable: false },
	{
		colId: 'createdAt',
		label: 'Date Added',
		picker: 'data',
		sortable: true,
		sortValue: (row) => row.createdAt,
		serverSort: 'CREATED_AT',
		filterKey: 'added',
		filterValue: (row) => row.createdAt,
		filterRange: 'date',
	},
	{
		colId: 'updatedAt',
		label: 'Updated',
		picker: 'data',
		sortable: true,
		sortValue: (row) => row.updatedAt,
		serverSort: 'UPDATED_AT',
		filterKey: 'updated',
		filterValue: (row) => row.updatedAt,
		filterRange: 'date',
	},
	{ colId: 'id', label: 'Content ID', picker: 'admin', sortable: false },
	{ colId: 'addedByUserID', label: 'Submitter', picker: 'admin', sortable: false },
	{ colId: 'url', label: 'Source URL', picker: 'admin', sortable: false },
] as const;

// ---------------------------------------------------------------------------
// Default column visibility (responsive tiers x Movie set)
// ---------------------------------------------------------------------------

export type ResponsiveTier = 'xs' | 'sm' | 'md' | 'lg';

/** True when the `f.type` URL value names exactly one type and it is MOVIE. */
export function isMovieOnlyTypeFilter(typeFilter: string | undefined): boolean {
	if (!typeFilter) return false;
	const types = typeFilter
		.split(',')
		.map((t) => t.trim().toLowerCase())
		.filter(Boolean);
	return types.length === 1 && types[0] === 'movie';
}

/** Per-tier column lists. Columns in `hidden` are forced off; createdAt/updatedAt and the admin columns are in neither list (colDef `hide: true`, picker only). */
const MOVIE_ONLY_PICKER = ['budget', 'votes', 'collection', 'synopsis', 'tmdbId'];
const MOVIE_DEFAULT_COLS = ['genre', 'rated', 'cast', 'released', 'boxOffice', 'vsBudget', 'tmdbScore'];

/**
 * Which grid columns the responsive system shows at a tier. With the type filter
 * exactly MOVIE (Type is redundant when one type is in view) the Movie default
 * set applies: ◎ Film Genre Rated Cast Duration Released Box office Vs. budget
 * TMDB Score Tags (Date Added, Budget, Collection, Votes, Synopsis, TMDB ID stay
 * in the picker). Any other filter keeps the YouTube layout and hides the Movie
 * columns, which would be empty. Mirrored by the colDef `hide` flags in
 * ActivityTable.svelte (initial default); this is the override that wins.
 */
export function defaultColumnVisibility(
	tier: ResponsiveTier,
	movieOnly: boolean,
): { visible: string[]; hidden: string[] } {
	const sm = tier !== 'xs';
	const md = tier === 'md' || tier === 'lg';
	const lg = tier === 'lg';
	const visible: string[] = movieOnly ? ['perspectize', 'item'] : ['item', 'type', 'perspectize'];
	if (movieOnly) {
		if (sm) visible.push('genre', 'rated');
		if (md) visible.push('cast', 'duration', 'released');
		if (lg) visible.push('boxOffice', 'vsBudget', 'tmdbScore', 'tags');
	} else {
		if (sm) visible.push('category', 'channel');
		if (md) visible.push('duration', 'publishDate');
		if (lg) visible.push('views', 'likes', 'percentLiked', 'tags');
	}
	const managed = [
		'type',
		'category',
		'channel',
		'duration',
		'publishDate',
		'views',
		'likes',
		'percentLiked',
		// Picker-only: adding it to the lg set overflows the 1212px grid (movieColumns.test.ts).
		'user',
		'tags',
		'description',
		...MOVIE_DEFAULT_COLS,
		...MOVIE_ONLY_PICKER,
	];
	return { visible, hidden: managed.filter((c) => !visible.includes(c)) };
}

/** Column-picker registry entry — just the fields ColumnPickerDialog/SortPickerDialog need. */
export interface TogglableColumn {
	colId: string;
	label: string;
}

/** Data columns every user can show/hide, in column-picker order. */
export const DATA_COLUMNS: readonly TogglableColumn[] = COLUMNS.filter((c) => c.picker === 'data').map((c) => ({
	colId: c.colId,
	label: c.label,
}));

/** Internal columns, offered only to admins. All hidden by default. */
export const INTERNAL_COLUMNS: readonly TogglableColumn[] = COLUMNS.filter((c) => c.picker === 'admin').map((c) => ({
	colId: c.colId,
	label: c.label,
}));

/** Every colId the user may toggle, given their admin status. */
export function togglableColIds(isAdmin: boolean): string[] {
	return [...DATA_COLUMNS.map((c) => c.colId), ...(isAdmin ? INTERNAL_COLUMNS.map((c) => c.colId) : [])];
}

/**
 * Column-picker registry for the sort picker — every colId a user can add to a
 * multi-column sort, with a human label.
 */
export const SORTABLE_COLUMNS: readonly TogglableColumn[] = COLUMNS.filter((c) => c.sortable).map((c) => ({
	colId: c.colId,
	label: c.label,
}));

/** Columns with no server sort key: sortable in "Loaded" mode only. */
export const CLIENT_ONLY_SORT_COLS: readonly string[] = COLUMNS.filter((c) => c.clientOnlySort).map((c) => c.colId);

/** The sort picker's columns for a data mode; client-only columns are offered in "Loaded" mode alone. */
export function sortableColumnsFor(mode: 'all' | 'loaded'): readonly TogglableColumn[] {
	return mode === 'loaded'
		? SORTABLE_COLUMNS
		: SORTABLE_COLUMNS.filter((c) => !CLIENT_ONLY_SORT_COLS.includes(c.colId));
}

/** colId → row-value extractor, for client-side (non-grid) multi-column sorting. */
const SORT_VALUE_GETTERS: Record<string, (row: ContentItem) => string | number | null> = Object.fromEntries(
	COLUMNS.filter((c): c is ColumnMeta & { sortValue: NonNullable<ColumnMeta['sortValue']> } => c.sortValue != null).map(
		(c) => [c.colId, c.sortValue],
	),
);

/**
 * AG Grid colId → GraphQL ContentSortBy, for every column with a server sort
 * (including non-picker aliases like `type` → NAME).
 */
export const COL_TO_SORT: Record<string, string> = Object.fromEntries(
	COLUMNS.filter((c): c is ColumnMeta & { serverSort: string } => c.serverSort != null).map((c) => [
		c.colId,
		c.serverSort,
	]),
);

/**
 * GraphQL ContentSortBy → AG Grid colId (for URL → grid state). Built by
 * keeping the *first* colId per serverSort value in COLUMNS order, so an
 * aliased column (`type`, listed after `item`, both → NAME) doesn't
 * overwrite the canonical one — `item` is where NAME reverse-maps to, not
 * `type`, matching the picker's "type isn't independently sortable" rule.
 */
export const SORT_TO_COL: Record<string, string> = (() => {
	const map: Record<string, string> = {};
	for (const c of COLUMNS) {
		if (c.serverSort && !(c.serverSort in map)) map[c.serverSort] = c.colId;
	}
	return map;
})();

/** colId → the row field a filter on that column should match against (client-side filtering). */
const FILTER_VALUE_GETTERS: Record<string, (row: ContentItem) => string | number | null> = Object.fromEntries(
	COLUMNS.filter(
		(c): c is ColumnMeta & { filterValue: NonNullable<ColumnMeta['filterValue']> } => c.filterValue != null,
	).map((c) => [c.colId, c.filterValue]),
);

/** AG Grid colId → URL `f.*` param key, for every filterable column. */
export const COL_TO_FILTER_KEY: Record<string, string> = Object.fromEntries(
	COLUMNS.filter((c): c is ColumnMeta & { filterKey: string } => c.filterKey != null).map((c) => [
		c.colId,
		c.filterKey,
	]),
);

/** Columns whose `f.*` params are number ranges (vs. date ranges or plain text). */
export const NUMBER_RANGE_COLS: ReadonlySet<string> = new Set(
	COLUMNS.filter((c) => c.filterRange === 'number').map((c) => c.colId),
);

/** Columns whose `f.*` params are date ranges. */
export const DATE_RANGE_COLS: ReadonlySet<string> = new Set(
	COLUMNS.filter((c) => c.filterRange === 'date').map((c) => c.colId),
);

/** Date-range columns whose URL values keep the day (`YYYY-MM-DD`) instead of the month. */
export const DAY_DATE_COLS: ReadonlySet<string> = new Set(COLUMNS.filter((c) => c.filterDay).map((c) => c.colId));

/** Columns whose filter is a checkbox list (`f.type=youtube,claim`). */
export const SET_FILTER_COLS: ReadonlySet<string> = new Set(COLUMNS.filter((c) => c.filterSet).map((c) => c.colId));

/** colId → canonical label, for every column with a non-empty label (used by FilterChips' chip text). */
export const COLUMN_LABELS: Record<string, string> = Object.fromEntries(
	COLUMNS.filter((c) => c.label.length > 0).map((c) => [c.colId, c.label]),
);

/**
 * Compare two rows by a priority-ordered multi-column sort, entirely client-side.
 * Used where there's no AG Grid instance to delegate to (the mobile card list in
 * "Loaded" mode) — mirrors what AG Grid's own multi-sort does with the column
 * comparators above, but as a plain array comparator. Nulls sort last regardless
 * of direction. Unknown/unsortable colIds are skipped (same policy as
 * sortsToGraphQL dropping them for the server-side path).
 */
export function compareContentBySorts(
	a: ContentItem,
	b: ContentItem,
	sorts: { col: string; dir: 'asc' | 'desc' }[],
): number {
	for (const { col, dir } of sorts) {
		const getValue = SORT_VALUE_GETTERS[col];
		if (!getValue) continue;
		const va = getValue(a);
		const vb = getValue(b);
		if (va == null && vb == null) continue;
		if (va == null) return 1;
		if (vb == null) return -1;
		if (va === vb) continue;
		const cmp = va < vb ? -1 : 1;
		return dir === 'asc' ? cmp : -cmp;
	}
	return 0;
}

// ---------------------------------------------------------------------------
// Client-side filtering (mobile card list, "Loaded" mode)
// ---------------------------------------------------------------------------

/** The shape urlParamsToFilter (gridUrlState.ts) produces per colId. Mirrors AG Grid's own filter model. */
interface AGFilterEntry {
	filterType: 'text' | 'number' | 'date' | 'set';
	type?: string;
	/** Set filters only: matches when the row value is any of these. */
	values?: string[];
	filter?: number | string;
	filterTo?: number;
	dateFrom?: string;
	dateTo?: string;
}

function matchesTextFilter(value: string | null, entry: AGFilterEntry): boolean {
	const needle = String(entry.filter ?? '').toLowerCase();
	switch (entry.type) {
		case 'contains':
			return value != null && value.includes(needle);
		case 'notContains':
			return value == null || !value.includes(needle);
		case 'equals':
			return value === needle;
		case 'notEqual':
			return value !== needle;
		case 'startsWith':
			return value != null && value.startsWith(needle);
		case 'endsWith':
			return value != null && value.endsWith(needle);
		case 'blank':
			return value == null || value === '';
		case 'notBlank':
			return value != null && value !== '';
		default:
			return true;
	}
}

function matchesNumberFilter(value: number | null, entry: AGFilterEntry): boolean {
	if (value == null) return false;
	const target = Number(entry.filter);
	switch (entry.type) {
		case 'equals':
			return value === target;
		case 'notEqual':
			return value !== target;
		case 'greaterThan':
			return value > target;
		case 'greaterThanOrEqual':
			return value >= target;
		case 'lessThan':
			return value < target;
		case 'lessThanOrEqual':
			return value <= target;
		case 'inRange':
			return value >= target && value <= (entry.filterTo ?? target);
		default:
			return true;
	}
}

function matchesDateFilter(value: string | null, entry: AGFilterEntry): boolean {
	if (!value) return false;
	const t = new Date(value).getTime();
	const from = entry.dateFrom ? new Date(entry.dateFrom).getTime() : undefined;
	const to = entry.dateTo ? new Date(entry.dateTo).getTime() : undefined;
	switch (entry.type) {
		case 'equals':
			return from !== undefined && t === from;
		case 'greaterThan':
			return from !== undefined && t > from;
		case 'greaterThanOrEqual':
			return from !== undefined && t >= from;
		case 'lessThan':
			return to !== undefined && t < to;
		case 'lessThanOrEqual':
			return to !== undefined && t <= to;
		case 'inRange':
			return from !== undefined && to !== undefined && t >= from && t <= to;
		default:
			return true;
	}
}

/**
 * Apply an AG-Grid-shaped filter model (as produced by urlParamsToFilter in
 * gridUrlState.ts) to a plain row array, client-side. Used where there's no
 * AG Grid instance to filter for us — the mobile card list in "Loaded" mode,
 * which previously ignored column filters entirely (see the UI gap audit,
 * gap #5). Unknown colIds are skipped (same policy as compareContentBySorts).
 */
export function filterContentRows(rows: ContentItem[], filterModel: Record<string, unknown>): ContentItem[] {
	const entries = Object.entries(filterModel) as [string, AGFilterEntry][];
	if (entries.length === 0) return rows;

	return rows.filter((row) =>
		entries.every(([colId, entry]) => {
			const getValue = FILTER_VALUE_GETTERS[colId];
			if (!getValue) return true;
			const value = getValue(row);
			if (entry.filterType === 'set') return value != null && (entry.values ?? []).includes(String(value));
			if (entry.filterType === 'number') return matchesNumberFilter(value as number | null, entry);
			if (entry.filterType === 'date') return matchesDateFilter(value as string | null, entry);
			return matchesTextFilter(typeof value === 'string' ? value : value == null ? null : String(value), entry);
		}),
	);
}

// ---------------------------------------------------------------------------
// Person filter (`f.person=<tmdb id>[:cast|:director]`) — not a column filter
// ---------------------------------------------------------------------------

/** URL `f.*` key for the person filter. It has no grid column, so it is never part of the AG Grid filter model. */
export const PERSON_FILTER_KEY = 'person';

export interface PersonFilter {
	id: number;
	/** Omitted = either role, matching the server's `personRole` default. */
	role?: 'cast' | 'director';
}

/** Parse `123`, `123:cast` or `123:director`; null for anything else (bad ids are ignored, never sent). */
export function parsePersonFilter(value: string | undefined): PersonFilter | null {
	const m = /^(\d+)(?::(cast|director))?$/i.exec((value ?? '').trim());
	if (!m) return null;
	const id = Number(m[1]);
	if (!Number.isSafeInteger(id) || id <= 0) return null;
	return m[2] ? { id, role: m[2].toLowerCase() as 'cast' | 'director' } : { id };
}

/** Client-side twin of the server's person filter: the row is a Movie crediting this person (in the role, if given). */
export function rowMatchesPerson(row: ContentItem, person: PersonFilter): boolean {
	return moviePeople(row).some((p) => p.id === person.id && (!person.role || p.role === person.role));
}

/** Item column header: "Film" when the type filter is exactly MOVIE, otherwise "Item". */
export function itemColumnHeader(typeFilter: string | undefined): string {
	return isMovieOnlyTypeFilter(typeFilter) ? 'Film' : 'Item';
}
