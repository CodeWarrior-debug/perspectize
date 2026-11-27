import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import { SEND_MESSAGE, type SendMessageResponse, type MessagingUser } from './index';
import { queryKeys } from '../keys';
import { makeClientNonce, optimisticMessage, addOptimistic } from '#lib/messaging/optimistic.js';
import { applyMessageResult } from '#lib/messaging/messagingCache.js';
import type { ThreadMessagesCache } from '#lib/messaging/threadCache.js';

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
			applyMessageResult(queryClient, {
				kind: 'sendFailed',
				threadId: args.threadId,
				clientNonce: args.__nonce ?? '',
			});
			toast.error('Message failed to send');
		},
		onSuccess: (result: { response: SendMessageResponse; clientNonce: string; args: SendArgs }) => {
			applyMessageResult(queryClient, {
				kind: 'sent',
				message: result.response.sendMessage,
				clientNonce: result.clientNonce,
			});
		},
	}));
}
