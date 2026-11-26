/**
 * Cache eviction after an add hook creates content. Every add hook
 * (useAddVideo, useAddBook, useAddMovie, useAddPassage, useCreateWebPage) ends
 * its onSuccess here, so the rule for which cached lists can take the new row
 * lives in one place.
 *
 * Two kinds of list sit under `queryKeys.content.lists()`:
 * - Library lists (`queryKeys.content.list(filters)`) cache a ContentResponse,
 *   `{ content: { items, totalCount } }`. A new row can be prepended to them.
 * - Everything else (claims, the compare and item pickers) caches another
 *   shape, so it can't be patched and is only marked stale.
 */
import type { Query, QueryClient, QueryKey } from '@tanstack/svelte-query';
import { queryKeys } from '../keys';
import type { ContentItem, ContentResponse } from './index';

const LISTS_KEY = queryKeys.content.lists();

/**
 * True for a library list key: the lists prefix plus one filters object. The
 * claims and picker keys add a string segment after the prefix, so they don't match.
 */
export function isLibraryListKey(queryKey: QueryKey): boolean {
	if (queryKey.length !== LISTS_KEY.length + 1) return false;
	if (!LISTS_KEY.every((part, i) => queryKey[i] === part)) return false;
	const filters = queryKey[LISTS_KEY.length];
	return typeof filters === 'object' && filters !== null;
}

const isLibraryList = (query: Query) => isLibraryListKey(query.queryKey);

/** Prepends `row` to a library list. Any other shape is returned unchanged. */
function prependRow(old: ContentResponse | undefined, row: ContentItem): ContentResponse | undefined {
	if (!old?.content || !Array.isArray(old.content.items)) return old;
	return {
		...old,
		content: {
			...old.content,
			items: [row, ...old.content.items],
			totalCount: (old.content.totalCount ?? 0) + 1,
		},
	};
}

/**
 * Evicts the content lists after a create.
 *
 * - Without `created` (find-or-create, where the server can't say whether the
 *   row is new), every content list is invalidated and refetches when mounted.
 * - With `created` (a genuinely new row), library lists get it prepended and are
 *   marked stale without a refetch. Claims and pickers can't take a row, so they
 *   are marked stale too.
 */
export function evictAfterContentCreated(queryClient: QueryClient, created?: ContentItem | null): void {
	if (!created) {
		queryClient.invalidateQueries({ queryKey: LISTS_KEY });
		return;
	}
	queryClient.setQueriesData<ContentResponse>({ queryKey: LISTS_KEY, predicate: isLibraryList }, (old) =>
		prependRow(old, created),
	);
	queryClient.invalidateQueries({ queryKey: LISTS_KEY, refetchType: 'none' });
}
