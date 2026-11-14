import { createQuery } from '@tanstack/svelte-query';
import { browser } from '$app/environment';
import { graphqlRequest } from '../client';
import { GET_CONTENT_AGGREGATES, type ContentAggregatesResponse } from './index';
import { queryKeys } from '../keys';
import { useAuthState } from '$lib/auth/useAuthState';

/**
 * Lazily loads the viewer-scoped detail for a single content item: the
 * perspective count / average rating (see backend Content.perspectiveCount /
 * averageRating resolvers) and the import it came from (Content.importedFrom).
 * Too expensive, or viewer-dependent, for the main content list, so it's only
 * fetched here, on demand, for whichever content the details modal has open.
 * Keyed per viewer, so a signed-in admin never reads an anonymous or
 * non-admin response from the cache. Must be called during component init.
 */
export function useContentAggregates(contentId: () => string | null) {
	const auth = useAuthState();
	return createQuery(() => ({
		queryKey: queryKeys.content.aggregates(contentId() ?? '', auth.userId),
		queryFn: async () => {
			const id = contentId();
			if (!id) return null;
			return graphqlRequest<ContentAggregatesResponse>(GET_CONTENT_AGGREGATES, { id });
		},
		enabled: browser && contentId() !== null,
	}));
}
