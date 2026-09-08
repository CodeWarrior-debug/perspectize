import type { MessageThread, InboxEvent } from '$lib/queries/messaging';

export function applyInboxEvent(
	threads: MessageThread[],
	event: InboxEvent,
): MessageThread[] {
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
