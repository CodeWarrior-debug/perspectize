import { createQuery } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { LIST_MESSAGE_THREADS, type ListMessageThreadsResponse } from './index';
import { queryKeys } from '../keys';

export function useMessageThreads(enabled: () => boolean = () => true) {
	return createQuery(() => ({
		queryKey: queryKeys.messaging.threads.list(),
		queryFn: () => graphqlRequest<ListMessageThreadsResponse>(LIST_MESSAGE_THREADS),
		staleTime: 30_000,
		enabled: enabled(),
	}));
}
