import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ graphqlRequest: vi.fn() }));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: mocks.graphqlRequest }));

import {
	BOOK_BY_ISBN,
	BOOK_SEARCH,
	BOOK_SEARCH_DEBOUNCE_MS,
	BOOK_SEARCH_MAX_LENGTH,
	BOOK_SEARCH_MIN_LENGTH,
	BOOK_SEARCH_STALE_TIME,
	BOOK_TRENDING,
	BOOK_TRENDING_STALE_TIME,
	fetchTrendingBooks,
	lookupBookByIsbn,
	openLibraryCoverUrl,
	openLibraryKeys,
	searchBooks,
	type BookSearchPage,
	type BookSearchResult,
} from '$lib/services/openLibraryApi';

const eastOfEden: BookSearchResult = {
	workKey: 'OL23166W',
	title: 'East of Eden',
	authorName: ['John Steinbeck'],
	coverId: 11386937,
	firstPublishYear: 1952,
	pageCountMedian: 611,
	subjects: ['Fiction', 'Family'],
	ratingsAverage: 4.1,
	ratingsCount: 100,
	editionCount: 65,
	url: 'https://openlibrary.org/works/OL23166W',
};

const page: BookSearchPage = { items: [eastOfEden], page: 1, totalPages: 3, totalResults: 51 };

