import { describe, expect, it, vi } from 'vitest';
import {
	addedTrackAction,
	audioTrackErrorMessage,
	promotableOfficialVideo,
} from '$lib/queries/content/useAddAudioTrack';

import { showTypeHref, typeFilterExcludes } from '$lib/utils/gridUrlState';

const official = {
	provider: 'youtube',
	videoId: 'V',
	kind: 'official_video',
	title: 'x',
	contentId: null,
	unavailable: false,
};

describe('promotableOfficialVideo', () => {
	it('offers an official video that is not already its own item', () => {
		const r = {
			content: { id: '1', relatedMedia: [official] } as never,
			alreadyExisted: false,
			sameSongCandidates: [],
		};
		expect(promotableOfficialVideo(r)?.videoId).toBe('V');
	});

	it('never offers for a duplicate, a prompt, a promoted or a broken video', () => {
		expect(
			promotableOfficialVideo({
				content: { id: '1', relatedMedia: [official] } as never,
				alreadyExisted: true,
				sameSongCandidates: [],
			}),
		).toBeNull();
		expect(promotableOfficialVideo({ content: null, alreadyExisted: false, sameSongCandidates: [] })).toBeNull();
		expect(
			promotableOfficialVideo({
				content: { id: '1', relatedMedia: [{ ...official, contentId: '5' }] } as never,
				alreadyExisted: false,
				sameSongCandidates: [],
			}),
		).toBeNull();
		expect(
			promotableOfficialVideo({
				content: { id: '1', relatedMedia: [{ ...official, unavailable: true }] } as never,
				alreadyExisted: false,
				sameSongCandidates: [],
			}),
		).toBeNull();
	});
});

describe('audioTrackErrorMessage', () => {
	it.each([
		['paste a song link, not an album, playlist, or artist', 'Paste a song link, not an album, playlist, or artist.'],
		[
			'unsupported music link: paste a YouTube Music…',
			'Paste a YouTube Music, Spotify, Apple Music or Amazon Music song link.',
		],
		[
			'invalid input: a title is required for spotify links',
			'Add the song title (Spotify, Apple Music and Amazon Music links are not looked up).',
		],
		['access denied: authentication required', 'Please sign in to add a track'],
		['Failed to fetch', 'Cannot reach the server. Check your connection and try again.'],
		['boom', 'Failed to add track. Please try again.'],
	])('%s', (raw, shown) => {
		expect(audioTrackErrorMessage(new Error(raw))).toBe(shown);
	});
});

describe('addedTrackAction (where a new track surfaces)', () => {
	const q = (s: string) => new URLSearchParams(s);

	it('filter excludes audio (default YouTube view): offers "Show", which switches the Type filter', () => {
		const go = vi.fn();
		for (const search of ['', 'f.type=youtube_video', 'f.type=movie,youtube_video']) {
			go.mockClear();
			const action = addedTrackAction('7', q(search), go);
			expect(action.label).toBe('Show');
			expect(go).not.toHaveBeenCalled(); // never switches silently
			action.onClick();
			expect(go).toHaveBeenCalledTimes(1);
			expect(new URLSearchParams(go.mock.calls[0][0].split('?')[1]).get('f.type')).toBe('audio_track');
		}
	});

	it('filter already includes audio (or none): keeps "Go to track"', () => {
		const go = vi.fn();
		for (const search of ['f.type=audio_track', 'f.type=youtube_video,audio_track', 'f=none']) {
			go.mockClear();
			const action = addedTrackAction('7', q(search), go);
			expect(action.label).toBe('Go to track');
			action.onClick();
			expect(go).toHaveBeenCalledWith('/?open=7');
		}
	});
});

describe('typeFilterExcludes / showTypeHref', () => {
	it('excludes only when a Type filter exists and omits the type', () => {
		expect(typeFilterExcludes({}, 'audio_track')).toBe(false);
		expect(typeFilterExcludes({ type: 'youtube_video' }, 'audio_track')).toBe(true);
		expect(typeFilterExcludes({ type: 'youtube_video,audio_track' }, 'AUDIO_TRACK')).toBe(false);
	});

	it('showTypeHref sets the type, resets the page and keeps other grid state', () => {
		const href = showTypeHref(new URLSearchParams('f.type=youtube_video&page=3&q=queen'), 'AUDIO_TRACK');
		const p = new URLSearchParams(href.split('?')[1]);
		expect(href.startsWith('/?')).toBe(true);
		expect(p.get('f.type')).toBe('audio_track');
		expect(p.get('q')).toBe('queen');
		expect(p.has('page')).toBe(false);
	});
});
