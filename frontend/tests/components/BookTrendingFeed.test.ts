import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { tick, type Component } from 'svelte';
import BookTrendingFeed from '$lib/components/discover/BookTrendingFeed.svelte';
import TestWrapper from '../helpers/TestWrapper.svelte';
import { makeClient } from '../helpers/queryBudget';
import { BOOK_TRENDING, type BookSearchPage, type BookSearchResult } from '$lib/services/openLibraryApi';

const mocks = vi.hoisted(() => ({ graphqlRequest: vi.fn() }));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: mocks.graphqlRequest }));

const TRENDING_NOTE = "What's being looked up on Open Library right now — skews toward current nonfiction";

function book(id: number, title: string): BookSearchResult {
	return {
		workKey: `OL${id}W`,
		title,
		authorName: [],
		coverId: null,
		firstPublishYear: 2001,
		pageCountMedian: null,
		subjects: [],
		ratingsAverage: null,
		ratingsCount: null,
		editionCount: null,
		wantToReadCount: null,
		currentlyReadingCount: null,
		alreadyReadCount: null,
		readingLogCount: null,
		url: `https://openlibrary.org/works/OL${id}W`,
	};
}

function bookPage(overrides: Partial<BookSearchPage>): BookSearchPage {
	return { items: [book(1, 'Dune')], page: 1, totalPages: 1, totalResults: 1, ...overrides };
}

/** Advance the fake clock, then flush the query fetch and Svelte's update. */
async function settle(ms = 0) {
	await vi.advanceTimersByTimeAsync(ms);
	for (let i = 0; i < 5; i++) {
		await vi.advanceTimersByTimeAsync(0);
		await tick();
	}
}

function callsFor(document: string) {
	return mocks.graphqlRequest.mock.calls.filter(([doc]) => doc === document);
}

function respondWith(trending: (variables: { window: string; page: number }) => unknown) {
	mocks.graphqlRequest.mockImplementation(async (_doc: string, variables: never) => trending(variables));
}

function renderFeed(overrides: Record<string, unknown> = {}) {
	const props = { libraryUrls: new Set<string>(), onAdd: vi.fn(), ...overrides };
	const component = BookTrendingFeed as unknown as Component;
	render(TestWrapper, { props: { queryClient: makeClient(), component, props } });
	return props;
}

