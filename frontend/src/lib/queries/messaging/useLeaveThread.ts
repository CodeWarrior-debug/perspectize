import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { goto } from '$app/navigation';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import { LEAVE_THREAD, type LeaveThreadResponse } from './index';
import { queryKeys } from '../keys';

export function useLeaveThread() {
	const queryClient = useQueryClient();
	return createMutation(() => ({
		mutationFn: (vars: { threadId: string }) => graphqlRequest<LeaveThreadResponse>(LEAVE_THREAD, vars),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.messaging.threads.lists() });
			goto('/messages');
			toast.success('Left conversation');
		},
		onError: (err: unknown) => {
			console.error('[leaveThread] failed:', err);
			toast.error('Could not leave conversation');
		},
	}));
}
