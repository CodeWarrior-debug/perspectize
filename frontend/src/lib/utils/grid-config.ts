/**
 * Extracted AG Grid configuration logic from ActivityTable.svelte.
 * Pure functions and constants that can be unit-tested without a browser.
 */
import type { ContentItem } from '$lib/queries/content';

/**
 * Maps AG Grid colId → GraphQL ContentSortBy enum value.
 * When a column isn't sortable on the backend, it falls back to NAME.
 */
export const SORT_FIELD_MAP: Record<string, string> = {
	item: 'NAME',
	type: 'NAME', // type not sortable in backend, fallback to NAME
	duration: 'NAME', // duration not sortable, fallback to NAME
	views: 'VIEW_COUNT',
	likes: 'LIKE_COUNT',
	percentLiked: 'NAME', // computed client-side, not sortable in backend, fallback to NAME
	publishDate: 'PUBLISHED_AT',
	channel: 'NAME', // channel not sortable, fallback
	createdAt: 'CREATED_AT',
	updatedAt: 'UPDATED_AT',
};

/**
 * Resolve a sort field from the SORT_FIELD_MAP, with fallback.
 * Used by onSortChanged handler to convert AG Grid column IDs to backend sort enums.
 */
export function resolveSortField(colId: string | undefined): string {
	return SORT_FIELD_MAP[colId ?? 'updatedAt'] ?? 'UPDATED_AT';
}

/**
 * Resolve sort order from AG Grid sort direction.
 */
export function resolveSortOrder(sort: string | null | undefined): 'ASC' | 'DESC' {
	return sort === 'asc' ? 'ASC' : 'DESC';
}

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
 * Compute next page, respecting bounds.
 * Returns the new page number, or current if at last page.
 */
export function computeNextPage(currentPage: number, totalCount: number, pageSize: number): number {
	const maxPage = Math.ceil(totalCount / pageSize) - 1;
	if (currentPage < maxPage) {
		return currentPage + 1;
	}
	return currentPage;
}

/**
 * Compute previous page, respecting bounds.
 * Returns the new page number, or current if at first page.
 */
export function computePrevPage(currentPage: number): number {
	if (currentPage > 0) {
		return currentPage - 1;
	}
	return currentPage;
}

/**
 * Responsive tier type used by ActivityTable.
 */
export type ResponsiveTier = 'xs' | 'sm' | 'md' | 'lg';

/**
 * Derive responsive tier from window width.
 * xs: <445px, sm: 445-639px, md: 640-899px, lg: 900px+
 */
export function deriveResponsiveTier(width: number): ResponsiveTier {
	if (width >= 900) return 'lg';
	if (width >= 640) return 'md';
	if (width >= 445) return 'sm';
	return 'xs';
}

/**
 * Determine which columns should be visible for a given responsive tier.
 * Returns { visible: string[], hidden: string[] } for use with setColumnsVisible.
 */
export function getColumnVisibility(tier: ResponsiveTier): {
	visible: string[];
	hidden: string[];
} {
	const alwaysVisible = ['item', 'type', 'perspectize'];
	const alwaysHidden = ['description', 'updatedAt', 'createdAt'];
	const smCols = ['channel'];
	const mdCols = ['duration', 'publishDate'];
	const lgCols = ['views', 'likes', 'percentLiked', 'tags'];

	const visible = [...alwaysVisible];
	const hidden = [...alwaysHidden];

	if (tier !== 'xs') {
		visible.push(...smCols);
	} else {
		hidden.push(...smCols);
	}

	if (tier === 'md' || tier === 'lg') {
		visible.push(...mdCols);
	} else {
		hidden.push(...mdCols);
	}

	if (tier === 'lg') {
		visible.push(...lgCols);
	} else {
		hidden.push(...lgCols);
	}

	return { visible, hidden };
}

/**
 * Whether a tier is considered "mobile" (affects domLayout).
 */
export function isMobileTier(tier: ResponsiveTier): boolean {
	return tier === 'xs' || tier === 'sm';
}

/**
 * All column IDs defined in the ActivityTable, in order.
 */
export const COLUMN_IDS = [
	'perspectize',
	'item',
	'type',
	'duration',
	'views',
	'likes',
	'percentLiked',
	'publishDate',
	'channel',
	'tags',
	'description',
	'updatedAt',
	'createdAt',
] as const;

/**
 * Columns that should never be sortable (set sortable: false in colDef).
 */
export const NON_SORTABLE_COLUMNS = ['perspectize', 'tags', 'description'] as const;

/**
 * Column filter type mapping — which AG Grid filter each column uses.
 * false = no filter.
 */
export const COLUMN_FILTERS: Record<string, string | false> = {
	perspectize: false,
	item: false, // search handled by page-level input
	type: 'agTextColumnFilter',
	duration: 'agNumberColumnFilter',
	views: 'agNumberColumnFilter',
	likes: 'agNumberColumnFilter',
	percentLiked: false, // computed client-side; a real filter needs a backend field (see PR notes)
	publishDate: 'agDateColumnFilter',
	channel: 'agTextColumnFilter',
	tags: 'agTextColumnFilter',
	description: 'agTextColumnFilter',
	updatedAt: 'agDateColumnFilter',
	createdAt: 'agDateColumnFilter',
};

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
	{ colId: 'duration', label: 'Length' },
	{ colId: 'views', label: 'Views' },
	{ colId: 'likes', label: 'Likes' },
	{ colId: 'percentLiked', label: '% Liked' },
	{ colId: 'publishDate', label: 'Published' },
	{ colId: 'channel', label: 'Channel' },
	{ colId: 'tags', label: 'Tags' },
	{ colId: 'description', label: 'Description' },
] as const;

/** Internal columns, offered only to admins. All hidden by default. */
export const INTERNAL_COLUMNS: readonly TogglableColumn[] = [
	{ colId: 'id', label: 'Content ID' },
	{ colId: 'addedByUserID', label: 'Submitter' },
	{ colId: 'url', label: 'Source URL' },
	{ colId: 'createdAt', label: 'Created at' },
	{ colId: 'updatedAt', label: 'Updated at' },
] as const;

/** Every colId the user may toggle, given their admin status. */
export function togglableColIds(isAdmin: boolean): string[] {
	return [...DATA_COLUMNS.map((c) => c.colId), ...(isAdmin ? INTERNAL_COLUMNS.map((c) => c.colId) : [])];
}
