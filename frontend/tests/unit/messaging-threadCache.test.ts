import { describe, it, expect } from 'vitest';
import type { Message, MessageThread, MessagePageInfo } from '$lib/queries/messaging';
import type { ThreadEvent } from '$lib/messaging/events';
import {
	emptyThreadMessagesCache,
	applyMessagePosted,
	prependOlderPage,
	seedFromApiPage,
	nextSinceSeq,
	applyThreadEventToThread,
	typingUsersReducer,
	activeTypingUserIds,
	presenceReducer,
	applyMessageEdited,
	applyMessageDeleted,
} from '$lib/messaging/threadCache';

const msg = (seq: number, over: Partial<Message> = {}): Message => ({
	id: `m${seq}`,
	threadId: 't1',
	sender: { id: 'u2', username: 'bob' },
	seq,
	body: `body ${seq}`,
	createdAt: '2026-09-07T12:00:00Z',
	editedAt: null,
	deletedAt: null,
	...over,
});

const pageInfo = (over: Partial<MessagePageInfo> = {}): MessagePageInfo => ({
	hasNextPage: false,
	hasPreviousPage: false,
	startCursor: null,
	endCursor: null,
	...over,
});

const thread = (over: Partial<MessageThread> = {}): MessageThread => ({
	id: 't1',
	title: null,
	participants: [
		{ user: { id: 'u1', username: 'me' }, role: 'OWNER', lastReadSeq: 5, joinedAt: 'x' },
		{ user: { id: 'u2', username: 'bob' }, role: 'MEMBER', lastReadSeq: 3, joinedAt: 'x' },
	],
	lastMessageAt: '2026-09-07T12:00:00Z',
	latestSeq: 5,
	myLastReadSeq: 5,
	unreadCount: 0,
	muted: false,
	createdAt: 'x',
	...over,
});

describe('threadCache — message list', () => {
	it('seedFromApiPage reverses newest-first API items to ascending', () => {
		const c = seedFromApiPage([msg(9), msg(8), msg(7)], pageInfo({ hasPreviousPage: true }));
		expect(c.items.map((m) => m.seq)).toEqual([7, 8, 9]);
		expect(c.oldestLoadedSeq).toBe(7);
		expect(c.hasMoreOlder).toBe(true);
	});

	it('applyMessagePosted inserts in ascending seq order', () => {
		let c = seedFromApiPage([msg(8), msg(7)], pageInfo());
		c = applyMessagePosted(c, msg(9));
		expect(c.items.map((m) => m.seq)).toEqual([7, 8, 9]);
	});

	it('applyMessagePosted replaces an item with the same seq (optimistic → real)', () => {
		let c = seedFromApiPage([msg(7, { id: 'temp', body: 'optimistic' })], pageInfo());
		c = applyMessagePosted(c, msg(7, { id: 'm7', body: 'real' }));
		expect(c.items).toHaveLength(1);
		expect(c.items[0]).toMatchObject({ id: 'm7', body: 'real' });
	});

	it('applyMessagePosted dedupes by id and returns the same ref when unchanged', () => {
		const c0 = seedFromApiPage([msg(7)], pageInfo());
		const c1 = applyMessagePosted(c0, msg(7));
		expect(c1).toBe(c0);
	});

	it('applyMessagePosted ignores non-positive seq', () => {
		const c0 = seedFromApiPage([msg(7)], pageInfo());
		expect(applyMessagePosted(c0, msg(0))).toBe(c0);
	});

	it('prependOlderPage prepends reversed older items and updates flags', () => {
		let c = seedFromApiPage([msg(9), msg(8)], pageInfo({ hasPreviousPage: true }));
		c = prependOlderPage(c, [msg(7), msg(6)], pageInfo({ hasPreviousPage: false }));
		expect(c.items.map((m) => m.seq)).toEqual([6, 7, 8, 9]);
		expect(c.oldestLoadedSeq).toBe(6);
		expect(c.hasMoreOlder).toBe(false);
	});

	it('nextSinceSeq returns the max seq, or null when empty', () => {
		expect(nextSinceSeq(emptyThreadMessagesCache())).toBeNull();
		expect(nextSinceSeq(seedFromApiPage([msg(9), msg(4)], pageInfo()))).toBe(9);
	});
});

