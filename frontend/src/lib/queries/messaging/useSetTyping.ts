import { createMutation } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { SET_TYPING, type SetTypingResponse } from './index';

export function useSetTyping() {
	return createMutation(() => ({
		mutationFn: (vars: { threadId: string; typing: boolean }) => graphqlRequest<SetTypingResponse>(SET_TYPING, vars),
		onError: (err: unknown) => {
			console.debug('[setTyping] ignored error:', err);
		},
	}));
}