describe('BookTrendingFeed', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		mocks.graphqlRequest.mockReset();
		respondWith(() => ({ bookTrending: bookPage({}) }));
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('shows the trending heading, the verbatim note and the window toggle with This week selected', async () => {
		renderFeed();
		await settle();

		expect(screen.getByText('Trending books')).toBeInTheDocument();
		expect(screen.getByText(TRENDING_NOTE)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'This week' })).toHaveAttribute('aria-pressed', 'true');
		expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'false');
	});

	it('renders the trending books and marks the ones in the library', async () => {
		respondWith(() => ({ bookTrending: bookPage({ items: [book(1, 'Dune'), book(2, 'Brainscan')] }) }));
		renderFeed({ libraryUrls: new Set([book(1, 'Dune').url]) });
		await settle();

		expect(screen.getByRole('link', { name: 'Dune' })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Brainscan' })).toBeInTheDocument();
		expect(screen.getAllByRole('button', { name: 'In Library' })).toHaveLength(1);
	});

	it('passes the url of a book to onAdd when its Add is clicked', async () => {
		respondWith(() => ({ bookTrending: bookPage({ items: [book(2, 'Brainscan')] }) }));
		const props = renderFeed();
		await settle();

		await fireEvent.click(screen.getByRole('button', { name: 'Add to Perspectize' }));

		expect(props.onAdd).toHaveBeenCalledWith(book(2, 'Brainscan').url);
	});

	it('refetches with DAY when Today is chosen and shows that window', async () => {
		respondWith((variables) => ({
			bookTrending: bookPage({ items: [variables.window === 'DAY' ? book(3, 'Day Pick') : book(1, 'Dune')] }),
		}));
		renderFeed();
		await settle();

		await fireEvent.click(screen.getByRole('button', { name: 'Today' }));
		await settle();

		expect(mocks.graphqlRequest).toHaveBeenLastCalledWith(BOOK_TRENDING, { window: 'DAY', page: 1 });
		expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true');
		expect(screen.getByRole('link', { name: 'Day Pick' })).toBeInTheDocument();
		expect(screen.queryByRole('link', { name: 'Dune' })).not.toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'This week' }));
		await settle();

		// Back to This week is still fresh in the cache: no third call.
		expect(screen.getByRole('link', { name: 'Dune' })).toBeInTheDocument();
		expect(callsFor(BOOK_TRENDING)).toHaveLength(2);
	});

	it('accumulates the next page and drops it when the window changes', async () => {
		respondWith((variables) => {
			if (variables.window === 'DAY') return { bookTrending: bookPage({ items: [book(3, 'Day Pick')] }) };
			return variables.page === 1
				? { bookTrending: bookPage({ items: [book(1, 'Dune')], page: 1, totalPages: 2, totalResults: 2 }) }
				: { bookTrending: bookPage({ items: [book(4, 'Heat')], page: 2, totalPages: 2, totalResults: 2 }) };
		});
		renderFeed();
		await settle();

		await fireEvent.click(screen.getByRole('button', { name: 'Load More' }));
		await settle();

		expect(mocks.graphqlRequest).toHaveBeenLastCalledWith(BOOK_TRENDING, { window: 'WEEK', page: 2 });
		expect(screen.getByRole('link', { name: 'Dune' })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Heat' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Load More' })).not.toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Today' }));
		await settle();

		expect(screen.getByRole('link', { name: 'Day Pick' })).toBeInTheDocument();
		expect(screen.queryByRole('link', { name: 'Heat' })).not.toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'This week' }));
		await settle();

		expect(screen.getByRole('link', { name: 'Dune' })).toBeInTheDocument();
		expect(screen.queryByRole('link', { name: 'Heat' })).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Load More' })).toBeInTheDocument();
	});

	it('shows an inline error when the next page fails and keeps the first page', async () => {
		respondWith(async (variables) => {
			if (variables.page === 2) throw new Error('boom');
			return { bookTrending: bookPage({ totalPages: 2, totalResults: 2 }) };
		});
		renderFeed();
		await settle();

		await fireEvent.click(screen.getByRole('button', { name: 'Load More' }));
		await settle();

		expect(screen.getByText('Could not load more trending books. Try again in a moment.')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Dune' })).toBeInTheDocument();
	});

	it('shows the trending error with a Retry that loads the feed again', async () => {
		let attempts = 0;
		respondWith(async () => {
			attempts += 1;
			if (attempts === 1) throw new Error('trending is down');
			return { bookTrending: bookPage({ items: [book(1, 'Dune')] }) };
		});
		renderFeed();
		await settle();

		expect(screen.getByText('Trending books are unavailable right now.')).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
		await settle();

		expect(screen.getByRole('link', { name: 'Dune' })).toBeInTheDocument();
		expect(callsFor(BOOK_TRENDING)).toHaveLength(2);
	});

	it('shows the connection message for a trending network failure', async () => {
		respondWith(async () => {
			throw new TypeError('Failed to fetch');
		});
		renderFeed();
		await settle();

		expect(screen.getByText('Unable to reach Perspectize. Check your connection.')).toBeInTheDocument();
	});

	it('shows a loading skeleton while the first trending page is in flight', async () => {
		respondWith(() => new Promise(() => {}));
		renderFeed();
		await settle();

		expect(document.querySelector('[aria-label="Loading trending books"]')).toBeInTheDocument();
	});

	it('shows the empty message when Open Library has no trending books', async () => {
		respondWith(() => ({ bookTrending: bookPage({ items: [], totalPages: 0, totalResults: 0 }) }));
		renderFeed();
		await settle();

		expect(screen.getByText('No trending books right now.')).toBeInTheDocument();
	});
});
