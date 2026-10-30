import { createQuery } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { LIST_PERSPECTIVES_BY_USER, MAX_PERSPECTIVES_PER_LIST, type ListPerspectivesByUserResponse } from './index';
import { queryKeys } from '../keys';

/**
 * The signed-in user's perspectives, shared with ActivityTable (same key, same
 * request), so a caller can tell whether a perspective already exists for a content id.
 * Disabled while `userId()` is null.
 */
export function useMyPerspectives(userId: () => number | null) {
	return createQuery(() => {
		const id = userId();
		return {
			queryKey: queryKeys.perspectives.listByUser(id ?? 0),
			queryFn: () =>
				graphqlRequest<ListPerspectivesByUserResponse>(LIST_PERSPECTIVES_BY_USER, {
					userID: id,
					first: MAX_PERSPECTIVES_PER_LIST,
				}),
			enabled: id !== null,
			staleTime: 60 * 1000,
		};
	});
}
