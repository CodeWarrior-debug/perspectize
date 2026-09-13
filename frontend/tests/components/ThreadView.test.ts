import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';

const mocks = vi.hoisted(() => ({
	sendMutate: vi.fn(),
	setTypingMutate: vi.fn(),
	markReadMutate: vi.fn(),
	start: vi.fn(),
	stop: vi.fn(),
	messagesData: {
		items: [
			{ id: 'm1', threadId: 't1', seq: 1, body: 'hi', createdAt: 'x', sender: { id: 'u2', username: 'alice' } },
			{ id: 'm2', threadId: 't1', seq: 2, body: 'yo', createdAt: 'x', sender: { id: 'u1', username: 'me' } },
		],
		oldestLoadedSeq: 1,
		hasMoreOlder: false,
	},
	threadData: {
		messageThread: {
			id: 't1',
			title: null,
			participants: [
				{ user: { id: 'u1', username: 'me' }, role: 'OWNER', lastReadSeq: 2, joinedAt: 'x' },
				{ user: { id: 'u2', username: 'alice' }, role: 'MEMBER', lastReadSeq: 2, joinedAt: 'x' },
			],
			lastMessageAt: 'x',
			latestSeq: 2,
			myLastReadSeq: 2,
			unreadCount: 0,
			createdAt: 'x',
		},
	},
}));

vi.mock('@tanstack/svelte-query', () => ({
	createQuery: vi.fn(() => ({ data: mocks.threadData.messageThread, isLoading: false })),
	createMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useQueryClient: vi.fn(() => ({ setQueryData: vi.fn(), getQueryData: vi.fn(), invalidateQueries: vi.fn() })),
}));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: vi.fn() }));
vi.mock('$lib/queries/hooks/useMe.svelte', () => ({
	useMe: () => ({ me: { id: 'u1', username: 'me' }, isSettled: true }),
}));
vi.mock('$lib/queries/hooks/useThreadMessages.svelte', () => ({
	useThreadMessages: () => ({
		get query() {
			return { data: mocks.messagesData, isLoading: false };
		},
		get isFetchingOlder() {
			return false;
		},
		fetchOlder: vi.fn(),
	}),
}));
vi.mock('$lib/queries/hooks/useSendMessage', () => ({ useSendMessage: () => ({ mutate: mocks.sendMutate }) }));
vi.mock('$lib/queries/hooks/useSetTyping', () => ({ useSetTyping: () => ({ mutate: mocks.setTypingMutate }) }));
vi.mock('$lib/queries/hooks/useMarkThreadRead', () => ({
	useMarkThreadRead: () => ({ mutate: mocks.markReadMutate }),
}));
vi.mock('$lib/messaging/useThreadStream.svelte', () => ({
	createThreadStream: () => ({
		get typingUserIds() {
			return [];
		},
		get presence() {
			return {};
		},
		start: mocks.start,
		stop: mocks.stop,
	}),
}));

import ThreadView from '$lib/components/messaging/ThreadView.svelte';

describe('ThreadView', () => {
	beforeEach(() => vi.clearAllMocks());

	it('renders a bubble per message and starts the stream', () => {
		render(ThreadView, { props: { threadId: 't1', onEditMessage: vi.fn(), onDeleteMessage: vi.fn() } });
		expect(screen.getAllByTestId('message')).toHaveLength(2);
		expect(mocks.start).toHaveBeenCalled();
	});

	it('composer send routes to the send hook with the thread id and last seq', async () => {
		render(ThreadView, { props: { threadId: 't1', onEditMessage: vi.fn(), onDeleteMessage: vi.fn() } });
		await fireEvent.input(screen.getByTestId('composer-input'), { target: { value: 'hello' } });
		await fireEvent.click(screen.getByTestId('composer-send'));
		expect(mocks.sendMutate).toHaveBeenCalledWith(
			expect.objectContaining({ threadId: 't1', body: 'hello', afterSeq: 2 }),
		);
	});
});
