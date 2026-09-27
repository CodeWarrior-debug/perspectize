import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	fetchYouTubeSearch,
	fetchYouTubeTrending,
	toVideoItem,
	toWatchUrl,
	youtubeKeys,
	type SearchResultItem,
	type TrendingItem,
} from '$lib/services/youtubeApi';

const thumbnails = {
	default: { url: 'https://img.example/default.jpg', width: 120, height: 90 },
	medium: { url: 'https://img.example/medium.jpg', width: 320, height: 180 },
};

describe('youtubeApi', () => {
	describe('toVideoItem adapter', () => {
		it('normalizes a search.list result item', () => {
			const item: SearchResultItem = {
				id: { kind: 'youtube#video', videoId: 'abc123' },
				snippet: {
					publishedAt: '2024-01-01T00:00:00Z',
					channelId: 'chan1',
					title: 'Search title',
					description: 'Search description',
					thumbnails,
					channelTitle: 'Search Channel',
				},
			};

			expect(toVideoItem(item)).toEqual({
				id: 'abc123',
				title: 'Search title',
				channelTitle: 'Search Channel',
				publishedAt: '2024-01-01T00:00:00Z',
				description: 'Search description',
				thumbnails,
				duration: undefined,
			});
		});

		it('normalizes a videos.list (trending) result item', () => {
			const item: TrendingItem = {
				id: 'xyz789',
				snippet: {
					publishedAt: '2024-02-02T00:00:00Z',
					channelId: 'chan2',
					title: 'Trending title',
					description: 'Trending description',
					thumbnails,
					channelTitle: 'Trending Channel',
				},
				contentDetails: { duration: 'PT10M' },
			};

			expect(toVideoItem(item)).toEqual({
				id: 'xyz789',
				title: 'Trending title',
				channelTitle: 'Trending Channel',
				publishedAt: '2024-02-02T00:00:00Z',
				description: 'Trending description',
				thumbnails,
				duration: 'PT10M',
			});
		});

		it('leaves duration undefined for a trending item with no contentDetails', () => {
			const item: TrendingItem = {
				id: 'no-duration',
				snippet: {
					publishedAt: '2024-02-02T00:00:00Z',
					channelId: 'chan2',
					title: 'No duration',
					description: 'desc',
					thumbnails,
					channelTitle: 'Channel',
				},
			};

			expect(toVideoItem(item).duration).toBeUndefined();
		});

		it('produces the same VideoItem shape from both source shapes', () => {
			const searchItem: SearchResultItem = {
				id: { kind: 'youtube#video', videoId: 'same-id' },
				snippet: {
					publishedAt: '2024-01-01T00:00:00Z',
					channelId: 'chan1',
					title: 'Same title',
					description: 'Same description',
					thumbnails,
					channelTitle: 'Same Channel',
				},
			};
			const trendingItem: TrendingItem = {
				id: 'same-id',
				snippet: searchItem.snippet,
			};

			expect(toVideoItem(searchItem)).toEqual(toVideoItem(trendingItem));
		});
	});

	describe('toWatchUrl', () => {
		it('builds the canonical YouTube watch URL', () => {
			expect(toWatchUrl('abc123')).toBe('https://www.youtube.com/watch?v=abc123');
		});
	});

	describe('youtubeKeys factory', () => {
		it('all returns base youtube key', () => {
			expect(youtubeKeys.all).toEqual(['youtube']);
		});

		it('searches() returns hierarchical prefix', () => {
			expect(youtubeKeys.searches()).toEqual(['youtube', 'search']);
		});

		it('search() includes query and optional filters', () => {
			expect(youtubeKeys.search('cats')).toEqual(['youtube', 'search', 'cats', undefined]);
			expect(youtubeKeys.search('cats', { order: 'date' })).toEqual(['youtube', 'search', 'cats', { order: 'date' }]);
			expect(
				youtubeKeys.search('cats', { order: 'date', videoDuration: 'short', publishedAfter: '2024-01-01' }),
			).toEqual(['youtube', 'search', 'cats', { order: 'date', videoDuration: 'short', publishedAfter: '2024-01-01' }]);
		});

		it('trending() defaults regionCode to US', () => {
			expect(youtubeKeys.trending()).toEqual(['youtube', 'trending', 'US']);
		});

		it('trending() accepts a custom regionCode', () => {
			expect(youtubeKeys.trending('GB')).toEqual(['youtube', 'trending', 'GB']);
		});
	});

	describe('fetchYouTubeSearch', () => {
		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it('calls the search.list endpoint with expected params', async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ kind: 'youtube#searchListResponse', pageInfo: {}, items: [] }),
			});
			vi.stubGlobal('fetch', fetchMock);

			await fetchYouTubeSearch({
				query: 'svelte',
				maxResults: 10,
				pageToken: 'tok',
				order: 'date',
				videoDuration: 'short',
				publishedAfter: '2024-01-01T00:00:00.000Z',
			});

			expect(fetchMock).toHaveBeenCalledTimes(1);
			const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string | URL);
			expect(requestedUrl.origin + requestedUrl.pathname).toBe('https://www.googleapis.com/youtube/v3/search');
			expect(requestedUrl.searchParams.get('part')).toBe('snippet');
			expect(requestedUrl.searchParams.get('type')).toBe('video');
			expect(requestedUrl.searchParams.get('q')).toBe('svelte');
			expect(requestedUrl.searchParams.get('maxResults')).toBe('10');
			expect(requestedUrl.searchParams.get('pageToken')).toBe('tok');
			expect(requestedUrl.searchParams.get('order')).toBe('date');
			expect(requestedUrl.searchParams.get('videoDuration')).toBe('short');
			expect(requestedUrl.searchParams.get('publishedAfter')).toBe('2024-01-01T00:00:00.000Z');
		});

		it('omits videoDuration and publishedAfter when not provided', async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ kind: 'youtube#searchListResponse', pageInfo: {}, items: [] }),
			});
			vi.stubGlobal('fetch', fetchMock);

			await fetchYouTubeSearch({ query: 'svelte' });

			const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string | URL);
			expect(requestedUrl.searchParams.has('videoDuration')).toBe(false);
			expect(requestedUrl.searchParams.has('publishedAfter')).toBe(false);
		});

		it('defaults maxResults to 25', async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ kind: 'youtube#searchListResponse', pageInfo: {}, items: [] }),
			});
			vi.stubGlobal('fetch', fetchMock);

			await fetchYouTubeSearch({ query: 'svelte' });

			const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string | URL);
			expect(requestedUrl.searchParams.get('maxResults')).toBe('25');
		});

		it('throws with the status code on a non-OK response', async () => {
			vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));

			await expect(fetchYouTubeSearch({ query: 'svelte' })).rejects.toThrow('403');
		});

		it('includes VITE_YOUTUBE_API_KEY as the "key" param', async () => {
			vi.stubEnv('VITE_YOUTUBE_API_KEY', 'test-api-key-search');
			vi.resetModules();
			const { fetchYouTubeSearch: fetchYouTubeSearchWithKey } = await import('$lib/services/youtubeApi');

			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ kind: 'youtube#searchListResponse', pageInfo: {}, items: [] }),
			});
			vi.stubGlobal('fetch', fetchMock);

			await fetchYouTubeSearchWithKey({ query: 'svelte' });

			const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string | URL);
			expect(requestedUrl.searchParams.get('key')).toBe('test-api-key-search');

			vi.unstubAllEnvs();
			vi.resetModules();
		});
	});

	describe('fetchYouTubeTrending', () => {
		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it('calls the videos.list endpoint with mostPopular chart params', async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ kind: 'youtube#videoListResponse', pageInfo: {}, items: [] }),
			});
			vi.stubGlobal('fetch', fetchMock);

			await fetchYouTubeTrending('GB', 'tok');

			const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string | URL);
			expect(requestedUrl.origin + requestedUrl.pathname).toBe('https://www.googleapis.com/youtube/v3/videos');
			expect(requestedUrl.searchParams.get('part')).toBe('snippet,contentDetails');
			expect(requestedUrl.searchParams.get('chart')).toBe('mostPopular');
			expect(requestedUrl.searchParams.get('regionCode')).toBe('GB');
			expect(requestedUrl.searchParams.get('pageToken')).toBe('tok');
		});

		it('defaults regionCode to US', async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ kind: 'youtube#videoListResponse', pageInfo: {}, items: [] }),
			});
			vi.stubGlobal('fetch', fetchMock);

			await fetchYouTubeTrending();

			const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string | URL);
			expect(requestedUrl.searchParams.get('regionCode')).toBe('US');
		});

		it('defaults maxResults to 25 (YouTube defaults videos.list to 5 when omitted)', async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ kind: 'youtube#videoListResponse', pageInfo: {}, items: [] }),
			});
			vi.stubGlobal('fetch', fetchMock);

			await fetchYouTubeTrending();

			const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string | URL);
			expect(requestedUrl.searchParams.get('maxResults')).toBe('25');
		});

		it('throws with the status code on a non-OK response', async () => {
			vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

			await expect(fetchYouTubeTrending()).rejects.toThrow('500');
		});

		it('includes VITE_YOUTUBE_API_KEY as the "key" param', async () => {
			vi.stubEnv('VITE_YOUTUBE_API_KEY', 'test-api-key-trending');
			vi.resetModules();
			const { fetchYouTubeTrending: fetchYouTubeTrendingWithKey } = await import('$lib/services/youtubeApi');

			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ kind: 'youtube#videoListResponse', pageInfo: {}, items: [] }),
			});
			vi.stubGlobal('fetch', fetchMock);

			await fetchYouTubeTrendingWithKey();

			const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string | URL);
			expect(requestedUrl.searchParams.get('key')).toBe('test-api-key-trending');

			vi.unstubAllEnvs();
			vi.resetModules();
		});
	});
});
