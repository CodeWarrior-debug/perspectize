import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { MUTE_THREAD, type MuteThreadResponse } from '../messaging';
import { queryKeys } from '../keys';
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
			queryClient.invalidateQueries({
				queryKey: queryKeys.messaging.threads.lists(),
				refetchType: 'none',
			});
		},
		onError: (_err, args) => {
			toast.error(args.muted ? 'Could not mute thread' : 'Could not unmute thread');
		},
	}));
}
