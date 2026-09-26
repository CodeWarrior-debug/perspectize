/**
 * YouTube Data API v3 client (search + trending).
 *
 * MVP approach: calls the YouTube API directly from the frontend using
 * VITE_YOUTUBE_API_KEY. Acceptable for MVP quota levels — see
 * .planning/phases/15-discover-page/15-CONTEXT.md for the quota/caching plan.
 */

const YOUTUBE_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;
const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const YOUTUBE_VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';

if (!YOUTUBE_API_KEY && import.meta.env.PROD) {
	console.error(
		'VITE_YOUTUBE_API_KEY is not set — YouTube search/trending requests will fail in production.',
		'Set VITE_YOUTUBE_API_KEY as a BUILD_TIME environment variable in your deployment platform.',
	);
}

export interface YouTubeThumbnail {
	url: string;
	width?: number;
	height?: number;
}

export interface YouTubeThumbnails {
	default?: YouTubeThumbnail;
	medium?: YouTubeThumbnail;
	high?: YouTubeThumbnail;
	standard?: YouTubeThumbnail;
	maxres?: YouTubeThumbnail;
}

interface YouTubeSnippet {
	publishedAt: string;
	channelId: string;
	title: string;
	description: string;
	thumbnails: YouTubeThumbnails;
	channelTitle: string;
}

export interface SearchResultItem {
	id: {
		kind: string;
		videoId: string;
	};
	snippet: YouTubeSnippet;
}

export interface SearchResponse {
	kind: string;
	nextPageToken?: string;
	prevPageToken?: string;
	regionCode?: string;
	pageInfo: {
		totalResults: number;
		resultsPerPage: number;
	};
	items: SearchResultItem[];
}

export interface TrendingItem {
	id: string;
	snippet: YouTubeSnippet;
	contentDetails?: {
		duration: string;
	};
}

export interface TrendingResponse {
	kind: string;
	nextPageToken?: string;
	prevPageToken?: string;
	pageInfo: {
		totalResults: number;
		resultsPerPage: number;
	};
	items: TrendingItem[];
}

/**
 * Common shape both search.list and videos.list results are normalized into.
 * Downstream components (VideoCard, VideoResultsGrid) only ever see this shape.
 */
export interface VideoItem {
	id: string;
	title: string;
	channelTitle: string;
	publishedAt: string;
	description: string;
	thumbnails: YouTubeThumbnails;
	/**
	 * ISO 8601 duration (e.g. "PT4M13S"), only present for videos.list
	 * (trending) results — search.list has no contentDetails, so this is
	 * undefined for search results (see the plan's "out of scope" note: search
	 * duration would need a separate videos.list enrichment call).
	 */
	duration?: string;
}

/** Normalize a search.list result item into the common VideoItem shape. */
export function toVideoItem(item: SearchResultItem): VideoItem;
/** Normalize a videos.list (trending) result item into the common VideoItem shape. */
export function toVideoItem(item: TrendingItem): VideoItem;
export function toVideoItem(item: SearchResultItem | TrendingItem): VideoItem {
	const id = typeof item.id === 'string' ? item.id : item.id.videoId;
	// contentDetails only exists on TrendingItem — a SearchResultItem simply
	// doesn't have the property at runtime, so this cast is safe (accessing a
	// missing property yields undefined, same as the `duration?: string`
	// contract on VideoItem below).
	const duration = (item as TrendingItem).contentDetails?.duration;
	return {
		id,
		title: item.snippet.title,
		channelTitle: item.snippet.channelTitle,
		publishedAt: item.snippet.publishedAt,
		description: item.snippet.description,
		thumbnails: item.snippet.thumbnails,
		duration,
	};
}

/** Build the canonical watch URL for a video ID (used for add-to-library + already-in-library checks). */
export function toWatchUrl(videoId: string): string {
	return `https://www.youtube.com/watch?v=${videoId}`;
}

export interface SearchFilters {
	order?: 'relevance' | 'date' | 'viewCount' | 'rating';
	videoDuration?: 'short' | 'medium' | 'long';
	/** ISO 8601 timestamp — only return videos published after this instant. */
	publishedAfter?: string;
}

export interface SearchParams extends SearchFilters {
	query: string;
	maxResults?: number;
	pageToken?: string;
}

/**
 * Search YouTube for videos matching a query (search.list).
 * Throws an Error (including the HTTP status code) on a non-OK response.
 */
export async function fetchYouTubeSearch(params: SearchParams): Promise<SearchResponse> {
	const url = new URL(YOUTUBE_SEARCH_URL);
	url.searchParams.set('part', 'snippet');
	url.searchParams.set('type', 'video');
	url.searchParams.set('key', YOUTUBE_API_KEY ?? '');
	url.searchParams.set('q', params.query);
	url.searchParams.set('maxResults', String(params.maxResults ?? 25));
	if (params.pageToken) url.searchParams.set('pageToken', params.pageToken);
	if (params.order) url.searchParams.set('order', params.order);
	if (params.videoDuration) url.searchParams.set('videoDuration', params.videoDuration);
	if (params.publishedAfter) url.searchParams.set('publishedAfter', params.publishedAfter);

	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`YouTube search request failed with status ${response.status}`);
	}
	return response.json();
}

/**
 * Fetch YouTube's Trending (mostPopular) chart (videos.list?chart=mostPopular).
 * Throws an Error (including the HTTP status code) on a non-OK response.
 */
export async function fetchYouTubeTrending(regionCode = 'US', pageToken?: string): Promise<TrendingResponse> {
	const url = new URL(YOUTUBE_VIDEOS_URL);
	url.searchParams.set('part', 'snippet,contentDetails');
	url.searchParams.set('chart', 'mostPopular');
	url.searchParams.set('regionCode', regionCode);
	url.searchParams.set('maxResults', '25');
	url.searchParams.set('key', YOUTUBE_API_KEY ?? '');
	if (pageToken) url.searchParams.set('pageToken', pageToken);

	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`YouTube trending request failed with status ${response.status}`);
	}
	return response.json();
}

export const youtubeKeys = {
	all: ['youtube'] as const,
	searches: () => [...youtubeKeys.all, 'search'] as const,
	search: (query: string, filters?: SearchFilters) => [...youtubeKeys.searches(), query, filters] as const,
	trending: (regionCode: string = 'US') => [...youtubeKeys.all, 'trending', regionCode] as const,
};
