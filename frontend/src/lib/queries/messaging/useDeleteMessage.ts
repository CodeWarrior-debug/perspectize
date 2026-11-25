import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { DELETE_MESSAGE, type DeleteMessageResponse } from './index';
import { queryKeys } from '../keys';
import { applyMessageResult } from '#lib/messaging/messagingCache.js';
import { toast } from 'svelte-sonner';

export function useDeleteMessage() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		mutationFn: (args: { messageId: string; threadId: string }) =>
			graphqlRequest<DeleteMessageResponse>(DELETE_MESSAGE, { messageId: args.messageId }),
		onMutate: (args) => {
			applyMessageResult(queryClient, {
				kind: 'deleteStarted',
				threadId: args.threadId,
				messageId: args.messageId,
			});
		},
		onSuccess: (data) => {
			applyMessageResult(queryClient, { kind: 'deleted', message: data.deleteMessage });
			toast('Message deleted');
		},
		onError: (_err, args) => {
			// Invalidate so the refetch restores the un-tombstoned row in the UI.
			queryClient.invalidateQueries({ queryKey: queryKeys.messaging.messages.list(args.threadId) });
			toast.error('Could not delete message');
		},
	}));
}
