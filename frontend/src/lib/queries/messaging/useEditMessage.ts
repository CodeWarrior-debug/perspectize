import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { EDIT_MESSAGE, type EditMessageResponse } from './index';
import { queryKeys } from '../keys';
import type { ThreadMessagesCache } from '#lib/messaging/threadCache.js';
import { applyMessageResult } from '#lib/messaging/messagingCache.js';
import { toast } from 'svelte-sonner';

export function useEditMessage() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		mutationFn: async (args: { messageId: string; threadId: string; body: string; previousBody: string }) => {
			return graphqlRequest<EditMessageResponse>(EDIT_MESSAGE, {
				messageId: args.messageId,
				body: args.body.trim(),
			});
		},
		onMutate: (args) => {
			const key = queryKeys.messaging.messages.list(args.threadId);
			const existing = queryClient.getQueryData<ThreadMessagesCache>(key)?.items.find((m) => m.id === args.messageId);
			const previousEditedAt = existing?.editedAt ?? null;
			if (existing) {
				applyMessageResult(queryClient, {
					kind: 'editStarted',
					message: { ...existing, body: args.body.trim(), editedAt: new Date().toISOString() },
				});
			}
			return { previousBody: args.previousBody, previousEditedAt };
		},
		onSuccess: (data) => {
			applyMessageResult(queryClient, { kind: 'edited', message: data.editMessage });
		},
		onError: (_err, args, ctx) => {
			const key = queryKeys.messaging.messages.list(args.threadId);
			const existing = queryClient.getQueryData<ThreadMessagesCache>(key)?.items.find((m) => m.id === args.messageId);
			if (existing) {
				applyMessageResult(queryClient, {
					kind: 'editStarted',
					message: { ...existing, body: args.previousBody, editedAt: ctx?.previousEditedAt ?? null },
				});
			}
			toast.error('Could not edit message');
		},
	}));
}
