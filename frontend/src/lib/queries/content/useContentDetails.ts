import { createQuery } from '@tanstack/svelte-query';
import { browser } from '$app/environment';
import { graphqlRequest } from '../client';
import { GET_CONTENT_DETAILS, type ContentDetailsResponse } from './index';
import { queryKeys } from '../keys';

/**
 * One content row (the LIST_CONTENT shape) for a details modal opened on an item
 * that isn't in a loaded content page: an Activity deep link (`?open=<id>`) or a
 * Plan todo's "View content". `enabled` lets a caller skip the fetch when it
 * already has the row.
 */
export function useContentDetails(contentId: () => string | null, enabled: () => boolean = () => true) {
	return createQuery(() => ({
		queryKey: queryKeys.content.row(contentId() ?? ''),
		queryFn: () => graphqlRequest<ContentDetailsResponse>(GET_CONTENT_DETAILS, { id: contentId() }),
		enabled: browser && contentId() !== null && enabled(),
		staleTime: 60 * 1000,
	}));
}
