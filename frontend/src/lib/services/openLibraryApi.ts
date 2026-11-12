/**
 * Discover page data for books (Open Library).
 *
 * Search, trending and ISBN lookup run through our GraphQL API (`bookSearch`,
 * `bookTrending`, `bookByISBN`), which call Open Library from the Go backend. Open Library
 * needs no key, but the backend still proxies it so trending can be cached server-side,
 * the same as movies (tmdbApi.ts).
 *
 * Adding a result goes through the createContentFromBook mutation (useAddBook) using the
 * result's canonical work `url`, so dedupe is by work, not by edition or ISBN.
 */
import { gql } from 'graphql-request';
import { graphqlRequest } from '$lib/queries/client';
import type { TrendingWindow } from '$lib/services/tmdbApi';

/** One book (a work, not an edition) from Open Library, as the backend maps it (schema.graphql BookSearchResult). */
export interface BookSearchResult {
	/** Open Library work key, e.g. "OL23166W". Identity is the work, never an ISBN. */
	workKey: string;
	title: string;
	/** Ordered author names; empty when Open Library has none. */
	authorName: string[];
	/** Cover image id for covers.openlibrary.org; null when the work has no cover. */
	coverId: number | null;
	firstPublishYear: number | null;
	/** Median page count across editions (a derived figure, not one printing's count). */
	pageCountMedian: number | null;
	subjects: string[];
	/** Community rating out of 5; null when there are no ratings. */
	ratingsAverage: number | null;
	ratingsCount: number | null;
	editionCount: number | null;
	/** Canonical https://openlibrary.org/works/<key> link; pass to createContentFromBook. */
	url: string;
}

export interface BookSearchPage {
	items: BookSearchResult[];
	page: number;
	totalPages: number;
	totalResults: number;
}

/** Every BookSearchResult field, so a search, a trending feed and an ISBN lookup return the same shape. */
const BOOK_RESULT_FIELDS = `
	workKey
	title
	authorName
	coverId
	firstPublishYear
	pageCountMedian
	subjects
	ratingsAverage
	ratingsCount
	editionCount
	url
`;

export const BOOK_SEARCH = gql`
	query BookSearch($query: String!, $page: Int) {
		bookSearch(query: $query, page: $page) {
			items {${BOOK_RESULT_FIELDS}}
			page
			totalPages
			totalResults
		}
	}
`;

export interface BookSearchResponse {
	bookSearch: BookSearchPage;
}

export const BOOK_TRENDING = gql`
	query BookTrending($window: TrendingWindow, $page: Int) {
		bookTrending(window: $window, page: $page) {
			items {${BOOK_RESULT_FIELDS}}
			page
			totalPages
			totalResults
		}
	}
`;

export interface BookTrendingResponse {
	bookTrending: BookSearchPage;
}

/** Resolves an ISBN to its work without adding anything (the ISBN tab's preview-before-add). */
export const BOOK_BY_ISBN = gql`
	query BookByISBN($isbn: String!) {
		bookByISBN(isbn: $isbn) {${BOOK_RESULT_FIELDS}}
	}
`;

export interface BookByISBNResponse {
	bookByISBN: BookSearchResult | null;
}

/** Minimum trimmed length before a search is sent. */
export const BOOK_SEARCH_MIN_LENGTH = 2;
/** Matches the backend limit (100 runes after trim); keeps the input from ever hitting it. */
export const BOOK_SEARCH_MAX_LENGTH = 100;
/** Quiet period after the last keystroke before a search is sent. */
export const BOOK_SEARCH_DEBOUNCE_MS = 350;
/** Search results are cached client-side for 10 minutes. */
export const BOOK_SEARCH_STALE_TIME = 10 * 60 * 1000;
/** Trending pages are cached server-side; a 30-minute client window keeps the feed snappy. */
export const BOOK_TRENDING_STALE_TIME = 30 * 60 * 1000;

/** Fetch one page of Open Library search results for `query` from the backend. Throws the GraphQL/network error unchanged. */
export async function searchBooks(query: string, page = 1): Promise<BookSearchPage> {
	const data = await graphqlRequest<BookSearchResponse>(BOOK_SEARCH, { query, page });
	return data.bookSearch;
}

/** Fetch one page of trending books for the window from the backend. Throws the GraphQL/network error unchanged. */
export async function fetchTrendingBooks(window: TrendingWindow = 'WEEK', page = 1): Promise<BookSearchPage> {
	const data = await graphqlRequest<BookTrendingResponse>(BOOK_TRENDING, { window, page });
	return data.bookTrending;
}

/** The work an ISBN resolves to, or null when Open Library has no record for it. Throws the GraphQL/network error unchanged. */
export async function lookupBookByIsbn(isbn: string): Promise<BookSearchResult | null> {
	const data = await graphqlRequest<BookByISBNResponse>(BOOK_BY_ISBN, { isbn });
	return data.bookByISBN;
}

export type CoverSize = 'S' | 'M' | 'L';

/** Absolute Open Library cover URL for a cover id, or null when the work has no cover. S is for grids, M for cards, L for details. */
export function openLibraryCoverUrl(coverId: number | null | undefined, size: CoverSize = 'M'): string | null {
	return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg` : null;
}

export const openLibraryKeys = {
	all: ['openlibrary'] as const,
	search: (query: string, page: number) => [...openLibraryKeys.all, 'search', query, page] as const,
	trending: (window: TrendingWindow, page: number) => [...openLibraryKeys.all, 'trending', window, page] as const,
	isbn: (isbn: string) => [...openLibraryKeys.all, 'isbn', isbn] as const,
};
