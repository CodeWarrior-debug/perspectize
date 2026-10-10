import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { CREATE_USER_TODO, type CreateUserTodoInput, type CreateUserTodoResponse } from './index';
import { queryKeys } from '../keys';

export function useCreateUserTodo() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		mutationFn: async (input: CreateUserTodoInput) => {
			const data = await graphqlRequest<CreateUserTodoResponse>(CREATE_USER_TODO, { input });
			return data.createUserTodo;
		},
		onSuccess: () => {
			// The new todo can belong in any cached list (any status, action or list filter).
			queryClient.invalidateQueries({ queryKey: queryKeys.userTodos.lists() });
		},
	}));
}
