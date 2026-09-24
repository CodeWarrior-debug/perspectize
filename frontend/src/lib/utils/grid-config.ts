/**
 * Extracted AG Grid configuration logic from ActivityTable.svelte.
 * Pure functions and constants that can be unit-tested without a browser.
 */
import type { ContentItem } from '$lib/queries/content';
import { percentLikedValueGetter } from './formatting';

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

/**
 * Column-picker registry for the sort picker — every colId a user can add to a
 * multi-column sort, with a human label. Kept in sync with `COL_TO_SORT` in
 * gridUrlState.ts (that map is the URL/GraphQL codec; this is just labels for
 * the picker UI). 'type' is deliberately excluded — it's a NAME alias, not an
 * independently sortable column (see COL_TO_SORT's comment).
 */
export const SORTABLE_COLUMNS: readonly TogglableColumn[] = [
	{ colId: 'item', label: 'Item' },
	{ colId: 'duration', label: 'Length' },
	{ colId: 'views', label: 'Views' },
	{ colId: 'likes', label: 'Likes' },
	// Client-side only: no backend ContentSortBy enum value exists for this computed
	// column, so it only sorts in "Loaded" mode and on the mobile card list. In "All
	// Items" mode it's dropped by sortsToGraphQL (it's absent from COL_TO_SORT), same
	// as it always was — this only fixes Loaded-mode/mobile, which silently ignored it.
	{ colId: 'percentLiked', label: '% Liked' },
	{ colId: 'publishDate', label: 'Date' },
	{ colId: 'channel', label: 'Channel' },
	{ colId: 'createdAt', label: 'Date Added' },
	{ colId: 'updatedAt', label: 'Updated' },
] as const;

/** colId → row-value extractor, for client-side (non-grid) multi-column sorting. */
const SORT_VALUE_GETTERS: Record<string, (row: ContentItem) => string | number | null> = {
	item: (row) => row.name?.toLowerCase() ?? null,
	duration: (row) => row.length,
	views: (row) => row.viewCount,
	likes: (row) => row.likeCount,
	percentLiked: (row) => percentLikedValueGetter({ data: row }),
	publishDate: (row) => row.publishedAt,
	channel: (row) => row.channelTitle?.toLowerCase() ?? null,
	createdAt: (row) => row.createdAt,
	updatedAt: (row) => row.updatedAt,
};

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

/**
 * Column-picker registry — the single source of truth for which columns the
 * user can toggle in ColumnPickerDialog. Kept here (not in the Svelte file) so
 * the dialog, the override-map builder in ActivityTable, and the tests all
 * agree. `colId` values must match the `colId` on the corresponding ColDef in
 * ActivityTable.svelte.
 */
export interface TogglableColumn {
	colId: string;
	label: string;
}

/**
 * Data columns every user can show/hide.
 *
 * "item" is deliberately excluded — it's the only column carrying a video's
 * title/thumbnail, so hiding it leaves rows with no way to identify which
 * video they are. It's always visible and never offered as a toggle.
 */
export const DATA_COLUMNS: readonly TogglableColumn[] = [
	{ colId: 'type', label: 'Type' },
	{ colId: 'category', label: 'Category' },
	{ colId: 'duration', label: 'Length' },
	{ colId: 'views', label: 'Views' },
	{ colId: 'likes', label: 'Likes' },
	{ colId: 'percentLiked', label: '% Liked' },
	{ colId: 'publishDate', label: 'Date' },
	{ colId: 'channel', label: 'Channel' },
	{ colId: 'tags', label: 'Tags' },
	{ colId: 'description', label: 'Description' },
	{ colId: 'createdAt', label: 'Date Added' },
	{ colId: 'updatedAt', label: 'Updated' },
] as const;

/** Internal columns, offered only to admins. All hidden by default. */
export const INTERNAL_COLUMNS: readonly TogglableColumn[] = [
	{ colId: 'id', label: 'Content ID' },
	{ colId: 'addedByUserID', label: 'Submitter' },
	{ colId: 'url', label: 'Source URL' },
] as const;

/** Every colId the user may toggle, given their admin status. */
export function togglableColIds(isAdmin: boolean): string[] {
	return [...DATA_COLUMNS.map((c) => c.colId), ...(isAdmin ? INTERNAL_COLUMNS.map((c) => c.colId) : [])];
}
