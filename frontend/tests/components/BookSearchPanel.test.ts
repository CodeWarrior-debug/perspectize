import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { tick, type Component } from 'svelte';
import BookSearchPanel from '$lib/components/discover/BookSearchPanel.svelte';
import TestWrapper from '../helpers/TestWrapper.svelte';
import { makeClient } from '../helpers/queryBudget';

vi.mock('$lib/queries/users/useMe.svelte', () => ({ useMe: () => ({ me: null }) }));
import {
	BOOK_SEARCH,
	BOOK_SEARCH_DEBOUNCE_MS,
	BOOK_TRENDING,
	type BookSearchPage,
	type BookSearchResult,
} from '$lib/services/openLibraryApi';

const mocks = vi.hoisted(() => ({ graphqlRequest: vi.fn() }));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: mocks.graphqlRequest }));

const INPUT_NAME = /search books by title or author/i;
const EAST_OF_EDEN_URL = 'https://openlibrary.org/works/OL1W';

function book(id: number, title: string): BookSearchResult {
	return {
		workKey: `OL${id}W`,
		title,
		authorName: ['An Author'],
		coverId: null,
		firstPublishYear: 1999,
		pageCountMedian: 300,
		subjects: [],
		ratingsAverage: 4,
		ratingsCount: 10,
		editionCount: 2,
		url: `https://openlibrary.org/works/OL${id}W`,
	};
}

function bookPage(overrides: Partial<BookSearchPage>): BookSearchPage {
	return { items: [book(1, 'East of Eden')], page: 1, totalPages: 1, totalResults: 1, ...overrides };
}

const EMPTY_PAGE = bookPage({ items: [], totalPages: 0, totalResults: 0 });

/** Advance the fake clock by `ms`, then flush the query fetch and Svelte's update. */
async function settle(ms = 0) {
	await vi.advanceTimersByTimeAsync(ms);
	await flush();
}

/** Let pending promises and zero-delay timers settle under fake timers. */
async function flush() {
	for (let i = 0; i < 5; i++) {
		await vi.advanceTimersByTimeAsync(0);
		await tick();
	}
}

/** Calls made for one GraphQL document. The trending feed also calls the client while idle. */
function callsFor(document: string) {
	return mocks.graphqlRequest.mock.calls.filter(([doc]) => doc === document);
}

/** Route each GraphQL document to its responder. */
function respondWith(
	search: (variables: { query: string; page: number }) => unknown,
	trending: (variables: { window: string; page: number }) => unknown = () => ({ bookTrending: EMPTY_PAGE }),
) {
	mocks.graphqlRequest.mockImplementation(async (doc: string, variables: never) =>
		doc === BOOK_TRENDING ? trending(variables) : search(variables),
	);
}

function renderPanel(overrides: Record<string, unknown> = {}) {
	const props = {
		library: new Map(),
		onAdd: vi.fn(),
		...overrides,
	};
	// TestWrapper types `component` as a propless Component; the panel's props are passed via `props`.
	const component = BookSearchPanel as unknown as Component;
	render(TestWrapper, { props: { queryClient: makeClient(), component, props } });
	return props;
}

function searchInput() {
	return screen.getByRole('textbox', { name: INPUT_NAME }) as HTMLInputElement;
}

async function typeText(text: string) {
	await fireEvent.input(searchInput(), { target: { value: text } });
	await tick();
}

