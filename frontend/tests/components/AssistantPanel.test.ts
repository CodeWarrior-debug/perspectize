import { describe, it, expect, vi, type Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import AssistantPanel from '$lib/components/assistant/AssistantPanel.svelte';
import { mockPageState } from '../setup';
import { pageForPath } from '$lib/assistant/config';

type Reply = {
	status: 'idle' | 'responding' | 'done' | 'error';
	text: string;
	tool: string | null;
	citations: string[];
	error: string | null;
	refused: boolean;
	stopped: boolean;
	ask: Mock<(message: string, page: string) => void>;
	stop: Mock<() => void>;
};

function fakeReply(overrides: Partial<Reply> = {}): Reply {
	return {
		status: 'idle',
		text: '',
		tool: null,
		citations: [],
		error: null,
		refused: false,
		stopped: false,
		ask: vi.fn<(message: string, page: string) => void>(),
		stop: vi.fn<() => void>(),
		...overrides,
	};
}

async function openPanel(reply: Reply) {
	render(AssistantPanel, { props: { reply } });
	await fireEvent.click(screen.getByTestId('assistant-toggle'));
}

describe('AssistantPanel', () => {
	it('starts closed and never opens on its own', () => {
		render(AssistantPanel, { props: { reply: fakeReply() } });
		expect(screen.getByTestId('assistant-toggle')).toBeTruthy();
		expect(screen.queryByTestId('assistant-panel')).toBeNull();
	});

	it('asks with the current page slug', async () => {
		mockPageState.url = new URL('http://localhost/compare?contentId=3');
		const reply = fakeReply();
		await openPanel(reply);

		const box = screen.getByLabelText(/ask jeevesbot a question/i);
		await fireEvent.input(box, { target: { value: 'How do I compare?' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

		expect(reply.ask).toHaveBeenCalledWith('How do I compare?', 'compare');
		mockPageState.url = new URL('http://localhost');
	});

	it('shows Stop while responding, which cancels the reply', async () => {
		const reply = fakeReply({ status: 'responding', tool: 'read_guide' });
		await openPanel(reply);

		expect(screen.getByTestId('assistant-tool').textContent).toMatch(/reading the app guide/i);
		await fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
		expect(reply.stop).toHaveBeenCalledOnce();
	});

	it('renders the answer with citation chips and no images', async () => {
		const reply = fakeReply({
			status: 'done',
			text: 'Open **Compare** [compare.pick-two]. ![x](https://evil.example/leak)',
		});
		await openPanel(reply);

		const msg = screen.getByTestId('assistant-message');
		expect(msg.querySelector('[data-cite="compare.pick-two"]')).toBeTruthy();
		expect(msg.querySelector('img')).toBeNull();
	});

	it('announces state changes, not streamed tokens', async () => {
		const reply = fakeReply({ status: 'responding', text: 'partial answer…' });
		await openPanel(reply);
		const live = screen.getByTestId('assistant-live');
		expect(live.getAttribute('aria-live')).toBe('polite');
		expect(live.textContent).toBe('Jeevesbot is responding');
	});

	it('shows friendly errors as an alert', async () => {
		const reply = fakeReply({ status: 'error', error: 'Still answering your last question.' });
		await openPanel(reply);
		expect(screen.getByRole('alert').textContent).toMatch(/still answering/i);
	});

	it('closing stops any reply in progress', async () => {
		const reply = fakeReply({ status: 'responding' });
		await openPanel(reply);
		await fireEvent.click(screen.getByLabelText(/close jeevesbot/i));
		expect(reply.stop).toHaveBeenCalled();
		expect(screen.queryByTestId('assistant-panel')).toBeNull();
	});
});

describe('pageForPath', () => {
	it('maps routes to page slugs', () => {
		expect(pageForPath('/')).toBe('activity');
		expect(pageForPath('/compare')).toBe('compare');
		expect(pageForPath('/messages/12')).toBe('messages');
	});
});
