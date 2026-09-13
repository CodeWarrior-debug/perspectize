import { createQuery, useQueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { LIST_THREAD_MESSAGES, type ListThreadMessagesResponse } from '../messaging';
import { queryKeys } from '../keys';
import { seedFromApiPage, prependOlderPage, type ThreadMessagesCache } from '$lib/messaging/threadCache';

const PAGE_SIZE = 40;

export function useThreadMessages(getThreadId: () => string) {
	const queryClient = useQueryClient();
	let isFetchingOlder = $state(false);

	const query = createQuery(() => ({
		queryKey: queryKeys.messaging.messages.list(getThreadId()),
		queryFn: async () => {
			const res = await graphqlRequest<ListThreadMessagesResponse>(LIST_THREAD_MESSAGES, {
				threadId: getThreadId(),
				first: PAGE_SIZE,
			});
			return seedFromApiPage(res.threadMessages.items, res.threadMessages.pageInfo);
		},
		staleTime: 5_000,
	}));

	async function fetchOlder() {
		const current = query.data as ThreadMessagesCache | undefined;
		if (!current || !current.hasMoreOlder || current.oldestLoadedSeq == null || isFetchingOlder) {
			return;
		}
		isFetchingOlder = true;
		try {
			const res = await graphqlRequest<ListThreadMessagesResponse>(LIST_THREAD_MESSAGES, {
				threadId: getThreadId(),
				first: PAGE_SIZE,
				before: current.oldestLoadedSeq,
			});
			queryClient.setQueryData<ThreadMessagesCache>(queryKeys.messaging.messages.list(getThreadId()), (old) =>
				old ? prependOlderPage(old, res.threadMessages.items, res.threadMessages.pageInfo) : old,
			);
		} finally {
			isFetchingOlder = false;
		}
	}

	return {
		get query() {
			return query;
		},
		get isFetchingOlder() {
			return isFetchingOlder;
		},
		fetchOlder,
	};
}
