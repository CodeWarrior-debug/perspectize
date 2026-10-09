import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ graphqlRequest: vi.fn() }));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: mocks.graphqlRequest }));

import {
	YOUTUBE_TRENDING,
	fetchYouTubeTrending,
	toVideoItem,
	toWatchUrl,
	youtubeKeys,
	youtubeSearchUrl,
	type TrendingVideo,
} from '$lib/services/youtubeApi';

const video: TrendingVideo = {
	id: 'abc123',
	title: 'A video',
	channelTitle: 'A channel',
	description: 'desc',
	publishedAt: '2026-09-26T12:00:00Z',
	thumbnailUrl: 'https://i.ytimg.com/vi/abc123/mqdefault.jpg',
	duration: 'PT4M13S',
};

describe('youtubeApi', () => {
	beforeEach(() => {
		mocks.graphqlRequest.mockReset();
	});

	describe('toVideoItem', () => {
		it('maps a backend trending video to the VideoItem shape the cards render', () => {
			expect(toVideoItem(video)).toEqual({
				id: 'abc123',
				title: 'A video',
				channelTitle: 'A channel',
				description: 'desc',
				publishedAt: '2026-09-26T12:00:00Z',
				thumbnails: { medium: { url: 'https://i.ytimg.com/vi/abc123/mqdefault.jpg' } },
				duration: 'PT4M13S',
			});
		});

		it('leaves duration undefined and thumbnails empty when the backend sends blanks', () => {
			const item = toVideoItem({ ...video, duration: '', thumbnailUrl: '' });
			expect(item.duration).toBeUndefined();
			expect(item.thumbnails).toEqual({});
		});
	});

	describe('fetchYouTubeTrending', () => {
		it('queries the backend, not googleapis, and maps the page', async () => {
			mocks.graphqlRequest.mockResolvedValue({ youtubeTrending: { items: [video], nextPageToken: 'CBkQAA' } });
			const fetchSpy = vi.spyOn(globalThis, 'fetch');

			const page = await fetchYouTubeTrending();

			expect(mocks.graphqlRequest).toHaveBeenCalledWith(YOUTUBE_TRENDING, { regionCode: 'US', pageToken: null });
			expect(fetchSpy).not.toHaveBeenCalled();
			expect(page.items).toHaveLength(1);
			expect(page.items[0].id).toBe('abc123');
			expect(page.nextPageToken).toBe('CBkQAA');
			fetchSpy.mockRestore();
		});

		it('passes region and page token through', async () => {
			mocks.graphqlRequest.mockResolvedValue({ youtubeTrending: { items: [], nextPageToken: null } });

			await fetchYouTubeTrending('GB', 'tok');

			expect(mocks.graphqlRequest).toHaveBeenCalledWith(YOUTUBE_TRENDING, { regionCode: 'GB', pageToken: 'tok' });
		});

		it('maps a null nextPageToken (last page) to undefined', async () => {
			mocks.graphqlRequest.mockResolvedValue({ youtubeTrending: { items: [], nextPageToken: null } });

			const page = await fetchYouTubeTrending();

			expect(page.nextPageToken).toBeUndefined();
		});

		it('rethrows backend errors so the page can classify them', async () => {
			mocks.graphqlRequest.mockRejectedValue(new Error('trending is unavailable right now'));

			await expect(fetchYouTubeTrending()).rejects.toThrow('trending is unavailable right now');
		});

		it('requests the fields the Discover cards use', () => {
			for (const field of [
				'id',
				'title',
				'channelTitle',
				'description',
				'publishedAt',
				'thumbnailUrl',
				'duration',
				'nextPageToken',
			]) {
				expect(YOUTUBE_TRENDING).toContain(field);
			}
		});
	});

	describe('youtubeSearchUrl', () => {
		it('builds a youtube.com results URL with the query encoded', () => {
			expect(youtubeSearchUrl('  lo-fi & jazz  ')).toBe(
				'https://www.youtube.com/results?search_query=lo-fi%20%26%20jazz',
			);
		});
	});

	describe('toWatchUrl', () => {
		it('builds the canonical YouTube watch URL', () => {
			expect(toWatchUrl('abc123')).toBe('https://www.youtube.com/watch?v=abc123');
		});
	});

	describe('youtubeKeys', () => {
		it('trending() defaults regionCode to US', () => {
			expect(youtubeKeys.trending()).toEqual(['youtube', 'trending', 'US']);
		});

		it('has no search keys (in-app search was removed)', () => {
			expect(Object.keys(youtubeKeys)).toEqual(['all', 'trending']);
		});
	});
});
