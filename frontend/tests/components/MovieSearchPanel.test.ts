import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { tick, type Component } from 'svelte';
import MovieSearchPanel from '$lib/components/discover/MovieSearchPanel.svelte';
import TestWrapper from '../helpers/TestWrapper.svelte';
import { makeClient } from '../helpers/queryBudget';
import { MOVIE_SEARCH, MOVIE_SEARCH_DEBOUNCE_MS, type MovieSearchPage } from '$lib/services/tmdbApi';

const mocks = vi.hoisted(() => ({ graphqlRequest: vi.fn() }));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: mocks.graphqlRequest }));

const INPUT_NAME = /search movies by title/i;
const TMDB_LINK = 'https://www.themoviedb.org/movie/603';

function movie(id: number, title: string) {
	return {
		tmdbId: id,
		title,
		releaseDate: '1999-03-31',
		overview: `${title} overview`,
		posterPath: null,
		voteAverage: 7.5,
		url: `https://www.themoviedb.org/movie/${id}`,
	};
}

function movieSearchPage(overrides: Partial<MovieSearchPage>): MovieSearchPage {
	return { items: [movie(603, 'The Matrix')], page: 1, totalPages: 1, totalResults: 1, ...overrides };
}

/** Advance the fake clock by `ms`, then flush the query fetch and Svelte's update. */
async function settle(ms = 0) {
	await vi.advanceTimersByTimeAsync(ms);
	await flush();
}

/**
 * Let pending promises and zero-delay timers settle. `findBy*` polls on timers
 * that fake timers freeze, so tests under fake timers assert with getBy* after this.
 */
async function flush() {
	for (let i = 0; i < 5; i++) {
		await vi.advanceTimersByTimeAsync(0);
		await tick();
	}
}

