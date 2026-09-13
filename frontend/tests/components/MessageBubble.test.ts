import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import MessageBubble from '$lib/components/messaging/MessageBubble.svelte';

const base = {
	id: 'm1', threadId: 't1', seq: 5, body: 'hello world',
	createdAt: '2026-09-07T13:05:00Z', sender: { id: 'u2', username: 'alice' },
	editedAt: null, deletedAt: null,
};

const me = { id: 'u1', username: 'me' };

describe('MessageBubble', () => {
	it('shows the body and sender name for an incoming message with showSender', () => {
		render(MessageBubble, {
			props: {
				message: base,
				mine: false,
				showSender: true,
				currentUser: me,
				onEdit: vi.fn(),
				onDelete: vi.fn(),
			},
		});
		const el = screen.getByTestId('message');
		expect(el).toHaveTextContent('hello world');
		expect(el).toHaveTextContent('alice');
		expect(el.className).toContain('justify-start');
	});

	it('right-aligns my own message and hides the sender name', () => {
		render(MessageBubble, {
			props: {
				message: { ...base, sender: me },
				mine: true,
				showSender: false,
				currentUser: me,
				onEdit: vi.fn(),
				onDelete: vi.fn(),
			},
		});
		const el = screen.getByTestId('message');
		expect(el.className).toContain('justify-end');
		expect(el).not.toHaveTextContent('me');
	});

	it('marks an optimistic message as sending…', () => {
		render(MessageBubble, {
			props: {
				message: { ...base, id: 'optimistic:n1', sender: me },
				mine: true,
				showSender: false,
				currentUser: me,
				onEdit: vi.fn(),
				onDelete: vi.fn(),
			},
		});
		expect(screen.getByTestId('message')).toHaveTextContent('sending…');
	});

	it('shows edit and delete buttons on hover for own messages', () => {
		render(MessageBubble, {
			props: {
				message: { ...base, sender: me },
				mine: true,
				showSender: false,
				currentUser: me,
				onEdit: vi.fn(),
				onDelete: vi.fn(),
			},
		});
		expect(screen.getByLabelText('Edit message')).toBeInTheDocument();
		expect(screen.getByLabelText('Delete message')).toBeInTheDocument();
	});

	it("does not show edit/delete for another user's message", () => {
		render(MessageBubble, {
			props: {
				message: base,
				mine: false,
				showSender: false,
				currentUser: me,
				onEdit: vi.fn(),
				onDelete: vi.fn(),
			},
		});
		expect(screen.queryByLabelText('Edit message')).not.toBeInTheDocument();
		expect(screen.queryByLabelText('Delete message')).not.toBeInTheDocument();
	});

	it('enters edit mode on pencil click and calls onEdit on confirm', async () => {
		const onEdit = vi.fn();
		render(MessageBubble, {
			props: {
				message: { ...base, sender: me, body: 'old body' },
				mine: true,
				showSender: false,
				currentUser: me,
				onEdit,
				onDelete: vi.fn(),
			},
		});
		await fireEvent.click(screen.getByLabelText('Edit message'));
		const textarea = screen.getByLabelText('Edit message');
		await fireEvent.input(textarea, { target: { value: 'new body' } });
		await fireEvent.click(screen.getByLabelText('Confirm edit'));
		expect(onEdit).toHaveBeenCalledWith('m1', 't1', 'new body', 'old body');
	});

	it('shows (edited) label when editedAt is set', () => {
		render(MessageBubble, {
			props: {
				message: { ...base, sender: me, body: 'changed', editedAt: '2026-09-07T14:00:00Z' },
				mine: true,
				showSender: false,
				currentUser: me,
				onEdit: vi.fn(),
				onDelete: vi.fn(),
			},
		});
		expect(screen.getByText('(edited)')).toBeInTheDocument();
	});

	it('calls onDelete and shows a toast when delete is clicked', async () => {
		const onDelete = vi.fn();
		render(MessageBubble, {
			props: {
				message: { ...base, sender: me },
				mine: true,
				showSender: false,
				currentUser: me,
				onEdit: vi.fn(),
				onDelete,
			},
		});
		await fireEvent.click(screen.getByLabelText('Delete message'));
		expect(onDelete).toHaveBeenCalledWith('m1', 't1');
	});

	it('renders a tombstone and no actions for a deleted message', () => {
		render(MessageBubble, {
			props: {
				message: { ...base, sender: me, body: '', deletedAt: '2026-09-07T15:00:00Z' },
				mine: true,
				showSender: false,
				currentUser: me,
				onEdit: vi.fn(),
				onDelete: vi.fn(),
			},
		});
		expect(screen.getByText('message deleted')).toBeInTheDocument();
		expect(screen.queryByLabelText('Edit message')).not.toBeInTheDocument();
		expect(screen.queryByText('(edited)')).not.toBeInTheDocument();
	});

	it('renders a tombstone for another user\'s deleted message with no actions', () => {
		render(MessageBubble, {
			props: {
				message: { ...base, body: '', deletedAt: '2026-09-07T15:00:00Z' },
				mine: false,
				showSender: false,
				currentUser: me,
				onEdit: vi.fn(),
				onDelete: vi.fn(),
			},
		});
		expect(screen.getByText('message deleted')).toBeInTheDocument();
		expect(screen.queryByLabelText('Edit message')).not.toBeInTheDocument();
	});
});
