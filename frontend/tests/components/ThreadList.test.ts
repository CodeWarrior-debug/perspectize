import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ThreadList from '$lib/components/messaging/ThreadList.svelte';

const thread = (id: string) => ({
	id, title: `T ${id}`, participants: [],
	lastMessageAt: '2026-09-07T12:00:00Z',
	latestSeq: 1, myLastReadSeq: 1, unreadCount: 0, muted: false, createdAt: 'x',
});

describe('ThreadList', () => {
	it('shows an empty state when not loading and no threads', () => {
		render(ThreadList, {
			props: { threads: [], myUserId: 'u1', activeThreadId: null, loading: false, onNewThread: vi.fn() },
		});
		expect(screen.getByTestId('threads-empty')).toBeInTheDocument();
	});

	it('renders a row per thread and fires onNewThread', async () => {
		const onNewThread = vi.fn();
		render(ThreadList, {
			props: {
				threads: [thread('a'), thread('b')],
				myUserId: 'u1', activeThreadId: 'b', loading: false, onNewThread,
			},
		});
		expect(screen.getAllByTestId('thread-item')).toHaveLength(2);
		await fireEvent.click(screen.getByTestId('new-thread'));
		expect(onNewThread).toHaveBeenCalled();
	});
});
