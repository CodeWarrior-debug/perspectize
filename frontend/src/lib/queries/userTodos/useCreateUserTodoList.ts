import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { CREATE_USER_TODO_LIST, type CreateUserTodoListInput, type CreateUserTodoListResponse } from './index';
import { queryKeys } from '../keys';

export function useCreateUserTodoList() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		mutationFn: async (input: CreateUserTodoListInput) => {
			const data = await graphqlRequest<CreateUserTodoListResponse>(CREATE_USER_TODO_LIST, { input });
			return data.createUserTodoList;
		},
		onSuccess: (list) => {
			// Only the owner's list collection changes; no todo does.
			queryClient.invalidateQueries({ queryKey: queryKeys.userTodos.todoLists(Number(list.user.id)) });
		},
	}));
}