describe('BookSearchPanel', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		mocks.graphqlRequest.mockReset();
		respondWith(() => ({ bookSearch: bookPage({}) }));
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	describe('debounced search', () => {
		it('sends one search after the 350 ms pause, not before', async () => {
			renderPanel();
			await settle();
			mocks.graphqlRequest.mockClear();

			await typeText('eden');
			await settle(BOOK_SEARCH_DEBOUNCE_MS - 1);
			expect(callsFor(BOOK_SEARCH)).toHaveLength(0);

			await settle(1);
			expect(callsFor(BOOK_SEARCH)).toHaveLength(1);
			expect(mocks.graphqlRequest).toHaveBeenCalledWith(BOOK_SEARCH, { query: 'eden', page: 1 });
			expect(screen.getByRole('link', { name: 'East of Eden' })).toBeInTheDocument();
		});

		it('collapses a burst of keystrokes into one call with the last term', async () => {
			renderPanel();
			await settle();
			mocks.graphqlRequest.mockClear();

			for (const partial of ['e', 'ea', 'eas', 'east']) {
				await typeText(partial);
				await settle(100);
			}
			await settle(BOOK_SEARCH_DEBOUNCE_MS);

			expect(callsFor(BOOK_SEARCH)).toHaveLength(1);
			expect(mocks.graphqlRequest).toHaveBeenCalledWith(BOOK_SEARCH, { query: 'east', page: 1 });
		});

		it('never searches under 2 characters', async () => {
			renderPanel();

			await typeText('e');
			await settle(5000);

			expect(callsFor(BOOK_SEARCH)).toHaveLength(0);
			expect(screen.getByText('Type at least 2 characters to search.')).toBeInTheDocument();
		});

		it('trims surrounding spaces before searching', async () => {
			renderPanel();

			await typeText('  eden  ');
			await settle(BOOK_SEARCH_DEBOUNCE_MS);

			expect(mocks.graphqlRequest).toHaveBeenCalledWith(BOOK_SEARCH, { query: 'eden', page: 1 });
		});

		it('shows the loading skeleton while the first page is in flight', async () => {
			respondWith(() => new Promise(() => {}));
			renderPanel();

			await typeText('eden');
			await settle(BOOK_SEARCH_DEBOUNCE_MS);

			expect(document.querySelector('[aria-label="Searching books"]')).toBeInTheDocument();
		});

		it('goes straight from the idle prompt to the skeleton during the debounce pause', async () => {
			renderPanel();
			await settle();

			await typeText('eden');
			await settle(BOOK_SEARCH_DEBOUNCE_MS - 1);

			expect(callsFor(BOOK_SEARCH)).toHaveLength(0);
			expect(document.querySelector('[aria-label="Searching books"]')).toBeInTheDocument();
			expect(screen.queryByText('Search Open Library for a book to add it to Perspectize.')).not.toBeInTheDocument();
		});
	});

	describe('results', () => {
		it('renders a card per result and marks tracked books In Library', async () => {
			respondWith(() => ({
				bookSearch: bookPage({ items: [book(1, 'East of Eden'), book(2, 'Brainscan')], totalPages: 1 }),
			}));
			renderPanel({ library: new Map([[EAST_OF_EDEN_URL, { id: '7', name: 'Tracked' }]]) });

			await typeText('eden');
			await settle(BOOK_SEARCH_DEBOUNCE_MS);

			expect(screen.getByRole('link', { name: 'Brainscan' })).toBeInTheDocument();
			expect(screen.getAllByTestId('library-status')).toHaveLength(1);
			expect(screen.getAllByRole('button', { name: 'Add to Perspectize' })).toHaveLength(1);
		});

		it('passes the card url to onAdd', async () => {
			const props = renderPanel();

			await typeText('eden');
			await settle(BOOK_SEARCH_DEBOUNCE_MS);
			await fireEvent.click(screen.getByRole('button', { name: 'Add to Perspectize' }));

			expect(props.onAdd).toHaveBeenCalledWith(book(1, 'East of Eden').url);
		});

		it('shows the no-results message for a term with no matches', async () => {
			respondWith(() => ({ bookSearch: EMPTY_PAGE }));
			renderPanel();

			await typeText('zzqx');
			await settle(BOOK_SEARCH_DEBOUNCE_MS);

			expect(screen.getByText("No books found for 'zzqx'")).toBeInTheDocument();
		});

		it('shows the Open Library attribution in the footer', () => {
			renderPanel();

			expect(screen.getByText('Book data from Open Library (archive.org)')).toBeInTheDocument();
		});
	});

	describe('Load More', () => {
		it('accumulates the next page and hides Load More on the last page', async () => {
			respondWith((variables) => ({
				bookSearch:
					variables.page === 1
						? bookPage({ items: [book(1, 'East of Eden')], page: 1, totalPages: 2, totalResults: 2 })
						: bookPage({ items: [book(2, 'Brainscan')], page: 2, totalPages: 2, totalResults: 2 }),
			}));
			renderPanel();

			await typeText('eden');
			await settle(BOOK_SEARCH_DEBOUNCE_MS);
			await fireEvent.click(screen.getByRole('button', { name: 'Load More' }));
			await settle();

			expect(mocks.graphqlRequest).toHaveBeenLastCalledWith(BOOK_SEARCH, { query: 'eden', page: 2 });
			expect(screen.getByRole('link', { name: 'Brainscan' })).toBeInTheDocument();
			expect(screen.getByRole('link', { name: 'East of Eden' })).toBeInTheDocument();
			expect(screen.queryByRole('button', { name: 'Load More' })).not.toBeInTheDocument();
		});

		it('shows an inline error when the next page fails and keeps the first page', async () => {
			respondWith(async (variables) => {
				if (variables.page === 2) throw new Error('boom');
				return { bookSearch: bookPage({ totalPages: 2, totalResults: 2 }) };
			});
			renderPanel();

			await typeText('eden');
			await settle(BOOK_SEARCH_DEBOUNCE_MS);
			await fireEvent.click(screen.getByRole('button', { name: 'Load More' }));
			await settle();

			expect(screen.getByText('Could not load more books. Try again in a moment.')).toBeInTheDocument();
			expect(screen.getByRole('link', { name: 'East of Eden' })).toBeInTheDocument();
		});
	});

	describe('errors', () => {
		it('shows the generic message with a Retry that searches again', async () => {
			let attempts = 0;
			respondWith(async () => {
				attempts += 1;
				if (attempts === 1) throw new Error('book search is unavailable right now');
				return { bookSearch: bookPage({}) };
			});
			renderPanel();

			await typeText('eden');
			await settle(BOOK_SEARCH_DEBOUNCE_MS);

			expect(screen.getByText('Book search is unavailable right now.')).toBeInTheDocument();
			await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
			await settle();

			expect(callsFor(BOOK_SEARCH)).toHaveLength(2);
			expect(screen.getByRole('link', { name: 'East of Eden' })).toBeInTheDocument();
		});

		it('shows the connection message for a network failure', async () => {
			respondWith(async () => {
				throw new TypeError('Failed to fetch');
			});
			renderPanel();

			await typeText('eden');
			await settle(BOOK_SEARCH_DEBOUNCE_MS);

			expect(screen.getByText('Unable to reach Perspectize. Check your connection.')).toBeInTheDocument();
		});
	});

	describe('trending feed', () => {
		const DUNE = book(10, 'Dune');
		const EDEN = book(11, 'Brainscan');

		it('shows trending books with the idle prompt when the box is empty', async () => {
			respondWith(
				() => ({ bookSearch: bookPage({}) }),
				() => ({ bookTrending: bookPage({ items: [DUNE, EDEN] }) }),
			);
			renderPanel();
			await settle();

			expect(screen.getByText('Search Open Library for a book to add it to Perspectize.')).toBeInTheDocument();
			expect(screen.getByText('Trending books')).toBeInTheDocument();
			expect(screen.getByRole('link', { name: 'Dune' })).toBeInTheDocument();
			expect(screen.getByRole('link', { name: 'Brainscan' })).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'This week' })).toHaveAttribute('aria-pressed', 'true');
			expect(callsFor(BOOK_SEARCH)).toHaveLength(0);
		});

		it('keeps the 2-character hint and the trending feed visible with one character typed', async () => {
			respondWith(
				() => ({ bookSearch: bookPage({}) }),
				() => ({ bookTrending: bookPage({ items: [DUNE] }) }),
			);
			renderPanel();
			await settle();

			await typeText('d');
			await settle(BOOK_SEARCH_DEBOUNCE_MS);

			expect(screen.getByText('Type at least 2 characters to search.')).toBeInTheDocument();
			expect(screen.getByRole('link', { name: 'Dune' })).toBeInTheDocument();
			expect(callsFor(BOOK_SEARCH)).toHaveLength(0);
		});

		it('hides trending once a search is active and makes no trending call while searching', async () => {
			respondWith(
				() => ({ bookSearch: bookPage({}) }),
				() => ({ bookTrending: bookPage({ items: [DUNE] }) }),
			);
			renderPanel();
			await settle();
			mocks.graphqlRequest.mockClear();

			await typeText('eden');
			await settle(BOOK_SEARCH_DEBOUNCE_MS);

			expect(screen.queryByText('Trending books')).not.toBeInTheDocument();
			expect(screen.getByRole('link', { name: 'East of Eden' })).toBeInTheDocument();
			expect(callsFor(BOOK_TRENDING)).toHaveLength(0);
			expect(callsFor(BOOK_SEARCH)).toHaveLength(1);
		});

		it('shows the verbatim trending note', async () => {
			renderPanel();
			await settle();

			expect(
				screen.getByText("What's being looked up on Open Library right now — skews toward current nonfiction"),
			).toBeInTheDocument();
		});

		it('adds a trending book that is not yet in the library by its url', async () => {
			respondWith(
				() => ({ bookSearch: bookPage({}) }),
				() => ({ bookTrending: bookPage({ items: [DUNE, EDEN] }) }),
			);
			const props = renderPanel({ library: new Map([[DUNE.url, { id: '7', name: 'Tracked' }]]) });
			await settle();

			expect(screen.getAllByTestId('library-status')).toHaveLength(1);
			await fireEvent.click(screen.getByRole('button', { name: 'Add to Perspectize' }));

			expect(props.onAdd).toHaveBeenCalledWith(EDEN.url);
		});
	});

	describe('input', () => {
		it('clears the input with the clear button and refocuses it', async () => {
			renderPanel();

			await typeText('eden');
			await fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));

			expect(searchInput()).toHaveValue('');
			expect(document.activeElement).toBe(searchInput());
		});

		it('caps the input at the backend limit of 100 characters', () => {
			renderPanel();

			expect(searchInput()).toHaveAttribute('maxlength', '100');
		});
	});
});