describe('threadCache — thread summary reducer', () => {
	it('MessagePosted bumps latestSeq/lastMessageAt and raises my unreadCount when I am not the sender', () => {
		const t = applyThreadEventToThread(
			thread(),
			{ __typename: 'MessagePosted', message: msg(6, { createdAt: '2026-09-07T13:00:00Z' }) },
			'u1',
		);
		expect(t.latestSeq).toBe(6);
		expect(t.lastMessageAt).toBe('2026-09-07T13:00:00Z');
		expect(t.unreadCount).toBe(1);
	});

	it('MessagePosted from me does not raise my unreadCount', () => {
		const t = applyThreadEventToThread(
			thread(),
			{ __typename: 'MessagePosted', message: msg(6, { sender: { id: 'u1', username: 'me' } }) },
			'u1',
		);
		expect(t.unreadCount).toBe(0);
		expect(t.latestSeq).toBe(6);
	});

	it('ReadReceiptChanged moves a participant pointer forward only', () => {
		const t = applyThreadEventToThread(
			thread(),
			{ __typename: 'ReadReceiptChanged', threadId: 't1', userId: 'u2', lastReadSeq: 4 },
			'u1',
		);
		expect(t.participants.find((p) => p.user.id === 'u2')!.lastReadSeq).toBe(4);
		const t2 = applyThreadEventToThread(
			t,
			{ __typename: 'ReadReceiptChanged', threadId: 't1', userId: 'u2', lastReadSeq: 2 },
			'u1',
		);
		expect(t2.participants.find((p) => p.user.id === 'u2')!.lastReadSeq).toBe(4);
	});

	it('ReadReceiptChanged for me clears my unreadCount', () => {
		const t = applyThreadEventToThread(
			thread({ latestSeq: 8, myLastReadSeq: 5, unreadCount: 3 }),
			{ __typename: 'ReadReceiptChanged', threadId: 't1', userId: 'u1', lastReadSeq: 8 },
			'u1',
		);
		expect(t.myLastReadSeq).toBe(8);
		expect(t.unreadCount).toBe(0);
	});

	it('ParticipantChanged REMOVED drops the participant', () => {
		const t = applyThreadEventToThread(
			thread(),
			{ __typename: 'ParticipantChanged', threadId: 't1', userId: 'u2', change: 'REMOVED' },
			'u1',
		);
		expect(t.participants.map((p) => p.user.id)).toEqual(['u1']);
	});

	it('unrelated events return the same reference', () => {
		const t = thread();
		expect(
			applyThreadEventToThread(t, { __typename: 'StreamReset', threadId: 't1' }, 'u1'),
		).toBe(t);
	});
});

describe('threadCache — typing + presence reducers', () => {
	it('typing true sets an expiry ~6s out; false removes it', () => {
		let s = typingUsersReducer({}, { __typename: 'TypingChanged', threadId: 't1', userId: 'u2', typing: true }, 1000);
		expect(s.u2).toBe(7000);
		s = typingUsersReducer(s, { __typename: 'TypingChanged', threadId: 't1', userId: 'u2', typing: false }, 2000);
		expect(s.u2).toBeUndefined();
	});

	it('typing reducer prunes expired entries on every call', () => {
		const s = typingUsersReducer(
			{ u2: 500 },
			{ __typename: 'TypingChanged', threadId: 't1', userId: 'u3', typing: true },
			1000,
		);
		expect(s.u2).toBeUndefined();
		expect(s.u3).toBe(7000);
	});

	it('activeTypingUserIds returns unexpired keys sorted', () => {
		expect(activeTypingUserIds({ ub: 9000, ua: 9000, uc: 100 }, 1000)).toEqual(['ua', 'ub']);
	});

	it('presenceReducer records ONLINE/OFFLINE by userId', () => {
		let s = presenceReducer({}, { __typename: 'PresenceChanged', threadId: 't1', userId: 'u2', state: 'ONLINE' });
		expect(s.u2).toBe('ONLINE');
		s = presenceReducer(s, { __typename: 'PresenceChanged', threadId: 't1', userId: 'u2', state: 'OFFLINE' });
		expect(s.u2).toBe('OFFLINE');
	});
});

describe('threadCache — edit and delete', () => {
	it('applyMessageEdited replaces body and editedAt for a known id', () => {
		const orig = msg(7, { body: 'old', editedAt: null });
		let c = seedFromApiPage([orig], pageInfo());
		const edited = { ...orig, body: 'new body', editedAt: '2026-09-07T14:00:00Z' };
		c = applyMessageEdited(c, edited);
		expect(c.items[0].body).toBe('new body');
		expect(c.items[0].editedAt).toBe('2026-09-07T14:00:00Z');
	});

	it('applyMessageEdited returns the same ref when the message is not present', () => {
		const c = seedFromApiPage([msg(7)], pageInfo());
		expect(applyMessageEdited(c, msg(99, { body: 'x' }))).toBe(c);
	});

	it('applyMessageDeleted tombstones in place (keeps seq, blanks body, sets deletedAt)', () => {
		let c = seedFromApiPage([msg(7), msg(8)], pageInfo());
		c = applyMessageDeleted(c, { messageId: 'm7', seq: 7 }, '2026-09-07T15:00:00Z');
		expect(c.items.map((m) => m.seq)).toEqual([7, 8]);
		expect(c.items[0]).toMatchObject({ body: '', deletedAt: '2026-09-07T15:00:00Z' });
	});

	it('applyMessageDeleted matches on seq when the id is unknown', () => {
		let c = seedFromApiPage([msg(7)], pageInfo());
		c = applyMessageDeleted(c, { seq: 7 });
		expect(c.items[0].body).toBe('');
		expect(c.items[0].deletedAt).not.toBeNull();
	});

	it('applyMessageDeleted returns the same ref when the row is absent or already tombstoned', () => {
		const c = seedFromApiPage([msg(7)], pageInfo());
		expect(applyMessageDeleted(c, { messageId: 'no-such-id' })).toBe(c);
		const t = applyMessageDeleted(c, { seq: 7 });
		expect(applyMessageDeleted(t, { seq: 7 })).toBe(t);
	});
});
