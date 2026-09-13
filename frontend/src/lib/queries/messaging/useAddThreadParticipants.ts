import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import { ADD_THREAD_PARTICIPANTS, type AddThreadParticipantsResponse } from './index';
import { queryKeys } from '../keys';

export function useAddThreadParticipants() {
	const queryClient = useQueryClient();
	return createMutation(() => ({
		mutationFn: (vars: { threadId: string; userIds: string[] }) =>
			graphqlRequest<AddThreadParticipantsResponse>(ADD_THREAD_PARTICIPANTS, vars),
		onSuccess: (data: AddThreadParticipantsResponse, vars: { threadId: string; userIds: string[] }) => {
			queryClient.setQueryData(queryKeys.messaging.threads.detail(vars.threadId), data.addThreadParticipants);
			queryClient.invalidateQueries({ queryKey: queryKeys.messaging.threads.lists() });
			toast.success('Added to conversation');
		},
		onError: (err: unknown) => {
			console.error('[addThreadParticipants] failed:', err);
			toast.error('Could not add people');
		},
	}));
}
