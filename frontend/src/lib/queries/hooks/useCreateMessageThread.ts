import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { goto } from '$app/navigation';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import { CREATE_MESSAGE_THREAD, type CreateMessageThreadResponse } from '../messaging';
import { queryKeys } from '../keys';

export function useCreateMessageThread() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		mutationFn: (vars: { participantUserIds: string[]; title?: string }) =>
			graphqlRequest<CreateMessageThreadResponse>(CREATE_MESSAGE_THREAD, {
				input: { participantUserIds: vars.participantUserIds, title: vars.title ?? null },
			}),
		onSuccess: (data: CreateMessageThreadResponse) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.messaging.threads.lists() });
			goto('/messages/' + data.createMessageThread.id);
		},
		onError: (err: unknown) => {
			console.error('[createMessageThread] failed:', err);
			toast.error('Could not start conversation');
		},
	}));
}
