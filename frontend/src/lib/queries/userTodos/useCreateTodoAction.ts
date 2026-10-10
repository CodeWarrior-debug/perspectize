import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { CREATE_TODO_ACTION, type CreateTodoActionInput, type CreateTodoActionResponse } from './index';
import { queryKeys } from '../keys';

export function useCreateTodoAction() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		mutationFn: async (input: CreateTodoActionInput) => {
			const data = await graphqlRequest<CreateTodoActionResponse>(CREATE_TODO_ACTION, { input });
			return data.createTodoAction;
		},
		onSuccess: () => {
			// The action picker is the only cache of actions; it is long-lived, so evict it now.
			queryClient.invalidateQueries({ queryKey: queryKeys.userTodos.actions() });
		},
	}));
}
