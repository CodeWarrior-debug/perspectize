import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { MARK_THREAD_READ, type MarkThreadReadResponse } from '../messaging';
import { queryKeys } from '../keys';
import { patchThreadInList } from '$lib/messaging/inboxCache';

export function useMarkThreadRead() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		mutationFn: (vars: { threadId: string; seq: number }) =>
			graphqlRequest<MarkThreadReadResponse>(MARK_THREAD_READ, {
				threadId: vars.threadId,
				seq: vars.seq,
			}),
		onSuccess: (data: MarkThreadReadResponse, vars: { threadId: string; seq: number }) => {
			queryClient.setQueryData(queryKeys.messaging.threads.detail(vars.threadId), data.markThreadRead);
			patchThreadInList(queryClient, data.markThreadRead);
		},
		onError: (err: unknown) => {
			console.error('[markThreadRead] failed:', err);
		},
	}));
}
