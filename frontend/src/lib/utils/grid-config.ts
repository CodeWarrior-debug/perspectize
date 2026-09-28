/**
 * Extracted AG Grid configuration logic from ActivityTable.svelte.
 * Pure functions and constants that can be unit-tested without a browser.
 */
import type { ContentItem } from '$lib/queries/content';
import { percentLikedValueGetter, formatTags } from './formatting';

/**
 * Capitalize first letter, lowercase rest — used by the type column valueGetter.
 */
export function capitalizeContentType(contentType: string | undefined): string {
	if (!contentType) return '';
	return contentType.charAt(0).toUpperCase() + contentType.slice(1).toLowerCase();
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
	/** URL `f.<filterKey>=` param key, if this column has a filter. */
	filterKey?: string;
	/** Row-value extractor for client-side filtering (mobile card list). */
	filterValue?: (row: ContentItem) => string | number | null;
	/** How a filter value string is parsed: a `min..max` range, or plain text `contains`. */
	filterRange?: 'number' | 'date';
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
	},
	{ colId: 'category', label: 'Category', picker: 'data', sortable: false },
	{
		colId: 'duration',
		label: 'Length',
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
		colId: 'tags',
		label: 'Tags',
		picker: 'data',
		sortable: false,
		filterKey: 'tags',
		filterValue: (row) => formatTags(row.tags).toLowerCase(),
	},
	{
		colId: 'description',
		label: 'Description',
		picker: 'data',
		sortable: false,
		filterKey: 'desc',
		filterValue: (row) => row.description?.toLowerCase() ?? null,
	},
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
	filterType: 'text' | 'number' | 'date';
	type: string;
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
			if (entry.filterType === 'number') return matchesNumberFilter(value as number | null, entry);
			if (entry.filterType === 'date') return matchesDateFilter(value as string | null, entry);
			return matchesTextFilter(typeof value === 'string' ? value : value == null ? null : String(value), entry);
		}),
	);
}
