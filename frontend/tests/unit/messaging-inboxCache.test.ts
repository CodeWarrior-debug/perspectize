import { describe, it, expect } from 'vitest';
import type { MessageThread, InboxEvent } from '$lib/queries/messaging';
import { applyInboxEvent, totalUnread } from '$lib/messaging/inboxCache';

const t = (id: string, lastMessageAt: string, unreadCount = 0, latestSeq = 0): MessageThread => ({
	id,
	title: null,
	participants: [],
	lastMessageAt,
	latestSeq,
	myLastReadSeq: 0,
	unreadCount,
	muted: false,
	createdAt: 'x',
});

const evt = (over: Partial<InboxEvent> = {}): InboxEvent => ({
	threadId: 'b',
	lastMessageAt: '2026-09-07T15:00:00Z',
	latestSeq: 12,
	unreadCount: 4,
	...over,
});

describe('inboxCache', () => {
	it('updates the matching thread and re-sorts newest-first', () => {
		const list = [t('a', '2026-09-07T14:00:00Z'), t('b', '2026-09-07T10:00:00Z')];
		const next = applyInboxEvent(list, evt());
		expect(next.map((x) => x.id)).toEqual(['b', 'a']);
		expect(next[0]).toMatchObject({ latestSeq: 12, unreadCount: 4, lastMessageAt: '2026-09-07T15:00:00Z' });
	});

	it('returns the same reference when the thread is not present', () => {
		const list = [t('a', '2026-09-07T14:00:00Z')];
		expect(applyInboxEvent(list, evt({ threadId: 'zzz' }))).toBe(list);
	});

	it('returns the same reference when nothing actually changes', () => {
		const list = [t('b', '2026-09-07T15:00:00Z', 4, 12)];
		expect(applyInboxEvent(list, evt())).toBe(list);
	});

	it('totalUnread sums unreadCount', () => {
		expect(totalUnread([t('a', 'x', 2), t('b', 'y', 3)])).toBe(5);
	});
});
