import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	subscribeGraphql: vi.fn(),
	handlers: undefined as any,
	dispose: vi.fn(),
}));

vi.mock('$lib/messaging/ws-client.svelte', () => ({
	subscribeGraphql: (payload: any, handlers: any) => {
		mocks.subscribeGraphql(payload);
		mocks.handlers = handlers;
		return mocks.dispose;
	},
}));

import { createThreadStream } from '$lib/messaging/useThreadStream.svelte';
import { THREAD_EVENTS_SUBSCRIPTION } from '$lib/queries/messaging';
import { queryKeys } from '$lib/queries/keys';

function fakeQC(caches: Record<string, any>) {
	return {
		getQueryData: (key: any) => caches[JSON.stringify(key)],
		setQueryData: vi.fn((key: any, updater: any) => {
			const k = JSON.stringify(key);
			caches[k] = typeof updater === 'function' ? updater(caches[k]) : updater;
			return caches[k];
		}),
		invalidateQueries: vi.fn(),
	};
}

const msg = (seq: number, senderId = 'u2') => ({
	id: `m${seq}`,
	threadId: 't1',
	seq,
	body: `b${seq}`,
	createdAt: 'x',
	sender: { id: senderId, username: senderId },
});

let now = 1000;
const clockFn = () => now;

beforeEach(() => {
	vi.clearAllMocks();
	vi.useFakeTimers();
	now = 1000;
	mocks.handlers = undefined;
});
afterEach(() => vi.useRealTimers());

describe('createThreadStream', () => {
	it('start() subscribes with sinceSeq from the messages cache', () => {
		const caches: Record<string, any> = {
			[JSON.stringify(queryKeys.messaging.messages.list('t1'))]: {
				items: [msg(4), msg(7)],
				oldestLoadedSeq: 4,
				hasMoreOlder: false,
			},
		};
		const s = createThreadStream({
			queryClient: fakeQC(caches) as any,
			getThreadId: () => 't1',
			myUserId: 'u1',
			now: clockFn,
		});
		s.start();
		s.start();
		expect(mocks.subscribeGraphql).toHaveBeenCalledTimes(1);
		expect(mocks.subscribeGraphql).toHaveBeenCalledWith({
			query: THREAD_EVENTS_SUBSCRIPTION,
			variables: { threadId: 't1', sinceSeq: 7 },
		});
		s.stop();
	});

	it('MessagePosted folds into the message list and the thread summary', () => {
		const mKey = JSON.stringify(queryKeys.messaging.messages.list('t1'));
		const tKey = JSON.stringify(queryKeys.messaging.threads.detail('t1'));
		const caches: Record<string, any> = {
			[mKey]: { items: [msg(7)], oldestLoadedSeq: 7, hasMoreOlder: false },
			[tKey]: {
				id: 't1',
				title: null,
				participants: [],
				lastMessageAt: 'x',
				latestSeq: 7,
				myLastReadSeq: 7,
				unreadCount: 0,
				createdAt: 'x',
			},
		};
		const qc = fakeQC(caches);
		const s = createThreadStream({ queryClient: qc as any, getThreadId: () => 't1', myUserId: 'u1', now: clockFn });
		s.start();
		mocks.handlers.next({ threadEvents: { __typename: 'MessagePosted', message: msg(8) } });
		expect(caches[mKey].items.map((m: any) => m.seq)).toEqual([7, 8]);
		expect(caches[tKey].latestSeq).toBe(8);
		expect(caches[tKey].unreadCount).toBe(1);
		s.stop();
	});

	it('TypingChanged drives typingUserIds and excludes myUserId; prune clears it after TTL', () => {
		const s = createThreadStream({
			queryClient: fakeQC({}) as any,
			getThreadId: () => 't1',
			myUserId: 'u1',
			now: clockFn,
		});
		s.start();
		mocks.handlers.next({ threadEvents: { __typename: 'TypingChanged', threadId: 't1', userId: 'u2', typing: true } });
		mocks.handlers.next({ threadEvents: { __typename: 'TypingChanged', threadId: 't1', userId: 'u1', typing: true } });
		expect(s.typingUserIds).toEqual(['u2']);
		now = 9000;
		vi.advanceTimersByTime(3000);
		expect(s.typingUserIds).toEqual([]);
		s.stop();
	});

	it('PresenceChanged is exposed on presence', () => {
		const s = createThreadStream({
			queryClient: fakeQC({}) as any,
			getThreadId: () => 't1',
			myUserId: 'u1',
			now: clockFn,
		});
		s.start();
		mocks.handlers.next({
			threadEvents: { __typename: 'PresenceChanged', threadId: 't1', userId: 'u2', state: 'ONLINE' },
		});
		expect(s.presence.u2).toBe('ONLINE');
		s.stop();
	});

	it('StreamReset invalidates the message list and resubscribes', () => {
		const qc = fakeQC({
			[JSON.stringify(queryKeys.messaging.messages.list('t1'))]: {
				items: [msg(7)],
				oldestLoadedSeq: 7,
				hasMoreOlder: false,
			},
		});
		const s = createThreadStream({ queryClient: qc as any, getThreadId: () => 't1', myUserId: 'u1', now: clockFn });
		s.start();
		mocks.handlers.next({ threadEvents: { __typename: 'StreamReset', threadId: 't1' } });
		expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.messaging.messages.list('t1') });
		expect(mocks.dispose).toHaveBeenCalledTimes(1);
		expect(mocks.subscribeGraphql).toHaveBeenCalledTimes(2);
		s.stop();
	});

	it('stop() disposes and clears the prune interval', () => {
		const s = createThreadStream({
			queryClient: fakeQC({}) as any,
			getThreadId: () => 't1',
			myUserId: 'u1',
			now: clockFn,
		});
		s.start();
		s.stop();
		expect(mocks.dispose).toHaveBeenCalledTimes(1);
		// no further timers pending
		expect(vi.getTimerCount()).toBe(0);
	});

	it('MessageEdited replaces the body in the message cache; MessageDeleted tombstones it', () => {
		const mKey = JSON.stringify(queryKeys.messaging.messages.list('t1'));
		const caches: Record<string, any> = {
			[mKey]: {
				items: [{ ...msg(7), body: 'original', editedAt: null, deletedAt: null }],
				oldestLoadedSeq: 7,
				hasMoreOlder: false,
			},
		};
		const s = createThreadStream({
			queryClient: fakeQC(caches) as any,
			getThreadId: () => 't1',
			myUserId: 'u1',
			now: clockFn,
		});
		s.start();
		mocks.handlers.next({
			threadEvents: {
				__typename: 'MessageEdited',
				message: { ...msg(7), body: 'fixed', editedAt: '2026-09-07T15:00:00Z', deletedAt: null },
			},
		});
		expect(caches[mKey].items[0].body).toBe('fixed');
		mocks.handlers.next({ threadEvents: { __typename: 'MessageDeleted', threadId: 't1', messageId: 'm7', seq: 7 } });
		expect(caches[mKey].items[0]).toMatchObject({ body: '', deletedAt: expect.any(String) });
		expect(caches[mKey].items.map((m: any) => m.seq)).toEqual([7]);
		s.stop();
	});
});
