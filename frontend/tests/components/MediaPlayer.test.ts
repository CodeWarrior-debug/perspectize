import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import MediaPlayer from '$lib/components/MediaPlayer.svelte';
import { EMBED_ORIGIN } from '$lib/utils/mediaPlayer';

function embedError(code: number, origin = EMBED_ORIGIN) {
	const frame = document.querySelector('iframe')!;
	window.dispatchEvent(
		new MessageEvent('message', {
			data: JSON.stringify({ event: 'onError', info: code }),
			origin,
			source: frame.contentWindow,
		}),
	);
}

const props = { title: 'Bohemian Rhapsody', fallbackUrl: 'https://music.youtube.com/watch?v=AAAAAAAAAAA' };

describe('MediaPlayer', () => {
	it('embeds the first video on the privacy-enhanced domain', () => {
		render(MediaPlayer, { props: { ...props, queue: ['AAAAAAAAAAA', 'BBBBBBBBBBB'] } });
		const src = document.querySelector('iframe')!.getAttribute('src')!;
		expect(src.startsWith(`${EMBED_ORIGIN}/embed/AAAAAAAAAAA?`)).toBe(true);
		expect(document.querySelector('iframe')).toHaveAttribute('title', 'Bohemian Rhapsody');
	});

	it('moves to the next upload when embedding is blocked, and reports it', async () => {
		const onUnplayable = vi.fn();
		render(MediaPlayer, { props: { ...props, queue: ['AAAAAAAAAAA', 'BBBBBBBBBBB'], onUnplayable } });
		embedError(150);
		await tick();
		expect(onUnplayable).toHaveBeenCalledWith('AAAAAAAAAAA', 150);
		expect(document.querySelector('iframe')!.getAttribute('src')).toContain('/embed/BBBBBBBBBBB?');
		expect(screen.getByText(/another upload of the same song/)).toBeInTheDocument();
	});

	it('ignores messages from other origins and non-blocking errors', async () => {
		const onUnplayable = vi.fn();
		render(MediaPlayer, { props: { ...props, queue: ['AAAAAAAAAAA', 'BBBBBBBBBBB'], onUnplayable } });
		embedError(150, 'https://evil.example');
		embedError(5);
		await tick();
		expect(onUnplayable).not.toHaveBeenCalled();
		expect(document.querySelector('iframe')!.getAttribute('src')).toContain('/embed/AAAAAAAAAAA?');
	});

	it('falls back to a labelled link when nothing can play', async () => {
		render(MediaPlayer, { props: { ...props, queue: ['AAAAAAAAAAA'] } });
		embedError(101);
		await tick();
		expect(document.querySelector('iframe')).toBeNull();
		expect(screen.getByText("This song can't be played inside Perspectize.")).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Open in YouTube Music' })).toHaveAttribute('href', props.fallbackUrl);
	});

	it('shows the fallback immediately for an empty queue', () => {
		render(MediaPlayer, { props: { ...props, queue: [] } });
		expect(screen.getByRole('link', { name: 'Open in YouTube Music' })).toBeInTheDocument();
	});
});

function embedEvent(payload: object, frame = document.querySelector('iframe')!) {
	window.dispatchEvent(
		new MessageEvent('message', { data: JSON.stringify(payload), origin: EMBED_ORIGIN, source: frame.contentWindow }),
	);
}

describe('MediaPlayer safeguards', () => {
	it('153 marks nothing, keeps the upload and explains the setup problem', async () => {
		const onUnplayable = vi.fn();
		render(MediaPlayer, { props: { ...props, queue: ['AAAAAAAAAAA', 'BBBBBBBBBBB'], onUnplayable } });
		embedError(153);
		await tick();
		expect(onUnplayable).not.toHaveBeenCalled();
		expect(document.querySelector('iframe')!.getAttribute('src')).toContain('/embed/AAAAAAAAAAA?');
		expect(screen.getByRole('status')).toHaveTextContent(/error 153/);
	});

	it('100 moves to the next upload without marking anything', async () => {
		const onUnplayable = vi.fn();
		render(MediaPlayer, { props: { ...props, queue: ['AAAAAAAAAAA', 'BBBBBBBBBBB'], onUnplayable } });
		embedError(100);
		await tick();
		expect(onUnplayable).not.toHaveBeenCalled();
		expect(document.querySelector('iframe')!.getAttribute('src')).toContain('/embed/BBBBBBBBBBB?');
	});

	it('the end of a song never advances to anything else', async () => {
		render(MediaPlayer, { props: { ...props, queue: ['AAAAAAAAAAA', 'BBBBBBBBBBB'] } });
		embedEvent({ event: 'onStateChange', info: 0 });
		await tick();
		expect(document.querySelector('iframe')!.getAttribute('src')).toContain('/embed/AAAAAAAAAAA?');
		expect(document.querySelector('iframe')!.getAttribute('src')).toContain('autoplay=0');
	});

	it('starting a second player pauses the first', async () => {
		render(MediaPlayer, { props: { ...props, queue: ['AAAAAAAAAAA'] } });
		render(MediaPlayer, { props: { ...props, queue: ['BBBBBBBBBBB'] } });
		const [first, second] = [...document.querySelectorAll('iframe')];
		const pauseFirst = vi.spyOn(first.contentWindow!, 'postMessage');
		embedEvent({ event: 'onStateChange', info: 1 }, first);
		await tick();
		pauseFirst.mockClear();
		embedEvent({ event: 'onStateChange', info: 1 }, second);
		await tick();
		expect(pauseFirst).toHaveBeenCalledWith(
			JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
			EMBED_ORIGIN,
		);
		const players = document.querySelectorAll('[data-testid="media-player"]');
		expect(players[0].getAttribute('data-state')).toBe('paused');
		expect(players[1].getAttribute('data-state')).toBe('playing');
	});
});
