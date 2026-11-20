import { createQuery } from '@tanstack/svelte-query';
import { graphqlRequest } from '#lib/queries/client.js';
import { queryKeys } from '#lib/queries/keys.js';
import { LIST_USERS, type UsersResponse } from '#lib/queries/users/index.js';

/**
 * Reactive `userId → username` lookup, backed by the shared users-list cache.
 *
 * The Activity grid shows who added each row without asking the content query
 * to resolve `addedBy` per page (which costs an extra SQL statement per load);
 * the users list is one cached request for the whole session instead.
 */
export function useUsernames() {
	const usersQuery = createQuery(() => ({
		queryKey: queryKeys.users.list(),
		queryFn: () => graphqlRequest<UsersResponse>(LIST_USERS),
		staleTime: 5 * 60 * 1000,
	}));

	const byId = $derived(new Map((usersQuery.data?.users ?? []).map((u) => [u.id, u.username])));

	return {
		get byId(): ReadonlyMap<string, string> {
			return byId;
		},
	};
}
