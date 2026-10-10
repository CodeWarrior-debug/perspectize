import { createQuery } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { USER_TODOS, USER_TODO_STALE_TIME_MS, type UserTodosArgs, type UserTodosResponse } from './index';
import { queryKeys } from '../keys';

/**
 * One page of the caller's visible todos. The queryKey is built from the same
 * `args` object that is sent as variables, so every filter, sort and page
 * argument changes the cache entry.
 */
export function useUserTodos(args: () => UserTodosArgs = () => ({})) {
	return createQuery(() => {
		const variables = args();
		return {
			queryKey: queryKeys.userTodos.list(variables),
			queryFn: () => graphqlRequest<UserTodosResponse>(USER_TODOS, variables),
			staleTime: USER_TODO_STALE_TIME_MS,
		};
	});
}
