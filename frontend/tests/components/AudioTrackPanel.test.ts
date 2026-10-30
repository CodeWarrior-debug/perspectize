import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';

const h = vi.hoisted(() => ({
	trackData: null as any,
	me: { id: '3' } as { id: string } | null,
	refresh: vi.fn(),
	markRelated: vi.fn(),
	markLink: vi.fn(),
	promote: vi.fn(),
	setGenre: vi.fn(),
	unregister: vi.fn(),
}));

vi.mock('$lib/queries/content/useAudioTrack', () => ({
	useAudioTrack: () => ({
		get data() {
			return h.trackData;
		},
	}),
	useMusicGenres: () => ({
		data: [
			{ id: '21', name: 'Rock', parentId: null },
			{ id: '14', name: 'Pop', parentId: null },
		],
	}),
	useRefreshLyrics: () => ({ mutate: h.refresh, isPending: false }),
	useMarkRelatedMediaUnavailable: () => ({ mutate: h.markRelated }),
	useMarkTrackLinkUnavailable: () => ({ mutate: h.markLink }),
	usePromoteRelatedMedia: () => ({ mutate: h.promote, isPending: false }),
	useSetTrackGenre: () => ({ mutate: h.setGenre, isPending: false }),
}));
vi.mock('$lib/queries/users/useMe.svelte', () => ({
	useMe: () => ({
		get me() {
			return h.me;
		},
	}),
}));
vi.mock('$lib/utils/playerCoordinator', () => ({
	playerCoordinator: { register: () => h.unregister, playing: vi.fn() },
}));

import AudioTrackPanel from '$lib/components/AudioTrackPanel.svelte';
import { EMBED_ORIGIN } from '$lib/utils/mediaPlayer';

const url = 'https://music.youtube.com/watch?v=AUDIOAUDIO1';
const props = { contentId: '9', name: 'Bohemian Rhapsody', url, open: true };
const ytLink = {
	id: '41',
	provider: 'youtube',
	providerTrackId: 'AUDIOAUDIO1',
	url,
	kind: 'EMBED',
	source: 'PASTED',
	unavailableAt: null,
};
const spotifyLink = {
	id: '42',
	provider: 'spotify',
	providerTrackId: '4uLU6hMCjMI75M1A2tKUQC',
	url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
	kind: 'LISTEN',
	source: 'PASTED',
	unavailableAt: null,
};

function data(over: Record<string, unknown> = {}) {
	return {
		id: '9',
		name: 'Bohemian Rhapsody',
		url,
		addedByUserID: '3',
		createdAt: new Date().toISOString(),
		genreId: null,
		genre: null,
		audioTrack: { artist: 'Queen', videoType: 'MUSIC_VIDEO_TYPE_ATV' },
		trackLinks: [ytLink, spotifyLink],
		relatedMedia: [],
		lyrics: { available: true, lrclibId: 1, hasSynced: true, checkedAt: '2026-10-01T12:00:00Z' },
		...over,
	};
}

function embedError(code: number) {
	const frame = document.querySelector('iframe')!;
	window.dispatchEvent(
		new MessageEvent('message', {
			data: JSON.stringify({ event: 'onError', info: code }),
			origin: EMBED_ORIGIN,
			source: frame.contentWindow,
		}),
	);
}

describe('AudioTrackPanel', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		h.me = { id: '3' };
		h.trackData = data();
	});

	// Review Focus 5.
	it('closing removes the player and releases the claim', async () => {
		const { rerender } = render(AudioTrackPanel, { props });
		expect(document.querySelector('iframe')).not.toBeNull();
		await rerender({ ...props, open: false });
		expect(document.querySelector('iframe')).toBeNull();
		expect(h.unregister).toHaveBeenCalled();
	});

	it('lists listen links by provider', () => {
		render(AudioTrackPanel, { props });
		expect(screen.getByRole('link', { name: 'Spotify' })).toHaveAttribute('href', spotifyLink.url);
	});

	it('shows the explicit badge and the unofficial-upload label', () => {
		h.trackData = data({ audioTrack: { artist: 'Queen', explicit: true, videoType: 'MUSIC_VIDEO_TYPE_UGC' } });
		render(AudioTrackPanel, { props });
		expect(screen.getByLabelText('Explicit')).toHaveTextContent('E');
		expect(screen.getByText('Unofficial upload')).toBeInTheDocument();
	});

	it('101/150 on a track link marks that link; 153 marks nothing', async () => {
		render(AudioTrackPanel, { props });
		embedError(153);
		expect(h.markLink).not.toHaveBeenCalled();
		embedError(150);
		expect(h.markLink).toHaveBeenCalledWith({ contentId: '9', linkId: '41' });
		expect(h.markRelated).not.toHaveBeenCalled();
	});

	it('pre-fills a suggested genre but saves only on Save', async () => {
		h.trackData = data({ audioTrack: { artist: 'Queen', suggestedGenreId: 21 } });
		render(AudioTrackPanel, { props });
		expect(screen.getByRole('button', { name: 'Rock' })).toBeInTheDocument();
		expect(h.setGenre).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: 'Save genre' }));
		expect(h.setGenre).toHaveBeenCalledWith({ contentId: '9', genreId: '21' });
	});

	it('a locked genre is read-only', () => {
		h.me = { id: '7' };
		h.trackData = data({ genreId: '21', genre: { id: '21', name: 'Rock', parentId: null } });
		render(AudioTrackPanel, { props });
		expect(screen.getByTestId('genre-readonly')).toHaveTextContent('Rock');
		expect(screen.queryByRole('button', { name: 'Save genre' })).not.toBeInTheDocument();
	});

	it('shows neither badge nor label for an ordinary official track', () => {
		render(AudioTrackPanel, { props });
		expect(screen.queryByLabelText('Explicit')).not.toBeInTheDocument();
		expect(screen.queryByText('Unofficial upload')).not.toBeInTheDocument();
	});

	it('101/150 on a related upload marks that upload, not a link', () => {
		h.trackData = data({
			trackLinks: [{ ...ytLink, unavailableAt: '2026-10-01T00:00:00Z' }, spotifyLink],
			relatedMedia: [
				{
					videoId: 'RELATED0001',
					provider: 'youtube',
					title: 'Live',
					kind: 'live',
					unavailable: false,
					contentId: null,
				},
			],
		});
		render(AudioTrackPanel, { props });
		embedError(101);
		expect(h.markRelated).toHaveBeenCalledWith({ contentId: '9', videoId: 'RELATED0001' });
		expect(h.markLink).not.toHaveBeenCalled();
	});

	it('an unchanged saved genre shows the picker but no Save button', () => {
		h.trackData = data({ genreId: '21', genre: { id: '21', name: 'Rock', parentId: null } });
		render(AudioTrackPanel, { props });
		expect(screen.getByRole('button', { name: 'Rock' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Save genre' })).not.toBeInTheDocument();
	});
});
