import { useQueryClient } from '@tanstack/svelte-query';
import type { UserTodoItem, UserTodosArgs } from './index';
import { userTodosOptions } from './useUserTodos';

/**
 * On-demand lookup of one page of todos, for a one-off check after a user action
 * (no standing subscription, so no request on mount). It reads and fills the same
 * cache entry as `useUserTodos` with the same variables.
 */
export function useFetchUserTodos() {
	const queryClient = useQueryClient();

	return async (args: UserTodosArgs): Promise<UserTodoItem[]> => {
		const data = await queryClient.fetchQuery(userTodosOptions(args));
		return data.userTodos.items;
	};
}
