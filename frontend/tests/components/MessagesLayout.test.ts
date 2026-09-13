import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';

const state = vi.hoisted(() => ({ params: {} as Record<string, string> }));

vi.mock('$app/state', () => ({ page: state }));
vi.mock('$lib/queries/users/useMe.svelte', () => ({
	useMe: () => ({ me: { id: 'u1', username: 'me' }, isSettled: true }),
}));
vi.mock('$lib/queries/messaging/useMessageThreads', () => ({
	useMessageThreads: () => ({ data: { messageThreads: [] }, isLoading: false }),
}));
vi.mock('$lib/components/messaging/NewThreadDialog.svelte', () => ({
	default: vi.fn(() => ({ $$: {}, $set: vi.fn(), $on: vi.fn(), $destroy: vi.fn() })),
}));

import MessagesLayout from '../../src/routes/messages/+layout.svelte';

function createChildrenSnippet() {
	return createRawSnippet(() => ({
		render: () => '<div></div>',
	}));
}

describe('messages layout', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		state.params = {};
	});

	it('renders the thread list column with a New button', () => {
		render(MessagesLayout, { props: { children: createChildrenSnippet() } });
		expect(screen.getByTestId('new-thread')).toBeInTheDocument();
		expect(screen.getByTestId('threads-empty')).toBeInTheDocument();
	});
});
