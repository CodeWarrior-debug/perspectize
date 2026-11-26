import { describe, it, expect } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';
import type {
	Message,
	MessageThread,
	MessagePageInfo,
	ListMessageThreadsResponse,
} from '#lib/queries/messaging/index.js';
import { queryKeys } from '#lib/queries/keys.js';
import {
	applyThreadEvent,
	applyMessageResult,
	applyThreadResult,
	applyInboxEvent,
} from '#lib/messaging/messagingCache.js';
import { seedFromApiPage, type ThreadMessagesCache } from '#lib/messaging/threadCache.js';

const ME = { id: 'u1', username: 'me' };
const BOB = { id: 'u2', username: 'bob' };

const msg = (seq: number, over: Partial<Message> = {}): Message => ({
	id: `m${seq}`,
	threadId: 't1',
	sender: BOB,
	seq,
	body: `body ${seq}`,
	createdAt: '2026-11-25T12:00:00Z',
	editedAt: null,
	deletedAt: null,
	...over,
});

const thread = (over: Partial<MessageThread> = {}): MessageThread => ({
	id: 't1',
	title: null,
	participants: [
		{ user: ME, role: 'OWNER', lastReadSeq: 5, joinedAt: 'x' },
		{ user: BOB, role: 'MEMBER', lastReadSeq: 5, joinedAt: 'x' },
	],
	lastMessageAt: '2026-11-25T12:00:00Z',
	latestSeq: 5,
	myLastReadSeq: 5,
	unreadCount: 0,
	muted: false,
	createdAt: 'x',
	...over,
});

const pageInfo: MessagePageInfo = {
	hasNextPage: false,
	hasPreviousPage: false,
	startCursor: null,
	endCursor: null,
};

function seed(qc: QueryClient, messages: Message[], t: MessageThread = thread()) {
	qc.setQueryData<ThreadMessagesCache>(
		queryKeys.messaging.messages.list('t1'),
		seedFromApiPage(messages, pageInfo),
	);
	qc.setQueryData(queryKeys.messaging.threads.detail('t1'), t);
	qc.setQueryData<ListMessageThreadsResponse>(queryKeys.messaging.threads.list(), {
		messageThreads: [t],
	});
}

const detail = (qc: QueryClient) => qc.getQueryData<MessageThread>(queryKeys.messaging.threads.detail('t1'))!;
const items = (qc: QueryClient) =>
	qc.getQueryData<ThreadMessagesCache>(queryKeys.messaging.messages.list('t1'))!.items;
const posted = (message: Message) => ({ __typename: 'MessagePosted' as const, message });

describe('messagingCache — send, edit, delete, read', () => {
	it('keeps messages, thread summary and read state consistent across one exchange', () => {
		const qc = new QueryClient();
		seed(qc, [msg(5)]);
		// optimistic row for my send, as useSendMessage.onMutate adds it
		qc.setQueryData<ThreadMessagesCache>(queryKeys.messaging.messages.list('t1'), (c) => ({
			...c!,
			items: [...c!.items, msg(5.5, { id: 'optimistic:n1', sender: ME, body: 'hi' })],
		}));

		applyMessageResult(qc, { kind: 'sent', message: msg(6, { sender: ME, body: 'hi' }), clientNonce: 'n1' });
		expect(items(qc).map((m) => m.id)).toEqual(['m5', 'm6']);
		expect(detail(qc).latestSeq).toBe(6);
		expect(detail(qc).unreadCount).toBe(0);

		applyMessageResult(qc, { kind: 'edited', message: msg(6, { sender: ME, body: 'edited', editedAt: 'e1' }) });
		expect(items(qc).find((m) => m.id === 'm6')).toMatchObject({ body: 'edited', editedAt: 'e1' });

		applyMessageResult(qc, {
			kind: 'deleted',
			message: msg(6, { sender: ME, body: '', deletedAt: 'd1' }),
		});
		expect(items(qc).find((m) => m.id === 'm6')).toMatchObject({ body: '', deletedAt: 'd1' });
		expect(detail(qc).latestSeq).toBe(6);
		expect(detail(qc).unreadCount).toBe(0);

		applyThreadResult(qc, thread({ latestSeq: 6, myLastReadSeq: 6, unreadCount: 0 }));
		expect(detail(qc).myLastReadSeq).toBe(6);
		expect(qc.getQueryData<ListMessageThreadsResponse>(queryKeys.messaging.threads.list())!.messageThreads[0].myLastReadSeq).toBe(6);
	});

	it('counts unread rows across a seq gap left by pruning', () => {
		const qc = new QueryClient();
		seed(qc, [msg(5)]);

		applyThreadEvent(qc, 't1', ME.id, posted(msg(9)));
		applyThreadEvent(qc, 't1', ME.id, posted(msg(10)));

		expect(detail(qc).latestSeq).toBe(10);
		expect(detail(qc).unreadCount).toBe(2);
	});

	it('counts another user message that arrives after my own later message', () => {
		const qc = new QueryClient();
		seed(qc, [msg(5)]);

		applyMessageResult(qc, { kind: 'sent', message: msg(7, { sender: ME }), clientNonce: 'n7' });
		applyThreadEvent(qc, 't1', ME.id, posted(msg(6)));

		expect(items(qc).map((m) => m.seq)).toEqual([5, 6, 7]);
		expect(detail(qc).latestSeq).toBe(7);
		expect(detail(qc).unreadCount).toBe(1);
	});

	it('does not count a repeated delivery of the same message twice', () => {
		const qc = new QueryClient();
		seed(qc, [msg(5)]);

		applyThreadEvent(qc, 't1', ME.id, posted(msg(6)));
		applyThreadEvent(qc, 't1', ME.id, posted(msg(6)));

		expect(items(qc).map((m) => m.seq)).toEqual([5, 6]);
		expect(detail(qc).unreadCount).toBe(1);
	});

	it('takes the server count from the inbox event and applies it to the list and the thread', () => {
		const qc = new QueryClient();
		seed(qc, [msg(5)]);

		const known = applyInboxEvent(qc, {
			threadId: 't1',
			lastMessageAt: '2026-11-25T13:00:00Z',
			latestSeq: 12,
			unreadCount: 4,
		});

		expect(known).toBe(false);
		expect(detail(qc)).toMatchObject({ latestSeq: 12, unreadCount: 4, lastMessageAt: '2026-11-25T13:00:00Z' });
		expect(qc.getQueryData<ListMessageThreadsResponse>(queryKeys.messaging.threads.list())!.messageThreads[0].unreadCount).toBe(4);
	});

	it('reports an inbox event for a thread that is not in the cached list', () => {
		const qc = new QueryClient();
		seed(qc, []);

		const missing = applyInboxEvent(qc, { threadId: 'other', lastMessageAt: 'x', latestSeq: 1, unreadCount: 1 });

		expect(missing).toBe(true);
	});

	it('does nothing and creates no entries when nothing is cached for stream events', () => {
		const qc = new QueryClient();

		applyThreadEvent(qc, 't1', ME.id, posted(msg(6)));
		applyMessageResult(qc, { kind: 'edited', message: msg(6, { body: 'x' }) });

		expect(qc.getQueryData(queryKeys.messaging.messages.list('t1'))).toBeUndefined();
		expect(qc.getQueryData(queryKeys.messaging.threads.detail('t1'))).toBeUndefined();
	});
});
