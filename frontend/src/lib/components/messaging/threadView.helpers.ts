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
