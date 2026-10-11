import { describe, expect, it, vi } from 'vitest';
import {
	defaultColumnVisibility,
	isAudioOnlyTypeFilter,
	itemColumnHeader,
	channelColumnHeader,
	syncItemHeader,
	capitalizeContentType,
} from '$lib/utils/grid-config';
import {
	channelValueGetter,
	genreValueGetter,
	itemCellRenderer,
	listenCellRenderer,
	typeCellRenderer,
} from '$lib/utils/formatting';
import { columnViewFor, COLUMN_VIEW_LABEL } from '$lib/utils/columnLayouts';

describe('audio track filter', () => {
	it('is audio-only only for exactly AUDIO_TRACK', () => {
		expect(isAudioOnlyTypeFilter('audio_track')).toBe(true);
		expect(isAudioOnlyTypeFilter('audio_track,movie')).toBe(false);
		expect(isAudioOnlyTypeFilter(undefined)).toBe(false);
		expect(columnViewFor('audio_track')).toBe('audio');
		expect(COLUMN_VIEW_LABEL.audio).toBe('Audio track columns');
		expect(itemColumnHeader('audio_track')).toBe('Track');
		expect(capitalizeContentType('AUDIO_TRACK')).toBe('Audio Track');
	});

	it.each([
		['xs', ['item', 'type', 'perspectize']],
		['sm', ['item', 'type', 'perspectize', 'channel', 'genre']],
		['md', ['item', 'type', 'perspectize', 'channel', 'genre', 'duration', 'listen']],
		['lg', ['item', 'type', 'perspectize', 'channel', 'genre', 'duration', 'listen', 'tags']],
	] as const)('%s default set', (tier, visible) => {
		const out = defaultColumnVisibility(tier, false, true);
		expect(out.visible).toEqual(visible);
		expect(out.hidden).toContain('rated');
		expect(out.hidden).toContain('views');
	});

	it('other views keep the listen column hidden', () => {
		expect(defaultColumnVisibility('lg', false).hidden).toContain('listen');
		expect(defaultColumnVisibility('lg', true).hidden).toContain('listen');
	});
});

describe('audio cells', () => {
	const row = {
		contentType: 'AUDIO_TRACK',
		name: 'Bohemian Rhapsody',
		url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
		channelTitle: null,
		genre: { id: '21', name: 'Rock' },
		audioTrack: { artist: 'Queen', explicit: true, coverImageUrl: 'https://lh3.googleusercontent.com/c=w60' },
	};

	it('artist fills the channel column; the saved genre fills Genre', () => {
		expect(channelValueGetter({ data: row })).toBe('Queen');
		expect(channelValueGetter({ data: { channelTitle: 'Chan', audioTrack: null } })).toBe('Chan');
		expect(genreValueGetter({ data: row })).toBe('Rock');
	});

	it('item cell shows the cover and an E badge', () => {
		const el = itemCellRenderer({ data: row }) as HTMLElement;
		expect(el.querySelector('img')!.getAttribute('src')).toBe(row.audioTrack.coverImageUrl);
		expect(el.querySelector('[aria-label="Explicit"]')!.textContent).toBe('E');
	});

	it('listen cell links the stored url with its provider name', () => {
		const el = listenCellRenderer({ data: row }) as HTMLElement;
		expect(el.tagName).toBe('A');
		expect(el.textContent).toBe('Spotify');
		expect(el.getAttribute('href')).toBe(row.url);
		expect(
			listenCellRenderer({ data: { url: 'https://www.youtube.com/watch?v=x', contentType: 'YOUTUBE_VIDEO' } }),
		).toBe('');
	});

	it('type cell has an audio icon and label', () => {
		expect((typeCellRenderer({ data: { contentType: 'AUDIO_TRACK' } }) as HTMLElement).textContent).toContain(
			'Audio Track',
		);
	});
});

describe('channel column header', () => {
	it('reads "Artist" only when the type filter is exactly AUDIO_TRACK', () => {
		expect(channelColumnHeader('audio_track')).toBe('Artist');
	});

	it('keeps "Channel" for every other view', () => {
		expect(channelColumnHeader('youtube_video')).toBe('Channel');
		expect(channelColumnHeader('movie')).toBe('Channel');
		expect(channelColumnHeader('audio_track,youtube_video')).toBe('Channel');
		expect(channelColumnHeader(undefined)).toBe('Channel');
	});

	it('renames the channel colDef and redraws once, then switches back', () => {
		const colDef = { headerName: 'Channel' };
		const refreshHeader = vi.fn();
		const api = { getColumn: (id: string) => (id === 'channel' ? { getColDef: () => colDef } : null), refreshHeader };
		expect(syncItemHeader(api, channelColumnHeader('audio_track'), 'channel')).toBe(true);
		expect(colDef.headerName).toBe('Artist');
		expect(syncItemHeader(api, channelColumnHeader('audio_track'), 'channel')).toBe(false);
		expect(syncItemHeader(api, channelColumnHeader('youtube_video'), 'channel')).toBe(true);
		expect(colDef.headerName).toBe('Channel');
		expect(refreshHeader).toHaveBeenCalledTimes(2);
	});
});
