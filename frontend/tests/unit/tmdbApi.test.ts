import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ graphqlRequest: vi.fn() }));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: mocks.graphqlRequest }));

import {
	MOVIE_SEARCH,
	releaseYear,
	searchMovies,
	tmdbKeys,
	tmdbPosterUrl,
	type MovieSearchPage,
} from '$lib/services/tmdbApi';

const page: MovieSearchPage = {
	items: [
		{
			tmdbId: 603,
			title: 'The Matrix',
			releaseDate: '1999-03-31',
			overview: 'A hacker learns the truth.',
			posterPath: '/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg',
			voteAverage: 8.2,
			url: 'https://www.themoviedb.org/movie/603',
		},
	],
	page: 1,
	totalPages: 3,
	totalResults: 51,
};

describe('tmdbApi', () => {
	beforeEach(() => {
		mocks.graphqlRequest.mockReset();
	});

	describe('searchMovies', () => {
		it('sends the query and page to the movieSearch operation and returns its page', async () => {
			mocks.graphqlRequest.mockResolvedValue({ movieSearch: page });

			const result = await searchMovies('matrix', 2);

			expect(mocks.graphqlRequest).toHaveBeenCalledWith(MOVIE_SEARCH, { query: 'matrix', page: 2 });
			expect(result).toEqual(page);
		});

		it('defaults to page 1', async () => {
			mocks.graphqlRequest.mockResolvedValue({ movieSearch: page });

			await searchMovies('matrix');

			expect(mocks.graphqlRequest).toHaveBeenCalledWith(MOVIE_SEARCH, { query: 'matrix', page: 1 });
		});

		it('lets errors through unchanged so the caller can classify them', async () => {
			const error = new TypeError('Failed to fetch');
			mocks.graphqlRequest.mockRejectedValue(error);

			await expect(searchMovies('matrix', 1)).rejects.toBe(error);
		});
	});

	describe('MOVIE_SEARCH', () => {
		it.each([
			'movieSearch(query: $query, page: $page)',
			'tmdbId',
			'releaseDate',
			'posterPath',
			'voteAverage',
			'totalPages',
			'totalResults',
		])('selects %s', (fragment) => {
			expect(MOVIE_SEARCH).toContain(fragment);
		});
	});

	describe('tmdbPosterUrl', () => {
		it('builds the w185 image URL by default', () => {
			expect(tmdbPosterUrl('/abc.jpg')).toBe('https://image.tmdb.org/t/p/w185/abc.jpg');
		});

		it('honours an explicit size', () => {
			expect(tmdbPosterUrl('/abc.jpg', 'w500')).toBe('https://image.tmdb.org/t/p/w500/abc.jpg');
		});

		it.each([null, undefined, ''])('returns null when there is no poster path (%j)', (path) => {
			expect(tmdbPosterUrl(path)).toBeNull();
		});
	});

	describe('releaseYear', () => {
		it('reads the year from a YYYY-MM-DD date', () => {
			expect(releaseYear('1999-03-31')).toBe(1999);
		});

		it.each([null, undefined, '', 'unknown'])('returns null for a missing or malformed date (%j)', (date) => {
			expect(releaseYear(date)).toBeNull();
		});
	});

	describe('tmdbKeys.search', () => {
		it('is equal for equal inputs', () => {
			expect(tmdbKeys.search('matrix', 1)).toEqual(tmdbKeys.search('matrix', 1));
		});

		it('differs when the query or the page differs', () => {
			expect(tmdbKeys.search('matrix', 1)).not.toEqual(tmdbKeys.search('heat', 1));
			expect(tmdbKeys.search('matrix', 1)).not.toEqual(tmdbKeys.search('matrix', 2));
		});

		it('sits under the tmdb root', () => {
			expect(tmdbKeys.search('matrix', 1).slice(0, 1)).toEqual(tmdbKeys.all);
		});
	});
});
