import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { goto } from '$app/navigation';
import MessageLink from '$lib/components/messaging/MessageLink.svelte';
import MessageBubble from '$lib/components/messaging/MessageBubble.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

const ORIGIN = 'https://app.example.com';
const INTERNAL = `${ORIGIN}/content/42?tab=x#top`;

function renderLink(href = INTERNAL) {
	return render(MessageLink, { props: { href, text: href, appOrigin: ORIGIN } });
}

let openSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	vi.mocked(goto).mockClear();
	openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
});
afterEach(() => openSpy.mockRestore());

describe('MessageLink', () => {
	it('external link opens in a new tab with noopener noreferrer and no popover', async () => {
		renderLink('https://other.com/x');
		const a = screen.getByRole('link');
		expect(a).toHaveAttribute('href', 'https://other.com/x');
		expect(a).toHaveAttribute('target', '_blank');
		expect(a).toHaveAttribute('rel', 'noopener noreferrer');
		await fireEvent.click(a);
		expect(screen.queryByText('Go there')).not.toBeInTheDocument();
	});

	it('internal link: popover is closed initially', () => {
		renderLink();
		expect(screen.getByRole('link')).toHaveAttribute('href', INTERNAL);
		expect(screen.queryByText('Go there')).not.toBeInTheDocument();
		expect(screen.queryByText('Open in new tab')).not.toBeInTheDocument();
	});

	it('internal link: click opens the popover with both focusable buttons', async () => {
		renderLink();
		await fireEvent.click(screen.getByRole('link'));
		const newTab = await screen.findByRole('button', { name: 'Open in new tab' });
		const go = screen.getByRole('button', { name: 'Go there' });
		expect(newTab.tagName).toBe('BUTTON');
		expect(go.tagName).toBe('BUTTON');
		expect(goto).not.toHaveBeenCalled();
	});

	it('internal link: the default navigation is prevented on plain click', async () => {
		renderLink();
		const notPrevented = await fireEvent.click(screen.getByRole('link'));
		expect(notPrevented).toBe(false);
	});

	it('choosing "Open in new tab" opens the href and closes the popover', async () => {
		renderLink();
		await fireEvent.click(screen.getByRole('link'));
		await fireEvent.click(await screen.findByRole('button', { name: 'Open in new tab' }));
		expect(openSpy).toHaveBeenCalledWith(INTERNAL, '_blank', 'noopener,noreferrer');
		expect(goto).not.toHaveBeenCalled();
		await waitFor(() => expect(screen.queryByText('Go there')).not.toBeInTheDocument());
	});

	it('choosing "Go there" calls goto with path+search+hash and closes the popover', async () => {
		renderLink();
		await fireEvent.click(screen.getByRole('link'));
		await fireEvent.click(await screen.findByRole('button', { name: 'Go there' }));
		expect(goto).toHaveBeenCalledWith('/content/42?tab=x#top');
		expect(openSpy).not.toHaveBeenCalled();
		await waitFor(() => expect(screen.queryByText('Go there')).not.toBeInTheDocument());
	});

	it('Escape dismisses the popover', async () => {
		renderLink();
		await fireEvent.click(screen.getByRole('link'));
		await screen.findByText('Go there');
		await fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
		await waitFor(() => expect(screen.queryByText('Go there')).not.toBeInTheDocument());
		expect(goto).not.toHaveBeenCalled();
	});

	it('click-away dismisses the popover', async () => {
		renderLink();
		await fireEvent.click(screen.getByRole('link'));
		await screen.findByText('Go there');
		// bits-ui debounces outside-interaction handling; let it settle after open.
		await new Promise((r) => setTimeout(r, 50));
		const outside = document.createElement('div');
		document.body.appendChild(outside);
		await fireEvent.pointerDown(outside, {
			button: 0,
			pointerType: 'mouse',
			clientX: 500,
			clientY: 500,
		});
		await waitFor(() => expect(screen.queryByText('Go there')).not.toBeInTheDocument());
		expect(goto).not.toHaveBeenCalled();
	});

	it.each([
		['metaKey', { metaKey: true }],
		['ctrlKey', { ctrlKey: true }],
		['shiftKey', { shiftKey: true }],
		['altKey', { altKey: true }],
		['middle button', { button: 1 }],
	])('modified click (%s) is not intercepted: no popover, default not prevented', async (_n, init) => {
		renderLink();
		const notPrevented = await fireEvent.click(screen.getByRole('link'), init);
		expect(notPrevented).toBe(true);
		expect(screen.queryByText('Go there')).not.toBeInTheDocument();
		expect(goto).not.toHaveBeenCalled();
	});
});

describe('MessageBubble link rendering', () => {
	const base = {
		id: 'm1',
		threadId: 't1',
		seq: 1,
		body: 'hello world',
		createdAt: '2026-09-07T13:05:00Z',
		sender: { id: 'u2', username: 'alice' },
		editedAt: null,
		deletedAt: null,
	};
	const props = (body: string) => ({
		message: { ...base, body },
		mine: false,
		showSender: false,
		currentUser: { id: 'u1', username: 'me' },
		onEdit: vi.fn(),
		onDelete: vi.fn(),
	});

	it('plain text renders no link', () => {
		render(MessageBubble, { props: props('just words, no url') });
		expect(screen.queryByRole('link')).not.toBeInTheDocument();
		expect(screen.getByTestId('message')).toHaveTextContent('just words, no url');
	});

	it('a pasted URL becomes a link and trailing punctuation stays outside it', () => {
		render(MessageBubble, { props: props('look https://other.com/a.') });
		const a = screen.getByRole('link');
		expect(a).toHaveAttribute('href', 'https://other.com/a');
		expect(a).toHaveTextContent('https://other.com/a');
		expect(screen.getByTestId('message')).toHaveTextContent('look https://other.com/a.');
	});

	it('does not render HTML from the body', () => {
		render(MessageBubble, { props: props('<b>x</b> https://other.com') });
		expect(screen.getByTestId('message').querySelector('b')).toBeNull();
	});
});
