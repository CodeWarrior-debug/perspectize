import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { DELETE_MESSAGE, type DeleteMessageResponse } from '../messaging';
import { queryKeys } from '../keys';
import {
	applyMessageDeleted,
	applyMessageEdited,
	type ThreadMessagesCache,
} from '$lib/messaging/threadCache';
import { toast } from 'svelte-sonner';

export function useDeleteMessage() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		mutationFn: (args: { messageId: string; threadId: string }) =>
			graphqlRequest<DeleteMessageResponse>(DELETE_MESSAGE, { messageId: args.messageId }),
		onMutate: (args) => {
			queryClient.setQueryData<ThreadMessagesCache>(
				queryKeys.messaging.messages.list(args.threadId),
				(cache) => (cache ? applyMessageDeleted(cache, { messageId: args.messageId }) : cache),
			);
		},
		onSuccess: (data, args) => {
			queryClient.setQueryData<ThreadMessagesCache>(
				queryKeys.messaging.messages.list(args.threadId),
				(cache) => (cache ? applyMessageEdited(cache, data.deleteMessage) : cache),
			);
		},
		onError: (_err, args) => {
			// Invalidate so the refetch restores the un-tombstoned row in the UI.
			queryClient.invalidateQueries({ queryKey: queryKeys.messaging.messages.list(args.threadId) });
			toast.error('Could not delete message');
		},
	}));
}
