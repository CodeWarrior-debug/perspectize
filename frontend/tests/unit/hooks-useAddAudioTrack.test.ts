import { describe, expect, it } from 'vitest';
import { audioTrackErrorMessage, promotableOfficialVideo } from '$lib/queries/content/useAddAudioTrack';

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
