import { createQuery } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { LIST_CONTENT, type ContentResponse } from './index';
import { queryKeys } from '../keys';

export interface ContentOwner {
	id: number;
	username: string;
}

export function ownedContentCountQuery(owner: ContentOwner | null) {
	const ownerID = String(owner?.id ?? 0);
	return {
		queryKey: queryKeys.content.ownedCount(owner?.id ?? 0, owner?.username ?? ''),
		queryFn: () =>
			graphqlRequest<ContentResponse>(LIST_CONTENT, {
				first: 100,
				includeTotalCount: false,
				filter: { addedByUsername: owner?.username },
			}),
		// The server matches usernames by substring, so "dan" also returns "dana"'s rows.
		select: (data: ContentResponse) => data.content.items.filter((c) => c.addedByUserID === ownerID).length,
		enabled: owner !== null,
		staleTime: 60_000,
	};
}

/** How many content rows `owner()` added, counted up to 100. Disabled while it is null. */
export function useOwnedContentCount(owner: () => ContentOwner | null) {
	return createQuery(() => ownedContentCountQuery(owner()));
}
