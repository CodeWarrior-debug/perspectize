import { describe, expect, it } from 'vitest';
import { parseMusicLink, providerOfUrl } from '$lib/utils/audioLinks';

describe('parseMusicLink', () => {
	it.each([
		[
			'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc',
			'spotify',
			'4uLU6hMCjMI75M1A2tKUQC',
			'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
			'LISTEN',
			'',
		],
		[
			'https://open.spotify.com/intl-de/track/4uLU6hMCjMI75M1A2tKUQC',
			'spotify',
			'4uLU6hMCjMI75M1A2tKUQC',
			'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
			'LISTEN',
			'',
		],
		[
			'spotify:track:4uLU6hMCjMI75M1A2tKUQC',
			'spotify',
			'4uLU6hMCjMI75M1A2tKUQC',
			'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
			'LISTEN',
			'',
		],
		[
			'https://music.apple.com/us/song/bohemian-rhapsody/1440650711',
			'apple_music',
			'1440650711',
			'https://music.apple.com/us/song/1440650711',
			'LISTEN',
			'Bohemian Rhapsody',
		],
		[
			'https://music.apple.com/us/album/a-night-at-the-opera/1440650428?i=1440650711',
			'apple_music',
			'1440650711',
			'https://music.apple.com/us/song/1440650711',
			'LISTEN',
			'',
		],
		[
			'https://music.amazon.co.uk/albums/B07D5HXYZ1?trackAsin=B07D5J5QX3',
			'amazon_music',
			'B07D5J5QX3',
			'https://music.amazon.co.uk/tracks/B07D5J5QX3',
			'LISTEN',
			'',
		],
		[
			'https://music.youtube.com/watch?v=dQw4w9WgXcQ&si=x',
			'youtube',
			'dQw4w9WgXcQ',
			'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
			'EMBED',
			'',
		],
	])('%s', (input, provider, id, canonical, kind, title) => {
		const r = parseMusicLink(input);
		expect(r).toEqual({
			ok: true,
			link: { provider, providerTrackId: id, canonicalUrl: canonical, kind, suggestedTitle: title },
		});
	});

	it.each([
		'https://open.spotify.com/album/1GbtB4zTqAsyfZEsm1RZfx',
		'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
		'https://music.apple.com/us/album/a-night-at-the-opera/1440650428',
		'https://music.amazon.com/albums/B07D5HXYZ1',
		'https://music.youtube.com/playlist?list=OLAK5uy_x',
	])('collection: %s', (input) => {
		expect(parseMusicLink(input)).toEqual({ ok: false, reason: 'collection' });
	});

	it.each([
		'',
		'John 3:16',
		'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
		'https://soundcloud.com/a/b',
		'https://open.spotify.com/track/short',
	])('unsupported: %s', (input) => {
		expect(parseMusicLink(input)).toEqual({ ok: false, reason: 'unsupported' });
	});

	it('providerOfUrl reads the provider of a stored url', () => {
		expect(providerOfUrl('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC')).toBe('spotify');
		expect(providerOfUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
		expect(providerOfUrl(null)).toBeNull();
	});
});
