import { createQuery } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { USER_TODO_LISTS, USER_TODO_STALE_TIME_MS, type UserTodoListsResponse } from './index';
import { queryKeys } from '../keys';

/**
 * One owner's todo lists (private lists come back only to their owner). Disabled
 * while `userId()` is null, so callers can pass a signed-out user.
 */
export function useUserTodoLists(userId: () => number | null) {
	return createQuery(() => {
		const id = userId();
		return {
			queryKey: queryKeys.userTodos.todoLists(id),
			queryFn: () => graphqlRequest<UserTodoListsResponse>(USER_TODO_LISTS, { userId: id }),
			staleTime: USER_TODO_STALE_TIME_MS,
			enabled: id !== null,
		};
	});
}
