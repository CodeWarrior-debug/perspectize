import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import LyricsLinks from '$lib/components/LyricsLinks.svelte';

const base = {
	title: 'Bohemian Rhapsody',
	artist: 'Queen',
	youtubeMusicUrl: 'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
};

describe('LyricsLinks', () => {
	it('shows "Open lyrics" to the exact LRCLIB page when found', () => {
		render(LyricsLinks, {
			props: {
				...base,
				lyrics: { available: true, lrclibId: 36978827, hasSynced: true, checkedAt: '2026-09-27T12:00:00Z' },
			},
		});
		const link = screen.getByRole('link', { name: 'Open lyrics' });
		expect(link.getAttribute('href')).toBe('https://lrclib.net/tracks/36978827');
		expect(link.getAttribute('target')).toBe('_blank');
		expect(screen.queryByText(/search results page/)).not.toBeInTheDocument();
	});

	it('says nothing was found and warns that the search opens a results page', () => {
		render(LyricsLinks, {
			props: {
				...base,
				lyrics: { available: false, lrclibId: null, hasSynced: false, checkedAt: '2026-09-27T12:00:00Z' },
			},
		});
		expect(screen.getByTestId('lyrics-notice')).toHaveTextContent('No lyrics found for this song.');
		expect(screen.queryByRole('link', { name: 'Open lyrics' })).not.toBeInTheDocument();
		expect(screen.getByRole('link', { name: "Search LRCLIB for 'Bohemian Rhapsody' – Queen" })).toBeInTheDocument();
		expect(screen.getByText('Opens a search results page, not this song directly.')).toBeInTheDocument();
	});

	it('shows a checking state before the first result', () => {
		render(LyricsLinks, { props: { ...base, lyrics: null, checking: true } });
		expect(screen.getByText('Checking for lyrics…')).toBeInTheDocument();
	});

	it('always offers YouTube Music with the lyrics-tab hedge', () => {
		render(LyricsLinks, { props: { ...base, lyrics: null } });
		expect(screen.getByRole('link', { name: 'Open song in YouTube Music' })).toHaveAttribute(
			'href',
			base.youtubeMusicUrl,
		);
		expect(screen.getByText('Lyrics tab shown there if available.')).toBeInTheDocument();
	});
});
