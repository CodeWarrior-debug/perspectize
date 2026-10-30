import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';

const h = vi.hoisted(() => ({
	trackData: null as any,
	refresh: vi.fn(),
	mark: vi.fn(),
	promote: vi.fn(),
}));

vi.mock('$lib/queries/content/useMusicTrack', () => ({
	useMusicTrack: () => ({
		get data() {
			return h.trackData;
		},
	}),
	useRefreshLyrics: () => ({ mutate: h.refresh, isPending: false }),
	useMarkRelatedMediaUnavailable: () => ({ mutate: h.mark }),
	usePromoteRelatedMedia: () => ({ mutate: h.promote, isPending: false }),
}));

import MusicTrackPanel from '$lib/components/MusicTrackPanel.svelte';

const url = 'https://music.youtube.com/watch?v=AUDIOAUDIO1';
const props = { contentId: '9', name: 'Bohemian Rhapsody', url, open: true };
const official = {
	provider: 'youtube',
	videoId: 'VIDEOVIDEO1',
	kind: 'official_video',
	title: 'Official Video',
	contentId: null,
	unavailable: false,
};

function data(over: Record<string, unknown> = {}) {
	return {
		id: '9',
		name: 'Bohemian Rhapsody',
		url,
		response: { artist: 'Queen' },
		relatedMedia: [official],
		lyrics: { available: true, lrclibId: 1, hasSynced: true, checkedAt: '2026-09-27T12:00:00Z' },
		...over,
	};
}

describe('MusicTrackPanel', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		h.trackData = data();
	});

	it('plays the track in the embedded player', () => {
		render(MusicTrackPanel, { props });
		expect(document.querySelector('iframe')!.getAttribute('src')).toContain('/embed/AUDIOAUDIO1?');
	});

	it('lists related uploads with a promote button, and never promotes on its own', async () => {
		render(MusicTrackPanel, { props });
		expect(screen.getByText('Official video')).toBeInTheDocument();
		expect(h.promote).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: 'Add as its own item' }));
		expect(h.promote).toHaveBeenCalledWith({ contentId: '9', videoId: 'VIDEOVIDEO1' });
	});

	it('shows "In Perspectize" instead of the button once promoted', () => {
		h.trackData = data({ relatedMedia: [{ ...official, contentId: '12' }] });
		render(MusicTrackPanel, { props });
		expect(screen.getByText('In Perspectize')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Add as its own item' })).not.toBeInTheDocument();
	});

	it('greys out unplayable uploads', () => {
		h.trackData = data({ relatedMedia: [{ ...official, unavailable: true }] });
		render(MusicTrackPanel, { props });
		expect(screen.getByText("(can't be played here)")).toBeInTheDocument();
	});

	it('does not re-check lyrics that were found', () => {
		render(MusicTrackPanel, { props });
		expect(h.refresh).not.toHaveBeenCalled();
	});

	it('re-checks never-checked lyrics once', () => {
		h.trackData = data({ lyrics: null });
		render(MusicTrackPanel, { props });
		expect(h.refresh).toHaveBeenCalledTimes(1);
		expect(h.refresh).toHaveBeenCalledWith('9');
	});

	it('uses the stored artist for the lyrics search', () => {
		h.trackData = data({
			lyrics: { available: false, lrclibId: null, hasSynced: false, checkedAt: new Date().toISOString() },
		});
		render(MusicTrackPanel, { props });
		expect(screen.getByRole('link', { name: "Search LRCLIB for 'Bohemian Rhapsody' – Queen" })).toBeInTheDocument();
	});
});
