import type { Message, MessageThread } from '$lib/queries/messaging';

export function showSenderForIndex(items: Message[], index: number): boolean {
	if (index <= 0) return true;
	return items[index - 1].sender.id !== items[index].sender.id;
}

export function lastKnownSeq(items: Message[]): number {
	let max = 0;
	for (const m of items) {
		if (m.id.startsWith('optimistic:')) continue;
		const s = Math.floor(m.seq);
		if (s > max) max = s;
	}
	return max;
}

export function typingUsernames(thread: MessageThread | null, typingUserIds: string[]): string[] {
	if (!thread) return [];
	return typingUserIds
		.map((id) => thread.participants.find((p) => p.user.id === id)?.user.username)
		.filter((name): name is string => Boolean(name));
}

export function shouldMarkRead(thread: MessageThread | null): boolean {
	return !!thread && thread.unreadCount > 0;
}

/**
 * The oldest message from someone else that sits past the viewer's read pointer,
 * i.e. where "new" starts when a thread is opened. The viewer's own messages,
 * tombstones and not-yet-confirmed optimistic sends never count.
 */
export function firstUnreadFromOthers(items: Message[], myLastReadSeq: number, myUserId: string): Message | null {
	// The IntID scalar reaches the client as a string at runtime, so "2" > "16"
	// would compare lexicographically; coerce both sides.
	const readPointer = Number(myLastReadSeq);
	for (const m of items) {
		if (m.id.startsWith('optimistic:') || m.deletedAt != null) continue;
		if (m.sender.id !== myUserId && Number(m.seq) > readPointer) return m;
	}
	return null;
}
