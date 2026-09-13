import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ThreadListItem from '$lib/components/messaging/ThreadListItem.svelte';

const thread = (over = {}) => ({
	id: 't1', title: null,
	participants: [
		{ user: { id: 'u1', username: 'me' }, role: 'OWNER' as const, lastReadSeq: 0, joinedAt: 'x' },
		{ user: { id: 'u2', username: 'alice' }, role: 'MEMBER' as const, lastReadSeq: 0, joinedAt: 'x' },
	],
	lastMessageAt: '2026-09-07T12:00:00Z',
	latestSeq: 3, myLastReadSeq: 3, unreadCount: 0, muted: false, createdAt: 'x',
	...over,
});

describe('ThreadListItem', () => {
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
});
