import { createQuery, hashKey, keepPreviousData } from '@tanstack/svelte-query';
import { untrack } from 'svelte';
import { graphqlRequest } from '../client';
import { useUsernames } from '../users/useUsernames.svelte';
import { LIST_CONTENT, type ContentItem, type ContentResponse } from './index';
import { LIBRARY_LIST_STALE_TIME_MS, cursorsAfterPage, libraryListRequest } from './libraryList';
import type { GridParams } from '#lib/utils/gridUrlState.js';
import { createRowOrderMemory } from '#lib/utils/rowOrder.js';

type LibraryListRequest = ReturnType<typeof libraryListRequest>;

/**
 * The options the Library list query runs with. The route prefetch (prefetchLibraryList) fills the
 * same key, so a first mount reads its data instead of fetching again.
 */
export function libraryListQueryOptions(request: LibraryListRequest) {
	return {
		queryKey: request.queryKey,
		queryFn: () => graphqlRequest<ContentResponse>(LIST_CONTENT, request.variables),
		placeholderData: keepPreviousData,
		staleTime: LIBRARY_LIST_STALE_TIME_MS,
	};
}

/**
 * The Library's content list for the current grid params: one page from the server in "All" mode
 * (cursor-paginated), or the loaded set in "Loaded" mode.
 *
 * Owns the cursor stack. Pages are 1-indexed, so `cursors[0]` is null for page 1 and
 * `cursors[n - 1]` is the cursor that fetches page n. Call `resetCursors()` whenever a change
 * sends the list back to page 1 (sort, filter, mode, page size).
 *
 * Call during component init (it creates a query and an effect).
 */
export function useLibraryList(params: () => GridParams) {
	let cursors = $state<(string | null)[]>([null]);
	const currentCursor = $derived(cursors[params().page - 1] ?? null);

	// Key and LIST_CONTENT variables come from one builder (libraryList.ts), so the cache key cannot
	// drift from the request. Captured in the options getter so queryFn sends the variables its key
	// was built from.
	const request = $derived(libraryListRequest(params(), currentCursor));
	const query = createQuery(() => libraryListQueryOptions(request));

	// Advance the cursor stack from the loaded page, not from inside queryFn: a cache hit (the route
	// prefetch, or a remount inside staleTime) never runs queryFn, so Next would stall on page 1.
	// Placeholder data (keepPreviousData: the previous page while this one loads) is skipped.
	$effect(() => {
		const data = query.data;
		const placeholder = query.isPlaceholderData;
		const { mode, page } = params();
		if (!data || placeholder || mode !== 'all') return;
		const pageInfo = data.content.pageInfo;
		untrack(() => {
			cursors = cursorsAfterPage(cursors, page, pageInfo);
		});
	});

	const usernames = useUsernames();
	// The default server order (updatedAt desc) can put an edited row first on a refetch, so the row
	// jumps out of view. Keep rows where they were while the list (its query key) stays the same.
	const rowOrder = createRowOrderMemory();
	const rows = $derived(
		rowOrder.apply(
			hashKey(request.queryKey),
			(query.data?.content.items ?? []).map((item): ContentItem => ({
				...item,
				addedByUsername: usernames.byId.get(item.addedByUserID) ?? null,
			})),
			query.isPlaceholderData,
		),
	);

	return {
		get rows() {
			return rows;
		},
		get totalCount() {
			return query.data?.content.totalCount ?? 0;
		},
		/** The first load, or another page loading behind the previous one (placeholder data). */
		get loading() {
			return query.isLoading || query.isPlaceholderData;
		},
		get isPending() {
			return query.isPending;
		},
		get isError() {
			return query.isError;
		},
		refetch() {
			return query.refetch();
		},
		resetCursors() {
			cursors = [null];
		},
	};
}
