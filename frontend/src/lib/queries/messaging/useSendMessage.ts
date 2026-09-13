import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import { SEND_MESSAGE, type SendMessageResponse, type MessagingUser } from './index';
import { queryKeys } from '../keys';
import { makeClientNonce, optimisticMessage, addOptimistic, reconcileSentMessage } from '$lib/messaging/optimistic';
import type { ThreadMessagesCache } from '$lib/messaging/threadCache';

export interface SendArgs {
	threadId: string;
	body: string;
	sender: MessagingUser;
	afterSeq: number;
	/** set by onMutate, consumed by mutationFn/onError/onSuccess */
	__nonce?: string;
}

export function useSendMessage() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		onMutate: (args: SendArgs) => {
			args.__nonce = makeClientNonce();
			const optimistic = optimisticMessage({
				body: args.body,
				sender: args.sender,
				threadId: args.threadId,
				clientNonce: args.__nonce,
				afterSeq: args.afterSeq,
			});
			queryClient.setQueryData<ThreadMessagesCache>(queryKeys.messaging.messages.list(args.threadId), (cache) =>
				cache ? addOptimistic(cache, optimistic) : cache,
			);
		},
		mutationFn: async (args: SendArgs) => {
			const clientNonce = args.__nonce ?? makeClientNonce();
			const response = await graphqlRequest<SendMessageResponse>(SEND_MESSAGE, {
				input: { threadId: args.threadId, body: args.body.trim(), clientNonce },
			});
			return { response, clientNonce, args };
		},
		onError: (_err: unknown, args: SendArgs) => {
			const optId = 'optimistic:' + args.__nonce;
			queryClient.setQueryData<ThreadMessagesCache>(queryKeys.messaging.messages.list(args.threadId), (cache) =>
				cache ? { ...cache, items: cache.items.filter((m) => m.id !== optId) } : cache,
			);
			toast.error('Message failed to send');
		},
		onSuccess: (result: { response: SendMessageResponse; clientNonce: string; args: SendArgs }) => {
			queryClient.setQueryData<ThreadMessagesCache>(queryKeys.messaging.messages.list(result.args.threadId), (cache) =>
				cache ? reconcileSentMessage(cache, result.clientNonce, result.response.sendMessage) : cache,
			);
		},
	}));
}
