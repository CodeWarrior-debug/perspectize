import { describe, it, expect } from 'vitest';
import { playbackQueue, parseEmbedMessage, embedUrl, lyricsNeedRecheck, EMBED_ORIGIN } from '$lib/utils/mediaPlayer';
import type { RelatedMedia } from '$lib/queries/content';

const ref = (videoId: string, kind: string, extra: Partial<RelatedMedia> = {}): RelatedMedia => ({
	provider: 'youtube',
	videoId,
	kind,
	title: null,
	contentId: null,
	unavailable: false,
	...extra,
});

describe('playbackQueue', () => {
	it('plays the track first, then audio, videos, and live last', () => {
		const q = playbackQueue('TRACK', [
			ref('LIVE', 'live'),
			ref('VIDEO', 'official_video'),
			ref('AUDIO', 'audio'),
			ref('LYRIC', 'lyric_video'),
		]);
		expect(q).toEqual(['TRACK', 'AUDIO', 'VIDEO', 'LYRIC', 'LIVE']);
	});

	it('skips unavailable, duplicate, and non-YouTube entries', () => {
		const q = playbackQueue('TRACK', [
			ref('TRACK', 'audio'),
			ref('BROKEN', 'official_video', { unavailable: true }),
			ref('ELSEWHERE', 'audio', { provider: 'other' }),
			ref('OK', 'official_video'),
		]);
		expect(q).toEqual(['TRACK', 'OK']);
	});

	it('works without a primary video', () => {
		expect(playbackQueue(null, [ref('A', 'audio')])).toEqual(['A']);
		expect(playbackQueue(null, [])).toEqual([]);
	});
});

describe('parseEmbedMessage', () => {
	const msg = (event: string, info: unknown) => JSON.stringify({ event, info });

	// Review Focus 4: ticket 03 — only 101 and 150 mark a link unavailable.
	it('only 101 and 150 mark', () => {
		expect(parseEmbedMessage(EMBED_ORIGIN, msg('onError', 101))).toEqual({
			type: 'unplayable',
			code: 101,
			markUnavailable: true,
		});
		expect(parseEmbedMessage(EMBED_ORIGIN, msg('onError', 150))).toEqual({
			type: 'unplayable',
			code: 150,
			markUnavailable: true,
		});
		expect(parseEmbedMessage(EMBED_ORIGIN, msg('onError', 100))).toEqual({
			type: 'unplayable',
			code: 100,
			markUnavailable: false,
		});
		expect(parseEmbedMessage(EMBED_ORIGIN, msg('onError', 153))).toEqual({ type: 'config', code: 153 });
		expect(parseEmbedMessage(EMBED_ORIGIN, msg('onError', 2))).toEqual({ type: 'error', code: 2 });
		expect(parseEmbedMessage(EMBED_ORIGIN, msg('onError', 5))).toEqual({ type: 'error', code: 5 });
	});

	it('reads play state from onStateChange and infoDelivery', () => {
		expect(parseEmbedMessage(EMBED_ORIGIN, msg('onStateChange', 1))).toEqual({ type: 'playing' });
		expect(parseEmbedMessage(EMBED_ORIGIN, msg('onStateChange', 2))).toEqual({ type: 'paused' });
		expect(parseEmbedMessage(EMBED_ORIGIN, msg('onStateChange', 0))).toEqual({ type: 'ended' });
		expect(parseEmbedMessage(EMBED_ORIGIN, msg('infoDelivery', { playerState: 1 }))).toEqual({ type: 'playing' });
		expect(parseEmbedMessage(EMBED_ORIGIN, msg('infoDelivery', { currentTime: 3 }))).toBeNull();
	});

	it('ignores other origins and junk', () => {
		expect(parseEmbedMessage('https://evil.example', msg('onError', 150))).toBeNull();
		expect(parseEmbedMessage(EMBED_ORIGIN, 'not json')).toBeNull();
		expect(parseEmbedMessage(EMBED_ORIGIN, { event: 'onError' })).toBeNull();
	});
});

describe('embedUrl', () => {
	it('never autoplays', () => {
		expect(embedUrl('AAAAAAAAAAA', 'http://localhost')).toContain('autoplay=0');
	});

	it('uses the privacy-enhanced domain with the JS API enabled', () => {
		const u = new URL(embedUrl('dQw4w9WgXcQ', 'https://perspectize.com'));
		expect(u.origin).toBe(EMBED_ORIGIN);
		expect(u.pathname).toBe('/embed/dQw4w9WgXcQ');
		expect(u.searchParams.get('enablejsapi')).toBe('1');
		expect(u.searchParams.get('origin')).toBe('https://perspectize.com');
	});
});

describe('lyricsNeedRecheck', () => {
	const now = Date.parse('2026-09-27T12:00:00Z');
	it.each([
		['never checked', null, true],
		['found long ago', { available: true, checkedAt: '2025-01-01T00:00:00Z' }, false],
		['missing, recent', { available: false, checkedAt: '2026-09-20T00:00:00Z' }, false],
		['missing, over 30 days', { available: false, checkedAt: '2026-08-01T00:00:00Z' }, true],
	])('%s', (_n, lyrics, want) => {
		expect(lyricsNeedRecheck(lyrics, now)).toBe(want);
	});
});