function renderPanel(overrides: Record<string, unknown> = {}) {
	const props = {
		libraryUrls: new Set<string>(),
		onAdd: vi.fn(),
		onAddUrl: vi.fn(),
		...overrides,
	};
	// TestWrapper types `component` as a propless Component; the panel's props are passed via `props`.
	const component = MovieSearchPanel as unknown as Component;
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

describe('MovieSearchPanel', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		mocks.graphqlRequest.mockReset();
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	describe('debounced search', () => {
		it('sends one search after the 350 ms pause, not before', async () => {
			mocks.graphqlRequest.mockResolvedValue({ movieSearch: movieSearchPage({}) });
			renderPanel();

			await typeText('matrix');
			await settle(MOVIE_SEARCH_DEBOUNCE_MS - 1);
			expect(mocks.graphqlRequest).not.toHaveBeenCalled();

			await settle(1);
			expect(mocks.graphqlRequest).toHaveBeenCalledTimes(1);
			expect(mocks.graphqlRequest).toHaveBeenCalledWith(MOVIE_SEARCH, { query: 'matrix', page: 1 });
			expect(screen.getByRole('link', { name: 'The Matrix' })).toBeInTheDocument();
		});

		it('collapses a burst of keystrokes into one call with the last term', async () => {
			mocks.graphqlRequest.mockResolvedValue({ movieSearch: movieSearchPage({}) });
			renderPanel();

			for (const partial of ['m', 'ma', 'mat', 'matr', 'matri']) {
				await typeText(partial);
				await settle(100);
			}
			await settle(MOVIE_SEARCH_DEBOUNCE_MS);

			expect(mocks.graphqlRequest).toHaveBeenCalledTimes(1);
			expect(mocks.graphqlRequest).toHaveBeenCalledWith(MOVIE_SEARCH, { query: 'matri', page: 1 });
		});

		it('never searches under 2 characters', async () => {
			mocks.graphqlRequest.mockResolvedValue({ movieSearch: movieSearchPage({}) });
			renderPanel();

			await typeText('a');
			await settle(5000);

			expect(mocks.graphqlRequest).not.toHaveBeenCalled();
			expect(screen.getByText('Type at least 2 characters to search.')).toBeInTheDocument();
		});

		it('trims surrounding spaces before searching', async () => {
			mocks.graphqlRequest.mockResolvedValue({ movieSearch: movieSearchPage({}) });
			renderPanel();

			await typeText('  heat  ');
			await settle(MOVIE_SEARCH_DEBOUNCE_MS);

			expect(mocks.graphqlRequest).toHaveBeenCalledWith(MOVIE_SEARCH, { query: 'heat', page: 1 });
		});

		it('shows the loading skeleton while the first page is in flight', async () => {
			mocks.graphqlRequest.mockReturnValue(new Promise(() => {}));
			renderPanel();

			await typeText('matrix');
			await settle(MOVIE_SEARCH_DEBOUNCE_MS);

			expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
		});
	});

	describe('results', () => {
		it('renders a card per result and marks tracked movies In Library', async () => {
			mocks.graphqlRequest.mockResolvedValue({
				movieSearch: movieSearchPage({ items: [movie(603, 'The Matrix'), movie(949, 'Heat')], totalPages: 1 }),
			});
			renderPanel({ libraryUrls: new Set([TMDB_LINK]) });

			await typeText('matrix');
			await settle(MOVIE_SEARCH_DEBOUNCE_MS);

			expect(screen.getByRole('link', { name: 'Heat' })).toBeInTheDocument();
			expect(screen.getByRole('link', { name: 'The Matrix' })).toBeInTheDocument();
			expect(screen.getAllByRole('button', { name: 'In Library' })).toHaveLength(1);
			expect(screen.getAllByRole('button', { name: 'Add to Perspectize' })).toHaveLength(1);
		});

		it('passes the card url to onAdd', async () => {
			mocks.graphqlRequest.mockResolvedValue({ movieSearch: movieSearchPage({}) });
			const props = renderPanel();

			await typeText('matrix');
			await settle(MOVIE_SEARCH_DEBOUNCE_MS);
			await fireEvent.click(screen.getByRole('button', { name: 'Add to Perspectize' }));

			expect(props.onAdd).toHaveBeenCalledWith(TMDB_LINK);
		});

		it('shows the no-results message for a term with no matches', async () => {
			mocks.graphqlRequest.mockResolvedValue({
				movieSearch: movieSearchPage({ items: [], totalPages: 0, totalResults: 0 }),
			});
			renderPanel();

			await typeText('zzqx');
			await settle(MOVIE_SEARCH_DEBOUNCE_MS);

			expect(screen.getByText("No movies found for 'zzqx'")).toBeInTheDocument();
		});

		it('shows the TMDB attribution in the footer', () => {
			renderPanel();

			expect(screen.getByText('Movie data from TMDB')).toBeInTheDocument();
		});
	});

	describe('Load More', () => {
		it('accumulates the next page and hides Load More on the last page', async () => {
			mocks.graphqlRequest.mockImplementation(async (_doc: string, variables: { page: number }) => ({
				movieSearch:
					variables.page === 1
						? movieSearchPage({ items: [movie(603, 'The Matrix')], page: 1, totalPages: 2, totalResults: 2 })
						: movieSearchPage({ items: [movie(949, 'Heat')], page: 2, totalPages: 2, totalResults: 2 }),
			}));
			renderPanel();

			await typeText('matrix');
			await settle(MOVIE_SEARCH_DEBOUNCE_MS);
			await fireEvent.click(screen.getByRole('button', { name: 'Load More' }));
			await settle();

			expect(mocks.graphqlRequest).toHaveBeenLastCalledWith(MOVIE_SEARCH, { query: 'matrix', page: 2 });
			expect(screen.getByRole('link', { name: 'Heat' })).toBeInTheDocument();
			expect(screen.getByRole('link', { name: 'The Matrix' })).toBeInTheDocument();
			expect(screen.queryByRole('button', { name: 'Load More' })).not.toBeInTheDocument();
		});

		it('shows an inline error when the next page fails and keeps the first page', async () => {
			mocks.graphqlRequest.mockImplementation(async (_doc: string, variables: { page: number }) => {
				if (variables.page === 2) throw new Error('boom');
				return { movieSearch: movieSearchPage({ totalPages: 2, totalResults: 2 }) };
			});
			renderPanel();

			await typeText('matrix');
			await settle(MOVIE_SEARCH_DEBOUNCE_MS);
			await fireEvent.click(screen.getByRole('button', { name: 'Load More' }));
			await settle();

			expect(screen.getByText('Could not load more movies. Try again in a moment.')).toBeInTheDocument();
			expect(screen.getByRole('link', { name: 'The Matrix' })).toBeInTheDocument();
		});
	});

	describe('errors', () => {
		it('shows the generic message with a Retry that searches again', async () => {
			mocks.graphqlRequest.mockRejectedValueOnce(new Error('movie search is unavailable right now'));
			mocks.graphqlRequest.mockResolvedValueOnce({ movieSearch: movieSearchPage({}) });
			renderPanel();

			await typeText('matrix');
			await settle(MOVIE_SEARCH_DEBOUNCE_MS);

			expect(screen.getByText('Movie search is unavailable right now.')).toBeInTheDocument();
			await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
			await settle();

			expect(mocks.graphqlRequest).toHaveBeenCalledTimes(2);
			expect(screen.getByRole('link', { name: 'The Matrix' })).toBeInTheDocument();
		});

		it('shows the connection message for a network failure', async () => {
			mocks.graphqlRequest.mockRejectedValue(new TypeError('Failed to fetch'));
			renderPanel();

			await typeText('matrix');
			await settle(MOVIE_SEARCH_DEBOUNCE_MS);

			expect(screen.getByText('Unable to reach Perspectize. Check your connection.')).toBeInTheDocument();
		});
	});

	describe('pasted links', () => {
		it('offers a direct add for a TMDB link and never searches for it', async () => {
			const props = renderPanel();

			await typeText(TMDB_LINK);
			await settle(5000);

			expect(mocks.graphqlRequest).not.toHaveBeenCalled();
			await fireEvent.click(screen.getByRole('button', { name: 'Add to Perspectize' }));
			expect(props.onAddUrl).toHaveBeenCalledWith(TMDB_LINK);
		});

		it('accepts a bare IMDb id as a link', async () => {
			const props = renderPanel();

			await typeText('tt0133093');
			await settle(5000);

			expect(mocks.graphqlRequest).not.toHaveBeenCalled();
			await fireEvent.click(screen.getByRole('button', { name: 'Add to Perspectize' }));
			expect(props.onAddUrl).toHaveBeenCalledWith('tt0133093');
		});

		it('disables the link submit while any movie is being added', async () => {
			renderPanel({ pendingUrl: TMDB_LINK });

			await typeText(TMDB_LINK);

			expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled();
		});
	});

	describe('input', () => {
		it('clears the input with the clear button and refocuses it', async () => {
			renderPanel();

			await typeText('matrix');
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
