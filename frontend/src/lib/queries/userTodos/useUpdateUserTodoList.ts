import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { UPDATE_USER_TODO_LIST, type UpdateUserTodoListInput, type UpdateUserTodoListResponse } from './index';
import { queryKeys } from '../keys';

export function useUpdateUserTodoList() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		mutationFn: async (input: UpdateUserTodoListInput) => {
			const data = await graphqlRequest<UpdateUserTodoListResponse>(UPDATE_USER_TODO_LIST, { input });
			return data.updateUserTodoList;
		},
		onSuccess: (list) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.userTodos.todoLists(Number(list.user.id)) });
			// Todos carry their list's name, so every cached todo list and todo detail may show it.
			queryClient.invalidateQueries({ queryKey: queryKeys.userTodos.lists() });
			queryClient.invalidateQueries({ queryKey: queryKeys.userTodos.details() });
		},
	}));
}
