import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import MessageBubble from '$lib/components/messaging/MessageBubble.svelte';

const base = {
	id: 'm1', threadId: 't1', seq: 5, body: 'hello world',
	createdAt: '2026-09-07T13:05:00Z', sender: { id: 'u2', username: 'alice' },
	editedAt: null, deletedAt: null,
};

describe('MessageBubble', () => {
	it('shows the body and sender name for an incoming message with showSender', () => {
		render(MessageBubble, { props: { message: base, mine: false, showSender: true } });
		const el = screen.getByTestId('message');
		expect(el).toHaveTextContent('hello world');
		expect(el).toHaveTextContent('alice');
		expect(el.className).toContain('justify-start');
	});

	it('right-aligns my own message and hides the sender name', () => {
		render(MessageBubble, {
			props: { message: { ...base, sender: { id: 'u1', username: 'me' } }, mine: true, showSender: false },
		});
		const el = screen.getByTestId('message');
		expect(el.className).toContain('justify-end');
		expect(el).not.toHaveTextContent('me');
	});

	it('marks an optimistic message as sending…', () => {
		render(MessageBubble, {
			props: { message: { ...base, id: 'optimistic:n1' }, mine: true, showSender: false },
		});
		expect(screen.getByTestId('message')).toHaveTextContent('sending…');
	});
});
