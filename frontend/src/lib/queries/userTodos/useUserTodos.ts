import { createQuery } from '@tanstack/svelte-query';
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

/** One page of the caller's visible todos. */
export function useUserTodos(args: () => UserTodosArgs = () => ({})) {
	return createQuery(() => userTodosOptions(args()));
}
