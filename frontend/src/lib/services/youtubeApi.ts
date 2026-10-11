/**
 * Discover page data for YouTube.
 *
 * Trending comes from our own GraphQL API (`youtubeTrending`), which calls
 * YouTube's videos.list?chart=mostPopular from the Go backend and caches each
 * page in youtube.CachingClient — every visitor shares one API call per page
 * per hour, and the API key never reaches the browser.
 *
 * There is deliberately no in-app search: search.list is capped at 100 calls
 * a day per project, so the search box hands off to youtube.com instead
 * (youtubeSearchUrl) and the user brings a video back by pasting its link.
 */
import { gql } from 'graphql-request';
import { graphqlRequest } from '$lib/queries/client';

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

/** Shape the Discover components (VideoCard, VideoResultsGrid) render. */
export interface VideoItem {
	id: string;
	title: string;
	channelTitle: string;
	publishedAt: string;
	description: string;
	thumbnails: YouTubeThumbnails;
	/** ISO 8601 duration (e.g. "PT4M13S"), shown as the card's duration badge. */
	duration?: string;
}

export const YOUTUBE_TRENDING = gql`
	query YouTubeTrending($regionCode: String, $pageToken: String) {
		youtubeTrending(regionCode: $regionCode, pageToken: $pageToken) {
			items {
				id
				title
				channelTitle
				description
				publishedAt
				thumbnailUrl
				duration
			}
			nextPageToken
		}
	}
`;

export interface TrendingVideo {
	id: string;
	title: string;
	channelTitle: string;
	description: string;
	publishedAt: string;
	thumbnailUrl: string;
	duration: string;
}

export interface TrendingResponse {
	youtubeTrending: {
		items: TrendingVideo[];
		nextPageToken: string | null;
	};
}

export interface TrendingPage {
	items: VideoItem[];
	nextPageToken?: string;
}

/** Normalize a backend trending video into the shape the Discover components render. */
export function toVideoItem(video: TrendingVideo): VideoItem {
	return {
		id: video.id,
		title: video.title,
		channelTitle: video.channelTitle,
		publishedAt: video.publishedAt,
		description: video.description,
		thumbnails: video.thumbnailUrl ? { medium: { url: video.thumbnailUrl } } : {},
		duration: video.duration || undefined,
	};
}

/**
 * Fetch one page of YouTube's Trending chart from the backend cache.
 * Throws the GraphQL/network error unchanged so the page can classify it.
 */
export async function fetchYouTubeTrending(regionCode = 'US', pageToken?: string): Promise<TrendingPage> {
	const data = await graphqlRequest<TrendingResponse>(YOUTUBE_TRENDING, {
		regionCode,
		pageToken: pageToken ?? null,
	});
	return {
		items: data.youtubeTrending.items.map(toVideoItem),
		nextPageToken: data.youtubeTrending.nextPageToken ?? undefined,
	};
}

/** youtube.com search results for a query — where the Discover search box sends the user. */
export function youtubeSearchUrl(query: string): string {
	return `https://www.youtube.com/results?search_query=${encodeURIComponent(query.trim())}`;
}

/** Build the canonical watch URL for a video ID (used for add-to-library + already-in-library checks). */
export function toWatchUrl(videoId: string): string {
	return `https://www.youtube.com/watch?v=${videoId}`;
}

export const youtubeKeys = {
	all: ['youtube'] as const,
	trending: (regionCode: string = 'US') => [...youtubeKeys.all, 'trending', regionCode] as const,
};
