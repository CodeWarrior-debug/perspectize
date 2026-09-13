import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { EDIT_MESSAGE, type EditMessageResponse } from './index';
import { queryKeys } from '../keys';
import { applyMessageEdited, type ThreadMessagesCache } from '$lib/messaging/threadCache';
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
			queryClient.setQueryData<ThreadMessagesCache>(key, (cache) => {
				if (!cache) return cache;
				const current = cache.items.find((m) => m.id === args.messageId);
				if (!current) return cache;
				return applyMessageEdited(cache, {
					...current,
					body: args.body.trim(),
					editedAt: new Date().toISOString(),
				});
			});
			return { previousBody: args.previousBody, previousEditedAt };
		},
		onSuccess: (data, args) => {
			const key = queryKeys.messaging.messages.list(args.threadId);
			queryClient.setQueryData<ThreadMessagesCache>(key, (cache) =>
				cache ? applyMessageEdited(cache, data.editMessage) : cache,
			);
		},
		onError: (_err, args, ctx) => {
			const key = queryKeys.messaging.messages.list(args.threadId);
			queryClient.setQueryData<ThreadMessagesCache>(key, (cache) => {
				if (!cache) return cache;
				const existing = cache.items.find((m) => m.id === args.messageId);
				if (!existing) return cache;
				return applyMessageEdited(cache, {
					...existing,
					body: args.previousBody,
					editedAt: ctx?.previousEditedAt ?? null,
				});
			});
			toast.error('Could not edit message');
		},
	}));
}
