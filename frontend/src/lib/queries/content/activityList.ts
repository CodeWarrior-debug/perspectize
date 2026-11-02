/**
 * The Activity list request: the one place that decides the TanStack key and the
 * LIST_CONTENT variables for a URL state. ActivityTable and the route prefetch
 * (routes/+page.ts) both call this, so the key and the request cannot drift apart.
 *
 * Pure: no runes, no network, no Clerk, so it can run at route load (#636).
 */
import { queryKeys } from '$lib/queries/keys';
import { sortsToGraphQL, urlParamsToGraphQLFilter, type GridParams } from '$lib/utils/gridUrlState';

/** Rows fetched on first load in Loaded mode. Was 100; 50 halves the payload (#636). */
export const LOADED_MODE_FIRST = 50;

/** Freshness window for the Activity list. A prefetch inside it is reused without a second request. */
export const ACTIVITY_LIST_STALE_TIME_MS = 60 * 1000;

/**
 * Cursor stack after a loaded "All"-mode page. `cursors[n]` is the cursor for page n + 1, so the
 * stack grows only when `pageNum` is the furthest page known. Returns the same array when nothing
 * changes. ActivityTable calls this from an effect on the data, not from queryFn, so a cache hit
 * (the route prefetch, or a remount inside staleTime) still advances the stack.
 */
export function cursorsAfterPage(
	cursors: (string | null)[],
	pageNum: number,
	pageInfo: { hasNextPage: boolean; endCursor: string | null },
): (string | null)[] {
	if (!pageInfo.hasNextPage || !pageInfo.endCursor) return cursors;
	if (cursors.length !== pageNum) return cursors;
	return [...cursors, pageInfo.endCursor];
}

/** Builds the Activity list key and request for `params` at cursor `after` (null = first page). */
export function activityListRequest(params: GridParams, after: string | null) {
	const isAll = params.mode === 'all';
	const graphqlSorts = sortsToGraphQL(params.sorts);
	const sortBy = isAll ? (graphqlSorts?.[0]?.field ?? 'UPDATED_AT') : 'UPDATED_AT';
	const sortOrder = isAll ? (graphqlSorts?.[0]?.order ?? 'DESC') : 'DESC';
	const sorts = isAll ? graphqlSorts : undefined;
	// "All" mode filters on the server by every URL filter. "Loaded" mode fetches only
	// the Type filter, the rest stays client-side.
	const filter = isAll
		? urlParamsToGraphQLFilter(params.filters, params.q, params.qFields)
		: urlParamsToGraphQLFilter(params.filters.type ? { type: params.filters.type } : {}, params.q, params.qFields);

	return {
		queryKey: queryKeys.content.list({
			sortBy,
			sortOrder,
			sorts,
			search: params.q,
			searchFields: params.qFields,
			first: params.pageSize,
			after,
			filter: filter as Record<string, unknown> | undefined,
			mode: params.mode,
		}),
		variables: {
			first: isAll ? params.pageSize : LOADED_MODE_FIRST,
			after: isAll ? after : null,
			sortBy,
			sortOrder,
			sorts,
			filter,
			includeTotalCount: true,
		},
	};
}
