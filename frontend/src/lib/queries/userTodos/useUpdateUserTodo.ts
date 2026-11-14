import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { UPDATE_USER_TODO, type UpdateUserTodoInput, type UpdateUserTodoResponse } from './index';
import { queryKeys } from '../keys';

export function useUpdateUserTodo() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		mutationFn: async (input: UpdateUserTodoInput) => {
			const data = await graphqlRequest<UpdateUserTodoResponse>(UPDATE_USER_TODO, { input });
			return data.updateUserTodo;
		},
		onSuccess: (todo) => {
			// This todo's detail, plus the lists it may now sort or filter differently in.
			queryClient.invalidateQueries({ queryKey: queryKeys.userTodos.detail(todo.id) });
			queryClient.invalidateQueries({ queryKey: queryKeys.userTodos.lists() });
		},
	}));
}