describe('openLibraryApi', () => {
	beforeEach(() => {
		mocks.graphqlRequest.mockReset();
	});

	describe('searchBooks', () => {
		it('sends the query and page to the bookSearch operation and returns its page', async () => {
			mocks.graphqlRequest.mockResolvedValue({ bookSearch: page });

			const result = await searchBooks('east of eden', 2);

			expect(mocks.graphqlRequest).toHaveBeenCalledWith(BOOK_SEARCH, { query: 'east of eden', page: 2 });
			expect(result).toEqual(page);
		});

		it('defaults to page 1', async () => {
			mocks.graphqlRequest.mockResolvedValue({ bookSearch: page });

			await searchBooks('east of eden');

			expect(mocks.graphqlRequest).toHaveBeenCalledWith(BOOK_SEARCH, { query: 'east of eden', page: 1 });
		});

		it('lets errors through unchanged so the caller can classify them', async () => {
			const error = new TypeError('Failed to fetch');
			mocks.graphqlRequest.mockRejectedValue(error);

			await expect(searchBooks('east', 1)).rejects.toBe(error);
		});
	});

	describe('fetchTrendingBooks', () => {
		it('sends the window and page to the bookTrending operation and returns its page', async () => {
			mocks.graphqlRequest.mockResolvedValue({ bookTrending: page });

			const result = await fetchTrendingBooks('DAY', 2);

			expect(mocks.graphqlRequest).toHaveBeenCalledWith(BOOK_TRENDING, { window: 'DAY', page: 2 });
			expect(result).toEqual(page);
		});

		it('defaults to the WEEK window and page 1', async () => {
			mocks.graphqlRequest.mockResolvedValue({ bookTrending: page });

			await fetchTrendingBooks();

			expect(mocks.graphqlRequest).toHaveBeenCalledWith(BOOK_TRENDING, { window: 'WEEK', page: 1 });
		});

		it('lets errors through unchanged so the caller can classify them', async () => {
			const error = new TypeError('Failed to fetch');
			mocks.graphqlRequest.mockRejectedValue(error);

			await expect(fetchTrendingBooks('WEEK', 1)).rejects.toBe(error);
		});
	});

	describe('lookupBookByIsbn', () => {
		it('sends the ISBN to the bookByISBN operation and returns the work', async () => {
			mocks.graphqlRequest.mockResolvedValue({ bookByISBN: eastOfEden });

			const result = await lookupBookByIsbn('9780434740024');

			expect(mocks.graphqlRequest).toHaveBeenCalledWith(BOOK_BY_ISBN, { isbn: '9780434740024' });
			expect(result).toEqual(eastOfEden);
		});

		it('returns null when the server has no record for the ISBN', async () => {
			mocks.graphqlRequest.mockResolvedValue({ bookByISBN: null });

			await expect(lookupBookByIsbn('9780434740024')).resolves.toBeNull();
		});
	});

	describe('GraphQL documents', () => {
		it.each([
			['BOOK_SEARCH', BOOK_SEARCH, 'bookSearch(query: $query, page: $page)'],
			['BOOK_TRENDING', BOOK_TRENDING, 'bookTrending(window: $window, page: $page)'],
			['BOOK_BY_ISBN', BOOK_BY_ISBN, 'bookByISBN(isbn: $isbn)'],
		])('%s calls its field with the right variables', (_name, doc, fragment) => {
			expect(doc).toContain(fragment);
		});

		it.each([
			'workKey',
			'title',
			'authorName',
			'coverId',
			'firstPublishYear',
			'pageCountMedian',
			'subjects',
			'ratingsAverage',
			'ratingsCount',
			'editionCount',
			'url',
		])('every result document selects %s', (field) => {
			for (const doc of [BOOK_SEARCH, BOOK_TRENDING, BOOK_BY_ISBN]) {
				expect(doc).toContain(field);
			}
		});

		it('pages select the page envelope', () => {
			for (const doc of [BOOK_SEARCH, BOOK_TRENDING]) {
				expect(doc).toContain('totalPages');
				expect(doc).toContain('totalResults');
			}
		});
	});

	describe('openLibraryCoverUrl', () => {
		it('builds the medium cover URL by default', () => {
			expect(openLibraryCoverUrl(11386937)).toBe('https://covers.openlibrary.org/b/id/11386937-M.jpg');
		});

		it('honours an explicit size', () => {
			expect(openLibraryCoverUrl(11386937, 'S')).toBe('https://covers.openlibrary.org/b/id/11386937-S.jpg');
			expect(openLibraryCoverUrl(11386937, 'L')).toBe('https://covers.openlibrary.org/b/id/11386937-L.jpg');
		});

		it.each([null, undefined])('returns null when the work has no cover (%j)', (coverId) => {
			expect(openLibraryCoverUrl(coverId)).toBeNull();
		});
	});

	describe('openLibraryKeys', () => {
		it('is distinct per search query and page', () => {
			expect(openLibraryKeys.search('east', 1)).not.toEqual(openLibraryKeys.search('west', 1));
			expect(openLibraryKeys.search('east', 1)).not.toEqual(openLibraryKeys.search('east', 2));
		});

		it('is distinct per trending window and page', () => {
			expect(openLibraryKeys.trending('DAY', 1)).not.toEqual(openLibraryKeys.trending('WEEK', 1));
			expect(openLibraryKeys.trending('WEEK', 1)).not.toEqual(openLibraryKeys.trending('WEEK', 2));
		});

		it('is distinct per ISBN', () => {
			expect(openLibraryKeys.isbn('9780434740024')).not.toEqual(openLibraryKeys.isbn('9780434740031'));
		});

		it('keeps every key under the openlibrary root', () => {
			for (const key of [
				openLibraryKeys.search('east', 1),
				openLibraryKeys.trending('WEEK', 1),
				openLibraryKeys.isbn('9780434740024'),
			]) {
				expect(key.slice(0, 1)).toEqual(openLibraryKeys.all);
			}
		});
	});

	describe('constants', () => {
		it('use the planned search limits, debounce and cache windows', () => {
			expect(BOOK_SEARCH_MIN_LENGTH).toBe(2);
			expect(BOOK_SEARCH_MAX_LENGTH).toBe(100);
			expect(BOOK_SEARCH_DEBOUNCE_MS).toBe(350);
			expect(BOOK_SEARCH_STALE_TIME).toBe(10 * 60 * 1000);
			expect(BOOK_TRENDING_STALE_TIME).toBe(30 * 60 * 1000);
		});
	});
});
