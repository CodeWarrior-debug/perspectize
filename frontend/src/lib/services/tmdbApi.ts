/**
 * Discover page data for movies (TMDB).
 *
 * Search runs through our GraphQL API (`movieSearch`), which calls TMDB's
 * /search/movie from the Go backend and caches each page server-side — the TMDB
 * read token never reaches the browser, same as YouTube trending (youtubeApi.ts).
 *
 * Adding a result goes through the existing createContentFromMovie mutation
 * (useAddMovie) using the result's canonical `url`, so dedupe is unchanged.
 */
import { gql } from 'graphql-request';
import { graphqlRequest } from '$lib/queries/client';

/** One movie from TMDB search, as the backend maps it (schema.graphql MovieSearchResult). */
export interface MovieSearchResult {
	tmdbId: number;
	title: string;
	/** YYYY-MM-DD; null when TMDB has no release date. */
	releaseDate: string | null;
	overview: string;
	/** TMDB image path (e.g. "/abc.jpg"); see tmdbPosterUrl. */
	posterPath: string | null;
	/** TMDB vote average 0-10; null when there are no votes. */
	voteAverage: number | null;
	/** Canonical https://www.themoviedb.org/movie/<id> — pass to createContentFromMovie. */
	url: string;
}

export interface MovieSearchPage {
	items: MovieSearchResult[];
	page: number;
	totalPages: number;
	totalResults: number;
}

export const MOVIE_SEARCH = gql`
	query MovieSearch($query: String!, $page: Int) {
		movieSearch(query: $query, page: $page) {
			items {
				tmdbId
				title
				releaseDate
				overview
				posterPath
				voteAverage
				url
			}
			page
			totalPages
			totalResults
		}
	}
`;

export interface MovieSearchResponse {
	movieSearch: MovieSearchPage;
}

/** Trending window: today (DAY) or this week (WEEK), as the backend's TrendingWindow enum. */
export type TrendingWindow = 'DAY' | 'WEEK';

export const MOVIE_TRENDING = gql`
	query MovieTrending($window: TrendingWindow, $page: Int) {
		movieTrending(window: $window, page: $page) {
			items {
				tmdbId
				title
				releaseDate
				overview
				posterPath
				voteAverage
				url
			}
			page
			totalPages
			totalResults
		}
	}
`;

export interface MovieTrendingResponse {
	movieTrending: MovieSearchPage;
}

/** Trending pages are cached server-side for about an hour; a 30-minute client window keeps the feed snappy. */
export const MOVIE_TRENDING_STALE_TIME = 30 * 60 * 1000;

/** Fetch one page of TMDB trending movies for the window from the backend. Throws the GraphQL/network error unchanged. */
export async function fetchTrendingMovies(window: TrendingWindow = 'WEEK', page = 1): Promise<MovieSearchPage> {
	const data = await graphqlRequest<MovieTrendingResponse>(MOVIE_TRENDING, { window, page });
	return data.movieTrending;
}

/** Minimum trimmed length before a search is sent. */
export const MOVIE_SEARCH_MIN_LENGTH = 2;
/** Matches the backend limit (100 runes after trim); keeps the input from ever hitting it. */
export const MOVIE_SEARCH_MAX_LENGTH = 100;
/** Quiet period after the last keystroke before a search is sent. */
export const MOVIE_SEARCH_DEBOUNCE_MS = 350;
/** Search results are cached client-side for 10 minutes (the backend caches for 1h). */
export const MOVIE_SEARCH_STALE_TIME = 10 * 60 * 1000;

/** Fetch one page of TMDB search results for `query` from the backend. Throws the GraphQL/network error unchanged. */
export async function searchMovies(query: string, page = 1): Promise<MovieSearchPage> {
	const data = await graphqlRequest<MovieSearchResponse>(MOVIE_SEARCH, { query, page });
	return data.movieSearch;
}

export type PosterSize = 'w92' | 'w185' | 'w342' | 'w500';

/** Absolute TMDB poster URL for a path, or null when TMDB has no poster. */
export function tmdbPosterUrl(path: string | null | undefined, size: PosterSize = 'w185'): string | null {
	return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

/** The four-digit release year of a YYYY-MM-DD date, or null when missing or malformed. */
export function releaseYear(date: string | null | undefined): number | null {
	const match = /^(\d{4})/.exec(date ?? '');
	return match ? Number(match[1]) : null;
}

export const tmdbKeys = {
	all: ['tmdb'] as const,
	search: (query: string, page: number) => [...tmdbKeys.all, 'search', query, page] as const,
	trending: (window: TrendingWindow, page: number) => [...tmdbKeys.all, 'trending', window, page] as const,
};
