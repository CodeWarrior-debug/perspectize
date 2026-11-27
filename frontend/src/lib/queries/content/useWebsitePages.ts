import { createQuery } from '@tanstack/svelte-query';
import { browser } from '$app/env';
import { graphqlRequest } from '../client';
import { LIST_WEBSITE_PAGES, WEBSITE_PAGES_LIMIT, type WebsitePagesResponse } from './index';
import { queryKeys } from '../keys';

/**
 * The pages filed under one WEBSITE, for its details view. Pass `null` when the open item is not a
 * website, so no request is made. One request per website: a second consumer of the same id shares
 * the cache entry.
 */
export function useWebsitePages(websiteId: () => string | null) {
	return createQuery(() => ({
		queryKey: queryKeys.content.websitePages(websiteId() ?? ''),
		queryFn: () =>
			graphqlRequest<WebsitePagesResponse>(LIST_WEBSITE_PAGES, {
				parentContentID: websiteId(),
				first: WEBSITE_PAGES_LIMIT,
			}),
		enabled: browser && websiteId() !== null,
		staleTime: 60 * 1000,
	}));
}
