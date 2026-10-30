import { createQuery } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { TODO_ACTIONS, TODO_ACTIONS_STALE_TIME_MS, type TodoActionsResponse } from './index';
import { queryKeys } from '../keys';

/**
 * Presets plus the caller's own actions, ordered by typical sequence. The server
 * requires sign-in (`@auth`), so pass `enabled` to hold the query until then.
 */
export function useTodoActions(enabled: () => boolean = () => true) {
	return createQuery(() => ({
		queryKey: queryKeys.userTodos.actions(),
		queryFn: () => graphqlRequest<TodoActionsResponse>(TODO_ACTIONS),
		staleTime: TODO_ACTIONS_STALE_TIME_MS,
		enabled: enabled(),
	}));
}
