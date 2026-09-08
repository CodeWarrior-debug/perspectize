import type { Message, MessageThread, MessagePageInfo } from '$lib/queries/messaging';
import type { ThreadEvent } from '$lib/messaging/events';

const TYPING_TTL_MS = 6000;

export interface ThreadMessagesCache {
	items: Message[];
	oldestLoadedSeq: number | null;
	hasMoreOlder: boolean;
}

export function emptyThreadMessagesCache(): ThreadMessagesCache {
	return { items: [], oldestLoadedSeq: null, hasMoreOlder: false };
}

function sortAsc(items: Message[]): Message[] {
	return [...items].sort((a, b) => a.seq - b.seq);
}

export function seedFromApiPage(
	apiItems: Message[],
	pageInfo: MessagePageInfo,
): ThreadMessagesCache {
	const items = sortAsc(apiItems);
	return {
		items,
		oldestLoadedSeq: items.length ? items[0].seq : null,
		hasMoreOlder: pageInfo.hasPreviousPage,
	};
}

export function applyMessagePosted(
	cache: ThreadMessagesCache,
	message: Message,
): ThreadMessagesCache {
	if (message.seq <= 0) return cache;
	const bySeq = cache.items.findIndex((m) => m.seq === message.seq);
	if (bySeq !== -1) {
		const existing = cache.items[bySeq];
		if (existing.id === message.id && existing.body === message.body) return cache;
		const items = [...cache.items];
		items[bySeq] = message;
		return { ...cache, items };
	}
	if (cache.items.some((m) => m.id === message.id)) return cache;
	const items = sortAsc([...cache.items, message]);
	return { ...cache, items };
}

export function prependOlderPage(
	cache: ThreadMessagesCache,
	apiItems: Message[],
	pageInfo: MessagePageInfo,
): ThreadMessagesCache {
	const known = new Set(cache.items.map((m) => m.seq));
	const older = sortAsc(apiItems.filter((m) => !known.has(m.seq)));
	const items = [...older, ...cache.items];
	return {
		items,
		oldestLoadedSeq: items.length ? items[0].seq : cache.oldestLoadedSeq,
		hasMoreOlder: pageInfo.hasPreviousPage,
	};
}

export function nextSinceSeq(cache: ThreadMessagesCache): number | null {
	if (!cache.items.length) return null;
	return cache.items.reduce((max, m) => (m.seq > max ? m.seq : max), cache.items[0].seq);
}

/** Replace a message in the list by id with updated body + editedAt. Returns the same ref when nothing changed. */
export function applyMessageEdited(
	cache: ThreadMessagesCache,
	message: Message,
): ThreadMessagesCache {
	const idx = cache.items.findIndex((m) => m.id === message.id);
	if (idx === -1) return cache;
	if (cache.items[idx].body === message.body && cache.items[idx].editedAt === message.editedAt) {
		return cache;
	}
	const items = [...cache.items];
	items[idx] = message;
	return { ...cache, items };
}

/**
 * Tombstone a message in place by id: blank its body and set `deletedAt`, keeping
 * it (and its seq) in the list so history stays gap-free. Match on id first, then
 * on `seq` (the MessageDeleted event carries seq but not the message id shape the
 * optimistic row used). `deletedAt` may be passed (server value) or defaulted to now.
 * Returns the same ref when the row is absent or already tombstoned.
 */
export function applyMessageDeleted(
	cache: ThreadMessagesCache,
	ref: { messageId?: string; seq?: number },
	deletedAt: string = new Date().toISOString(),
): ThreadMessagesCache {
	const idx = cache.items.findIndex(
		(m) =>
			(ref.messageId != null && m.id === ref.messageId) || (ref.seq != null && m.seq === ref.seq),
	);
	if (idx === -1) return cache;
	if (cache.items[idx].deletedAt != null && cache.items[idx].body === '') return cache;
	const items = [...cache.items];
	items[idx] = { ...items[idx], body: '', deletedAt };
	return { ...cache, items };
}

export function applyThreadEventToThread(
	thread: MessageThread,
	event: ThreadEvent,
	myUserId: string,
): MessageThread {
	switch (event.__typename) {
		case 'MessagePosted': {
			const m = event.message;
			if (m.seq <= thread.latestSeq) return thread;
			const fromMe = m.sender.id === myUserId;
			const myLastReadSeq = fromMe ? m.seq : thread.myLastReadSeq;
			return {
				...thread,
				latestSeq: m.seq,
				lastMessageAt: m.createdAt,
				myLastReadSeq,
				unreadCount: Math.max(0, m.seq - myLastReadSeq),
			};
		}
		case 'ReadReceiptChanged': {
			const idx = thread.participants.findIndex((p) => p.user.id === event.userId);
			let participants = thread.participants;
			if (idx !== -1 && event.lastReadSeq > thread.participants[idx].lastReadSeq) {
				participants = [...thread.participants];
				participants[idx] = { ...participants[idx], lastReadSeq: event.lastReadSeq };
			}
			const isMe = event.userId === myUserId;
			const myLastReadSeq = isMe
				? Math.max(thread.myLastReadSeq, event.lastReadSeq)
				: thread.myLastReadSeq;
			if (participants === thread.participants && myLastReadSeq === thread.myLastReadSeq) {
				return thread;
			}
			return {
				...thread,
				participants,
				myLastReadSeq,
				unreadCount: Math.max(0, thread.latestSeq - myLastReadSeq),
			};
		}
		case 'ParticipantChanged': {
			if (event.change !== 'REMOVED') return thread;
			const participants = thread.participants.filter((p) => p.user.id !== event.userId);
			if (participants.length === thread.participants.length) return thread;
			return { ...thread, participants };
		}
		case 'MessageEdited': {
			// No thread-level summary fields change on edit; return unchanged.
			return thread;
		}
		case 'MessageDeleted': {
			// If the deleted message was the latest, latestSeq is now stale —
			// a refetch will correct it. For now return unchanged; the inbox
			// subscription will update unreadCount on the next MessagePosted.
			return thread;
		}
		default:
			return thread;
	}
}

export function typingUsersReducer(
	state: Record<string, number>,
	event: ThreadEvent,
	nowMs: number,
): Record<string, number> {
	const next: Record<string, number> = {};
	for (const [uid, expiry] of Object.entries(state)) {
		if (expiry > nowMs) next[uid] = expiry;
	}
	if (event.__typename === 'TypingChanged') {
		if (event.typing) next[event.userId] = nowMs + TYPING_TTL_MS;
		else delete next[event.userId];
	}
	const sameKeys =
		Object.keys(next).length === Object.keys(state).length &&
		Object.keys(next).every((k) => state[k] === next[k]);
	return sameKeys ? state : next;
}

export function activeTypingUserIds(state: Record<string, number>, nowMs: number): string[] {
	return Object.entries(state)
		.filter(([, expiry]) => expiry > nowMs)
		.map(([uid]) => uid)
		.sort();
}

export function presenceReducer(
	state: Record<string, 'ONLINE' | 'OFFLINE'>,
	event: ThreadEvent,
): Record<string, 'ONLINE' | 'OFFLINE'> {
	if (event.__typename !== 'PresenceChanged') return state;
	if (state[event.userId] === event.state) return state;
	return { ...state, [event.userId]: event.state };
}
