import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { REORDER_USER_TODO_LIST, type ReorderUserTodoListResponse } from './index';
import { queryKeys } from '../keys';

/** `mutate({ listId, todoIds })`: todoIds in their new order; positions become 1..N. */
export function useReorderUserTodoList() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		mutationFn: async ({ listId, todoIds }: { listId: number; todoIds: number[] }) => {
			const data = await graphqlRequest<ReorderUserTodoListResponse>(REORDER_USER_TODO_LIST, { listId, todoIds });
			return data.reorderUserTodoList;
		},
		onSuccess: (todos) => {
			// Positions changed for exactly these rows: evict the list pages and their details.
			queryClient.invalidateQueries({ queryKey: queryKeys.userTodos.lists() });
			for (const todo of todos) {
				queryClient.invalidateQueries({ queryKey: queryKeys.userTodos.detail(todo.id) });
			}
		},
	}));
}
