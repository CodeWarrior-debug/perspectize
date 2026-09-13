import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { MUTE_THREAD, type MuteThreadResponse } from './index';
import { queryKeys } from '../keys';
import { patchThreadInList } from '$lib/messaging/inboxCache';
import { toast } from 'svelte-sonner';

export function useMuteThread() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		mutationFn: (args: { threadId: string; muted: boolean }) =>
			graphqlRequest<MuteThreadResponse>(MUTE_THREAD, {
				threadId: args.threadId,
				muted: args.muted,
			}),
		onSuccess: (data) => {
			queryClient.setQueryData(queryKeys.messaging.threads.detail(data.muteThread.id), data.muteThread);
			patchThreadInList(queryClient, data.muteThread);
		},
		onError: (_err, args) => {
			toast.error(args.muted ? 'Could not mute thread' : 'Could not unmute thread');
		},
	}));
}
