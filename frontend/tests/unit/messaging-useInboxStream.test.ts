import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	mockSubscribe: vi.fn(),
	capturedHandlers: undefined as any,
	dispose: vi.fn(),
}));

vi.mock('$lib/messaging/ws-client.svelte', () => ({
	subscribeGraphql: (payload: any, handlers: any) => {
		mocks.capturedHandlers = handlers;
		mocks.mockSubscribe(payload);
		return mocks.dispose;
	},
}));

import { createInboxStream } from '$lib/messaging/useInboxStream.svelte';
import { INBOX_EVENTS_SUBSCRIPTION } from '$lib/queries/messaging';
import { queryKeys } from '$lib/queries/keys';

function fakeQueryClient(initialList: any) {
	let data = initialList;
	return {
		setQueryData: vi.fn((_key: unknown, updater: any) => {
			data = typeof updater === 'function' ? updater(data) : updater;
			return data;
		}),
		invalidateQueries: vi.fn(),
		getQueryData: () => data,
		__get: () => data,
	};
}

const thread = (id: string, at: string, unread = 0) => ({
	id,
	title: null,
	participants: [],
	lastMessageAt: at,
	latestSeq: 0,
	myLastReadSeq: 0,
	unreadCount: unread,
	createdAt: 'x',
});

describe('createInboxStream', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.capturedHandlers = undefined;
	});

	it('start() opens exactly one inboxEvents subscription and is idempotent', () => {
		const qc = fakeQueryClient({ messageThreads: [] });
		const s = createInboxStream(qc as any);
		s.start();
		s.start();
		expect(mocks.mockSubscribe).toHaveBeenCalledTimes(1);
		expect(mocks.mockSubscribe).toHaveBeenCalledWith({ query: INBOX_EVENTS_SUBSCRIPTION });
	});

	it('folds an inbox event into the thread list cache', () => {
		const qc = fakeQueryClient({
			messageThreads: [thread('a', '2026-09-07T10:00:00Z'), thread('b', '2026-09-07T09:00:00Z')],
		});
		const s = createInboxStream(qc as any);
		s.start();
		mocks.capturedHandlers.next({
			inboxEvents: { threadId: 'b', lastMessageAt: '2026-09-07T12:00:00Z', latestSeq: 4, unreadCount: 2 },
		});
		expect(qc.setQueryData).toHaveBeenCalledWith(queryKeys.messaging.threads.list(), expect.any(Function));
		expect(qc.__get().messageThreads.map((t: any) => t.id)).toEqual(['b', 'a']);
		expect(qc.__get().messageThreads[0].unreadCount).toBe(2);
	});

	it('invalidates the list when the event is for an unknown thread', () => {
		const qc = fakeQueryClient({ messageThreads: [thread('a', '2026-09-07T10:00:00Z')] });
		const s = createInboxStream(qc as any);
		s.start();
		mocks.capturedHandlers.next({
			inboxEvents: { threadId: 'new', lastMessageAt: 'x', latestSeq: 1, unreadCount: 1 },
		});
		expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.messaging.threads.lists() });
	});

	it('stop() disposes and allows a later restart', () => {
		const qc = fakeQueryClient({ messageThreads: [] });
		const s = createInboxStream(qc as any);
		s.start();
		s.stop();
		expect(mocks.dispose).toHaveBeenCalledTimes(1);
		s.start();
		expect(mocks.mockSubscribe).toHaveBeenCalledTimes(2);
	});
});
