import { createQuery, hashKey } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { USER_TODOS, USER_TODO_STALE_TIME_MS, type UserTodosArgs, type UserTodosResponse } from './index';
import { queryKeys } from '../keys';

/**
 * The query options for one page of todos. The queryKey is built from the same
 * `variables` object that is sent, so every filter, sort and page argument changes
 * the cache entry. Shared by the live query and the on-demand lookup, so both read
 * and write the same entry.
 */
export function userTodosOptions(variables: UserTodosArgs) {
	return {
		queryKey: queryKeys.userTodos.list(variables),
		queryFn: () => graphqlRequest<UserTodosResponse>(USER_TODOS, variables),
		staleTime: USER_TODO_STALE_TIME_MS,
	};
}

/**
 * Placeholder data for a change of sort or page only: while the new key fetches, the previous page
 * stays on screen, so the Plan grid is not unmounted (which would drop its header sort and arrow).
 * A change of filter (All → a list, Unlisted, …) gets no placeholder: its rows must not show under
 * another selection, and a list grid's drag-reorder ids come from the rows it shows.
 */
export function sortOnlyPlaceholder(variables: UserTodosArgs) {
	return (previousData: UserTodosResponse | undefined, previousQuery: { queryKey: readonly unknown[] } | undefined) => {
		const previousVariables = previousQuery?.queryKey.at(-1) as UserTodosArgs | undefined;
		if (!previousData || !previousVariables) return undefined;
		const sameFilter = hashKey([previousVariables.filter ?? null]) === hashKey([variables.filter ?? null]);
		return sameFilter ? previousData : undefined;
	};
}

/** One page of the caller's visible todos. */
export function useUserTodos(args: () => UserTodosArgs = () => ({})) {
	return createQuery(() => {
		const variables = args();
		return { ...userTodosOptions(variables), placeholderData: sortOnlyPlaceholder(variables) };
	});
}
