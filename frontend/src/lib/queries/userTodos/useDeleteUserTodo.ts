import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { DELETE_USER_TODO, type DeleteUserTodoResponse } from './index';
import { queryKeys } from '../keys';

/** `mutate(id)`. A `false` answer from the server is reported as an error. */
export function useDeleteUserTodo() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		mutationFn: async (id: string) => {
			const data = await graphqlRequest<DeleteUserTodoResponse>(DELETE_USER_TODO, { id });
			if (!data?.deleteUserTodo) throw new Error('Delete was not confirmed by the server');
			return id;
		},
		onSuccess: (id) => {
			// The row is gone: drop its detail rather than refetching a deleted id.
			queryClient.removeQueries({ queryKey: queryKeys.userTodos.detail(id), exact: true });
			queryClient.invalidateQueries({ queryKey: queryKeys.userTodos.lists() });
		},
	}));
}
