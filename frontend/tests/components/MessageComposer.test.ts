import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import MessageComposer from '$lib/components/messaging/MessageComposer.svelte';

function setup() {
	const onSend = vi.fn();
	const onTypingChange = vi.fn();
	render(MessageComposer, { props: { onSend, onTypingChange } });
	const input = screen.getByTestId('composer-input') as HTMLTextAreaElement;
	return { onSend, onTypingChange, input };
}

describe('MessageComposer', () => {
	it('signals typing on input', async () => {
		const { onTypingChange, input } = setup();
		await fireEvent.input(input, { target: { value: 'h' } });
		expect(onTypingChange).toHaveBeenCalledWith(true);
	});

	it('sends on Enter with the trimmed value and clears the field', async () => {
		const { onSend, input } = setup();
		await fireEvent.input(input, { target: { value: '  hello  ' } });
		await fireEvent.keyDown(input, { key: 'Enter' });
		expect(onSend).toHaveBeenCalledWith('hello');
		expect(input.value).toBe('');
	});

	it('does not send on empty / whitespace', async () => {
		const { onSend, input } = setup();
		await fireEvent.input(input, { target: { value: '   ' } });
		await fireEvent.keyDown(input, { key: 'Enter' });
		expect(onSend).not.toHaveBeenCalled();
	});

	it('Shift+Enter does not send', async () => {
		const { onSend, input } = setup();
		await fireEvent.input(input, { target: { value: 'line' } });
		await fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
		expect(onSend).not.toHaveBeenCalled();
	});

	it('the send button sends too', async () => {
		const { onSend, input } = setup();
		await fireEvent.input(input, { target: { value: 'hi' } });
		await fireEvent.click(screen.getByTestId('composer-send'));
		expect(onSend).toHaveBeenCalledWith('hi');
	});
});
