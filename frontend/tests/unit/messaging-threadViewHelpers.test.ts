import { describe, it, expect } from 'vitest';
import type { Message, MessageThread } from '$lib/queries/messaging';
import {
	showSenderForIndex,
	lastKnownSeq,
	typingUsernames,
	shouldMarkRead,
} from '$lib/components/messaging/threadView.helpers';

const m = (seq: number, senderId: string, id = `m${seq}`): Message => ({
	id,
	threadId: 't1',
	seq,
	body: 'x',
	createdAt: 'x',
	editedAt: null,
	deletedAt: null,
	sender: { id: senderId, username: senderId },
});

const thread = (over: Partial<MessageThread> = {}): MessageThread => ({
	id: 't1',
	title: null,
	participants: [
		{ user: { id: 'u2', username: 'alice' }, role: 'MEMBER', lastReadSeq: 0, joinedAt: 'x' },
	],
	lastMessageAt: 'x',
	latestSeq: 5,
	myLastReadSeq: 5,
	unreadCount: 0,
	muted: false,
	createdAt: 'x',
	...over,
});

describe('threadView.helpers', () => {
	it('showSenderForIndex is true at 0 and on a sender change', () => {
		const items = [m(1, 'u2'), m(2, 'u2'), m(3, 'u1')];
		expect(showSenderForIndex(items, 0)).toBe(true);
		expect(showSenderForIndex(items, 1)).toBe(false);
		expect(showSenderForIndex(items, 2)).toBe(true);
	});

	it('lastKnownSeq ignores optimistic/fractional rows', () => {
		const items = [m(7, 'u1'), { ...m(0, 'u1', 'optimistic:n1'), seq: 7.5 }];
		expect(lastKnownSeq(items)).toBe(7);
		expect(lastKnownSeq([])).toBe(0);
	});

	it('typingUsernames maps known ids and drops unknowns', () => {
		expect(typingUsernames(thread(), ['u2', 'u9'])).toEqual(['alice']);
		expect(typingUsernames(null, ['u2'])).toEqual([]);
	});

	it('shouldMarkRead reflects unreadCount', () => {
		expect(shouldMarkRead(thread({ unreadCount: 0 }))).toBe(false);
		expect(shouldMarkRead(thread({ unreadCount: 2 }))).toBe(true);
		expect(shouldMarkRead(null)).toBe(false);
	});
});
