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
		expect(onUnplayable).toHaveBeenCalledWith('AAAAAAAAAAA');
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
