import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';

const mocks = vi.hoisted(() => ({
	mutate: vi.fn(),
}));

vi.mock('@tanstack/svelte-query', () => ({
	createMutation: vi.fn(() => ({ mutate: mocks.mutate, isPending: false })),
	useQueryClient: vi.fn(() => ({
		setQueryData: vi.fn(),
		invalidateQueries: vi.fn(),
	})),
}));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: vi.fn() }));
vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import ThreadListItem from '$lib/components/messaging/ThreadListItem.svelte';

const thread = (over = {}) => ({
	id: 't1',
	title: null,
	participants: [
		{ user: { id: 'u1', username: 'me' }, role: 'OWNER' as const, lastReadSeq: 0, joinedAt: 'x' },
		{ user: { id: 'u2', username: 'alice' }, role: 'MEMBER' as const, lastReadSeq: 0, joinedAt: 'x' },
	],
	lastMessageAt: '2026-09-07T12:00:00Z',
	latestSeq: 3,
	myLastReadSeq: 3,
	unreadCount: 0,
	muted: false,
	createdAt: 'x',
	...over,
});

describe('ThreadListItem', () => {
	beforeEach(() => vi.clearAllMocks());

	it('links to the thread and shows the derived title', () => {
		render(ThreadListItem, { props: { thread: thread(), myUserId: 'u1', active: false } });
		const el = screen.getByTestId('thread-item');
		expect(el).toHaveAttribute('href', '/messages/t1');
		expect(el).toHaveTextContent('alice');
	});

	it('shows an unread badge only when unreadCount > 0', () => {
		const { rerender } = render(ThreadListItem, {
			props: { thread: thread({ unreadCount: 0 }), myUserId: 'u1', active: false },
		});
		expect(screen.queryByTestId('unread')).toBeNull();
		rerender({ thread: thread({ unreadCount: 4 }), myUserId: 'u1', active: false });
		expect(screen.getByTestId('unread')).toHaveTextContent('4');
	});

	it('marks the active row with aria-current', () => {
		render(ThreadListItem, { props: { thread: thread(), myUserId: 'u1', active: true } });
		expect(screen.getByTestId('thread-item')).toHaveAttribute('aria-current', 'page');
	});

	it('renders a muted indicator when thread.muted is true', () => {
		render(ThreadListItem, {
			props: { thread: thread({ muted: true }), myUserId: 'u1', active: false },
		});
		expect(screen.getByLabelText('Muted')).toBeInTheDocument();
	});

	it('does not render a muted indicator when thread.muted is false', () => {
		render(ThreadListItem, {
			props: { thread: thread({ muted: false }), myUserId: 'u1', active: false },
		});
		expect(screen.queryByLabelText('Muted')).not.toBeInTheDocument();
	});

	it('shows a mute toggle button reflecting the current muted state', () => {
		render(ThreadListItem, {
			props: { thread: thread({ muted: false }), myUserId: 'u1', active: false },
		});
		expect(screen.getByLabelText('Mute thread')).toBeInTheDocument();

		render(ThreadListItem, {
			props: { thread: thread({ muted: true }), myUserId: 'u1', active: false },
		});
		expect(screen.getByLabelText('Unmute thread')).toBeInTheDocument();
	});

	it('clicking the mute toggle calls the mutation to mute an unmuted thread', async () => {
		render(ThreadListItem, {
			props: { thread: thread({ muted: false }), myUserId: 'u1', active: false },
		});
		await fireEvent.click(screen.getByLabelText('Mute thread'));
		expect(mocks.mutate).toHaveBeenCalledWith({ threadId: 't1', muted: true });
	});

	it('clicking the mute toggle calls the mutation to unmute a muted thread', async () => {
		render(ThreadListItem, {
			props: { thread: thread({ muted: true }), myUserId: 'u1', active: false },
		});
		await fireEvent.click(screen.getByLabelText('Unmute thread'));
		expect(mocks.mutate).toHaveBeenCalledWith({ threadId: 't1', muted: false });
	});

	it('renders the mute button as a sibling of the thread link, not nested inside it', () => {
		render(ThreadListItem, {
			props: { thread: thread({ muted: false }), myUserId: 'u1', active: false },
		});
		const link = screen.getByTestId('thread-item');
		const button = screen.getByLabelText('Mute thread');
		expect(link.contains(button)).toBe(false);
		expect(button.contains(link)).toBe(false);
	});
});
