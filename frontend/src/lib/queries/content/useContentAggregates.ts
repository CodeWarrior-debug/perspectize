import { createQuery } from '@tanstack/svelte-query';
import { browser } from '$app/environment';
import { graphqlRequest } from '../client';
import { GET_CONTENT_AGGREGATES, type ContentAggregatesResponse } from './index';
import { queryKeys } from '../keys';

/**
 * Lazily loads the perspective count / average rating for a single content
 * item. These are computed aggregates (see backend Content.perspectiveCount
 * / averageRating resolvers) — too expensive to include on every row of the
 * main content list, so they're only fetched here, on demand, for whichever
 * content the details modal currently has open.
 */
export function useContentAggregates(contentId: () => string | null) {
	return createQuery(() => ({
		queryKey: queryKeys.content.detail(contentId() ?? ''),
		queryFn: async () => {
			const id = contentId();
			if (!id) return null;
			return graphqlRequest<ContentAggregatesResponse>(GET_CONTENT_AGGREGATES, { id });
		},
		enabled: browser && contentId() !== null,
	}));
}
