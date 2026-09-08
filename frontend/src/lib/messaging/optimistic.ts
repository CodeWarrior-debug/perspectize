import type { Message, MessagingUser } from '$lib/queries/messaging';
import { applyMessagePosted, type ThreadMessagesCache } from '$lib/messaging/threadCache';

export function makeClientNonce(): string {
	const c = globalThis.crypto as Crypto | undefined;
	if (c && typeof c.randomUUID === 'function') return c.randomUUID();
	return `n-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isOptimistic(message: Message): boolean {
	return message.id.startsWith('optimistic:');
}

export function optimisticMessage(args: {
	body: string;
	sender: MessagingUser;
	threadId: string;
	clientNonce: string;
	afterSeq: number;
}): Message {
	return {
		id: `optimistic:${args.clientNonce}`,
		threadId: args.threadId,
		sender: args.sender,
		seq: args.afterSeq + 0.5,
		body: args.body.trim(),
		createdAt: new Date().toISOString(),
		editedAt: null,
		deletedAt: null,
	};
}

export function addOptimistic(
	cache: ThreadMessagesCache,
	optimistic: Message,
): ThreadMessagesCache {
	if (cache.items.some((m) => m.id === optimistic.id)) return cache;
	const items = [...cache.items, optimistic].sort((a, b) => a.seq - b.seq);
	return { ...cache, items };
}

export function reconcileSentMessage(
	cache: ThreadMessagesCache,
	clientNonce: string,
	serverMessage: Message,
): ThreadMessagesCache {
	const optId = `optimistic:${clientNonce}`;
	const withoutOptimistic = cache.items.some((m) => m.id === optId)
		? { ...cache, items: cache.items.filter((m) => m.id !== optId) }
		: cache;
	return applyMessagePosted(withoutOptimistic, serverMessage);
}
