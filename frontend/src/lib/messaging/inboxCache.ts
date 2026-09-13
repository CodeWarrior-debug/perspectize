import type { QueryClient } from '@tanstack/svelte-query';
import type { MessageThread, InboxEvent, ListMessageThreadsResponse } from '$lib/queries/messaging';
import { queryKeys } from '$lib/queries/keys';

export function applyInboxEvent(threads: MessageThread[], event: InboxEvent): MessageThread[] {
	const idx = threads.findIndex((t) => t.id === event.threadId);
	if (idx === -1) return threads;
	const current = threads[idx];
	if (
		current.lastMessageAt === event.lastMessageAt &&
		current.latestSeq === event.latestSeq &&
		current.unreadCount === event.unreadCount
	) {
		return threads;
	}
	const updated: MessageThread = {
		...current,
		lastMessageAt: event.lastMessageAt,
		latestSeq: event.latestSeq,
		unreadCount: event.unreadCount,
	};
	const next = [...threads];
	next[idx] = updated;
	next.sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : a.lastMessageAt > b.lastMessageAt ? -1 : 0));
	return next;
}

export function totalUnread(threads: MessageThread[]): number {
	return threads.reduce((sum, t) => sum + t.unreadCount, 0);
}

/** Replace one thread by id inside the `threads.list()` cache entry, in place of a no-op invalidate. */
export function patchThreadInList(queryClient: QueryClient, updated: MessageThread): void {
	queryClient.setQueryData<ListMessageThreadsResponse>(queryKeys.messaging.threads.list(), (cache) => {
		if (!cache) return cache;
		const idx = cache.messageThreads.findIndex((t) => t.id === updated.id);
		if (idx === -1) return cache;
		const messageThreads = [...cache.messageThreads];
		messageThreads[idx] = updated;
		return { ...cache, messageThreads };
	});
}
