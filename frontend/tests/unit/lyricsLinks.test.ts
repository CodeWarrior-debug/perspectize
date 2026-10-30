import { describe, it, expect } from 'vitest';
import { lyricsLinks, lrclibSearchUrl, type LyricsAvailability } from '$lib/utils/lyricsLinks';

const ytm = 'https://music.youtube.com/watch?v=dQw4w9WgXcQ';
const found: LyricsAvailability = {
	available: true,
	lrclibId: 36978827,
	hasSynced: true,
	checkedAt: '2026-09-27T12:00:00Z',
};
const missing: LyricsAvailability = {
	available: false,
	lrclibId: null,
	hasSynced: false,
	checkedAt: '2026-09-27T12:00:00Z',
};
const base = { title: 'Bohemian Rhapsody', artist: 'Queen', youtubeMusicUrl: ytm };

describe('lyricsLinks', () => {
	it('found: "Open lyrics" goes to the LRCLIB page for this exact song', () => {
		const { links, notice } = lyricsLinks({ ...base, lyrics: found });
		expect(notice).toBeUndefined();
		expect(links[0]).toEqual({ kind: 'track', label: 'Open lyrics', href: 'https://lrclib.net/tracks/36978827' });
	});

	it('not found: says so, and the search link is labelled and warned', () => {
		const { links, notice } = lyricsLinks({ ...base, lyrics: missing });
		expect(notice).toBe('No lyrics found for this song.');
		expect(links[0].kind).toBe('search');
		expect(links[0].label).toBe("Search LRCLIB for 'Bohemian Rhapsody' – Queen");
		expect(links[0].helper).toBe('Opens a search results page, not this song directly.');
	});

	it('not yet checked: offers a warned search, never "Open lyrics"', () => {
		const { links, notice } = lyricsLinks({ ...base, lyrics: null });
		expect(notice).toBeUndefined();
		expect(links[0].label).toBe("Search lyrics for 'Bohemian Rhapsody' – Queen");
		expect(links[0].helper).toMatch(/search results page/);
	});

	it('always offers YouTube Music with a hedge about the lyrics tab', () => {
		for (const lyrics of [found, missing, null]) {
			const yt = lyricsLinks({ ...base, lyrics }).links.find((l) => l.kind === 'youtubeMusic');
			expect(yt).toEqual({
				kind: 'youtubeMusic',
				label: 'Open song in YouTube Music',
				href: ytm,
				helper: 'Lyrics tab shown there if available.',
			});
		}
	});

	it('"Open lyrics" never points at a search page', () => {
		for (const lyrics of [found, missing, null, { ...found, lrclibId: null }]) {
			for (const link of lyricsLinks({ ...base, lyrics }).links) {
				if (link.label === 'Open lyrics') expect(link.href).toMatch(/^https:\/\/lrclib\.net\/tracks\/\d+$/);
				if (link.href.includes('/search/')) {
					expect(link.label).not.toBe('Open lyrics');
					expect(link.helper).toBeTruthy();
				}
			}
		}
	});

	it('never builds an artist-only or title-only search', () => {
		expect(lyricsLinks({ ...base, artist: null, lyrics: missing }).links.some((l) => l.kind === 'search')).toBe(false);
		expect(lyricsLinks({ ...base, artist: '  ', lyrics: null }).links.some((l) => l.kind === 'search')).toBe(false);
		expect(lyricsLinks({ ...base, title: ' ', lyrics: null }).links.some((l) => l.kind === 'search')).toBe(false);
		const href = lyricsLinks({ ...base, lyrics: null }).links[0].href;
		expect(decodeURIComponent(href)).toContain('Bohemian Rhapsody Queen');
	});

	it('still says "no lyrics found" when a search is impossible', () => {
		const { links, notice } = lyricsLinks({ ...base, artist: null, lyrics: missing });
		expect(notice).toBe('No lyrics found for this song.');
		expect(links.map((l) => l.kind)).toEqual(['youtubeMusic']);
	});

	it('uses LRCLIB path-style search URLs', () => {
		expect(lrclibSearchUrl('Bohemian Rhapsody', 'Queen')).toBe('https://lrclib.net/search/Bohemian%20Rhapsody%20Queen');
	});
});
