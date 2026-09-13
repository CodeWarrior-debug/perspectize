import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import { CREATE_MESSAGE_THREAD, type CreateMessageThreadResponse } from '../messaging';
import { queryKeys } from '../keys';

// Navigation on success is the caller's decision (a full-page /messages route
// wants to navigate to the new thread; the floating messaging widget wants to
// select it in place instead) — see the `onSuccess` callback on `mutate()` in
// NewThreadDialog.svelte, which TanStack Query runs in addition to this hook's
// own onSuccess below.
export function useCreateMessageThread() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		mutationFn: (vars: { participantUserIds: string[]; title?: string }) =>
			graphqlRequest<CreateMessageThreadResponse>(CREATE_MESSAGE_THREAD, {
				input: { participantUserIds: vars.participantUserIds, title: vars.title ?? null },
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.messaging.threads.lists() });
		},
		onError: (err: unknown) => {
			console.error('[createMessageThread] failed:', err);
			toast.error('Could not start conversation');
		},
	}));
}
