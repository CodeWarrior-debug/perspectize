import type { Message, MessageThread, MessagePageInfo } from '#lib/queries/messaging/index.js';
import type { ThreadEvent } from '#lib/messaging/events.js';

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

export function seedFromApiPage(apiItems: Message[], pageInfo: MessagePageInfo): ThreadMessagesCache {
	const items = sortAsc(apiItems);
	return {
		items,
		oldestLoadedSeq: items.length ? items[0].seq : null,
		hasMoreOlder: pageInfo.hasPreviousPage,
	};
}

export function applyMessagePosted(cache: ThreadMessagesCache, message: Message): ThreadMessagesCache {
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
export function applyMessageEdited(cache: ThreadMessagesCache, message: Message): ThreadMessagesCache {
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
		(m) => (ref.messageId != null && m.id === ref.messageId) || (ref.seq != null && m.seq === ref.seq),
	);
	if (idx === -1) return cache;
	if (cache.items[idx].deletedAt != null && cache.items[idx].body === '') return cache;
	const items = [...cache.items];
	items[idx] = { ...items[idx], body: '', deletedAt };
	return { ...cache, items };
}

/**
 * Applies one thread event to the thread summary. Unread follows the server's
 * row rule (rows newer than my read pointer that I did not send), so it is
 * counted per message, never from seq distance: pruning can leave gaps.
 *
 * `known` says the message is already in the loaded messages list (by id), so a
 * repeated delivery is not counted again. Without it, a message at or below
 * latestSeq counts as seen.
 */
export function applyThreadEventToThread(
	thread: MessageThread,
	event: ThreadEvent,
	myUserId: string,
	known?: boolean,
): MessageThread {
	switch (event.__typename) {
		case 'MessagePosted': {
			const m = event.message;
			const seen = known ?? m.seq <= thread.latestSeq;
			const latestSeq = Math.max(thread.latestSeq, m.seq);
			if (seen && latestSeq === thread.latestSeq) return thread;
			const fromMe = m.sender.id === myUserId;
			const myLastReadSeq = fromMe && !seen ? m.seq : thread.myLastReadSeq;
			return {
				...thread,
				latestSeq,
				lastMessageAt: latestSeq !== thread.latestSeq ? m.createdAt : thread.lastMessageAt,
				myLastReadSeq,
				unreadCount: fromMe || seen ? thread.unreadCount : thread.unreadCount + 1,
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
			const myLastReadSeq = isMe ? Math.max(thread.myLastReadSeq, event.lastReadSeq) : thread.myLastReadSeq;
			if (participants === thread.participants && myLastReadSeq === thread.myLastReadSeq) {
				return thread;
			}
			return {
				...thread,
				participants,
				myLastReadSeq,
				// Upper bound from seq distance: never above the count we hold, and
				// exact once the read reaches the latest message. A markRead result
				// from the server replaces it with the row count.
				unreadCount: Math.min(thread.unreadCount, Math.max(0, thread.latestSeq - myLastReadSeq)),
			};
		}
		case 'ParticipantChanged': {
			if (event.change !== 'REMOVED') return thread;
			const participants = thread.participants.filter((p) => p.user.id !== event.userId);
			if (participants.length === thread.participants.length) return thread;
			return { ...thread, participants };
		}
		case 'MessageEdited':
		case 'MessageDeleted':
			// A tombstone keeps its row and seq, and the server counts it as
			// unread like any other row, so neither latestSeq nor unread moves.
			return thread;
		case 'StreamReset':
		case 'TypingChanged':
		case 'PresenceChanged':
			return thread;
		default:
			return assertNever(event);
	}
}

function assertNever(value: never): never {
	throw new Error(`unhandled thread event: ${JSON.stringify(value)}`);
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
		Object.keys(next).length === Object.keys(state).length && Object.keys(next).every((k) => state[k] === next[k]);
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
