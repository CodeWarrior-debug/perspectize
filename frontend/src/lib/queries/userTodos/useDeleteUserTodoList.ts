import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { DELETE_USER_TODO_LIST, type DeleteUserTodoListResponse } from './index';
import { queryKeys } from '../keys';

export interface DeleteUserTodoListInput {
	id: string;
	/**
	 * The list's owner (the signed-in user), needed to evict that owner's list
	 * cache. The delete answer is a bare boolean, so the caller supplies it.
	 */
	userId: number;
}

/**
 * Deleting a list unlists its todos first (server side), so the todos' list
 * fields change: evict the list pages and todo details along with the owner's lists.
 */
export function useDeleteUserTodoList() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		mutationFn: async ({ id }: DeleteUserTodoListInput) => {
			const data = await graphqlRequest<DeleteUserTodoListResponse>(DELETE_USER_TODO_LIST, { id });
			if (!data?.deleteUserTodoList) throw new Error('Delete was not confirmed by the server');
		},
		onSuccess: (_data, { userId }) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.userTodos.todoLists(userId) });
			queryClient.invalidateQueries({ queryKey: queryKeys.userTodos.lists() });
			queryClient.invalidateQueries({ queryKey: queryKeys.userTodos.details() });
		},
	}));
}
