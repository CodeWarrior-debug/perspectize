import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { tick, type Component } from 'svelte';
import MovieSearchPanel from '$lib/components/discover/MovieSearchPanel.svelte';
import TestWrapper from '../helpers/TestWrapper.svelte';
import { makeClient } from '../helpers/queryBudget';
import { MOVIE_SEARCH, MOVIE_SEARCH_DEBOUNCE_MS, MOVIE_TRENDING, type MovieSearchPage } from '$lib/services/tmdbApi';

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

/** Calls made for one GraphQL document. The trending feed also calls the client while idle. */
function callsFor(document: string) {
	return mocks.graphqlRequest.mock.calls.filter(([doc]) => doc === document);
}

/**
 * Route each GraphQL document to its responder. The search responder gets the
 * variables; the trending responder gets `{ window, page }`.
 */
function respondWith(
	search: (variables: { query: string; page: number }) => unknown,
	trending: (variables: { window: string; page: number }) => unknown = () => ({
		movieTrending: movieSearchPage({ items: [], totalPages: 1, totalResults: 0 }),
	}),
) {
	mocks.graphqlRequest.mockImplementation(async (doc: string, variables: never) =>
		doc === MOVIE_TRENDING ? trending(variables) : search(variables),
	);
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
		respondWith(() => ({ movieSearch: movieSearchPage({}) }));
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

			await typeText('matrix');
			await settle(MOVIE_SEARCH_DEBOUNCE_MS - 1);
			expect(callsFor(MOVIE_SEARCH)).toHaveLength(0);

			await settle(1);
			expect(callsFor(MOVIE_SEARCH)).toHaveLength(1);
			expect(mocks.graphqlRequest).toHaveBeenCalledWith(MOVIE_SEARCH, { query: 'matrix', page: 1 });
			expect(screen.getByRole('link', { name: 'The Matrix' })).toBeInTheDocument();
		});

		it('collapses a burst of keystrokes into one call with the last term', async () => {
			renderPanel();
			await settle();
			mocks.graphqlRequest.mockClear();

			for (const partial of ['m', 'ma', 'mat', 'matr', 'matri']) {
				await typeText(partial);
				await settle(100);
			}
			await settle(MOVIE_SEARCH_DEBOUNCE_MS);

			expect(callsFor(MOVIE_SEARCH)).toHaveLength(1);
			expect(mocks.graphqlRequest).toHaveBeenCalledWith(MOVIE_SEARCH, { query: 'matri', page: 1 });
		});

		it('never searches under 2 characters', async () => {
			renderPanel();

			await typeText('a');
			await settle(5000);

			expect(callsFor(MOVIE_SEARCH)).toHaveLength(0);
			expect(screen.getByText('Type at least 2 characters to search.')).toBeInTheDocument();
		});

		it('trims surrounding spaces before searching', async () => {
			renderPanel();

			await typeText('  heat  ');
			await settle(MOVIE_SEARCH_DEBOUNCE_MS);

			expect(mocks.graphqlRequest).toHaveBeenCalledWith(MOVIE_SEARCH, { query: 'heat', page: 1 });
		});

		it('shows the loading skeleton while the first page is in flight', async () => {
			respondWith(() => new Promise(() => {}));
			renderPanel();

			await typeText('matrix');
			await settle(MOVIE_SEARCH_DEBOUNCE_MS);

			expect(document.querySelector('[aria-label="Searching movies"]')).toBeInTheDocument();
		});

		it('goes straight from the idle prompt to the skeleton during the debounce pause', async () => {
			renderPanel();
			await settle();

			await typeText('matrix');
			await settle(MOVIE_SEARCH_DEBOUNCE_MS - 1);

			expect(callsFor(MOVIE_SEARCH)).toHaveLength(0);
			expect(document.querySelector('[aria-label="Searching movies"]')).toBeInTheDocument();
			expect(screen.queryByText('Search TMDB for a movie to add it to Perspectize.')).not.toBeInTheDocument();
		});
	});

	describe('results', () => {
		it('renders a card per result and marks tracked movies In Library', async () => {
			respondWith(() => ({
				movieSearch: movieSearchPage({ items: [movie(603, 'The Matrix'), movie(949, 'Heat')], totalPages: 1 }),
			}));
			renderPanel({ libraryUrls: new Set([TMDB_LINK]) });

			await typeText('matrix');
			await settle(MOVIE_SEARCH_DEBOUNCE_MS);

			expect(screen.getByRole('link', { name: 'Heat' })).toBeInTheDocument();
			expect(screen.getByRole('link', { name: 'The Matrix' })).toBeInTheDocument();
			expect(screen.getAllByRole('button', { name: 'In Library' })).toHaveLength(1);
			expect(screen.getAllByRole('button', { name: 'Add to Perspectize' })).toHaveLength(1);
		});

		it('passes the card url to onAdd', async () => {
			const props = renderPanel();

			await typeText('matrix');
			await settle(MOVIE_SEARCH_DEBOUNCE_MS);
			await fireEvent.click(screen.getByRole('button', { name: 'Add to Perspectize' }));

			expect(props.onAdd).toHaveBeenCalledWith(TMDB_LINK);
		});

		it('shows the no-results message for a term with no matches', async () => {
			respondWith(() => ({
				movieSearch: movieSearchPage({ items: [], totalPages: 0, totalResults: 0 }),
			}));
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
			respondWith((variables) => ({
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
			respondWith(async (variables) => {
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
			let attempts = 0;
			respondWith(async () => {
				attempts += 1;
				if (attempts === 1) throw new Error('movie search is unavailable right now');
				return { movieSearch: movieSearchPage({}) };
			});
			renderPanel();

			await typeText('matrix');
			await settle(MOVIE_SEARCH_DEBOUNCE_MS);

			expect(screen.getByText('Movie search is unavailable right now.')).toBeInTheDocument();
			await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
			await settle();

			expect(callsFor(MOVIE_SEARCH)).toHaveLength(2);
			expect(screen.getByRole('link', { name: 'The Matrix' })).toBeInTheDocument();
		});

		it('shows the connection message for a network failure', async () => {
			respondWith(async () => {
				throw new TypeError('Failed to fetch');
			});
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

			expect(callsFor(MOVIE_SEARCH)).toHaveLength(0);
			await fireEvent.click(screen.getByRole('button', { name: 'Add to Perspectize' }));
			expect(props.onAddUrl).toHaveBeenCalledWith(TMDB_LINK);
		});

		it('accepts a bare IMDb id as a link', async () => {
			const props = renderPanel();

			await typeText('tt0133093');
			await settle(5000);

			expect(callsFor(MOVIE_SEARCH)).toHaveLength(0);
			await fireEvent.click(screen.getByRole('button', { name: 'Add to Perspectize' }));
			expect(props.onAddUrl).toHaveBeenCalledWith('tt0133093');
		});

		it('hides trending while a pasted link is shown', async () => {
			respondWith(
				() => ({ movieSearch: movieSearchPage({}) }),
				() => ({ movieTrending: movieSearchPage({ items: [movie(949, 'Heat')] }) }),
			);
			renderPanel();
			await settle();
			expect(screen.getByRole('link', { name: 'Heat' })).toBeInTheDocument();

			await typeText(TMDB_LINK);
			await settle();

			expect(screen.queryByText('Trending movies')).not.toBeInTheDocument();
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

	describe('trending feed', () => {
		const DUNE = movie(1, 'Dune');
		const OPPENHEIMER = movie(2, 'Oppenheimer');

		it('shows trending movies with the idle prompt when the box is empty', async () => {
			respondWith(
				() => ({ movieSearch: movieSearchPage({}) }),
				() => ({ movieTrending: movieSearchPage({ items: [DUNE, OPPENHEIMER] }) }),
			);
			renderPanel();
			await settle();

			expect(screen.getByText('Search TMDB for a movie to add it to Perspectize.')).toBeInTheDocument();
			expect(screen.getByText('Trending movies')).toBeInTheDocument();
			expect(screen.getByRole('link', { name: 'Dune' })).toBeInTheDocument();
			expect(screen.getByRole('link', { name: 'Oppenheimer' })).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'This week' })).toHaveAttribute('aria-pressed', 'true');
			expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'false');
			expect(callsFor(MOVIE_SEARCH)).toHaveLength(0);
		});

		it('keeps the 2-character hint and the trending feed visible with one character typed', async () => {
			respondWith(
				() => ({ movieSearch: movieSearchPage({}) }),
				() => ({ movieTrending: movieSearchPage({ items: [DUNE] }) }),
			);
			renderPanel();
			await settle();

			await typeText('d');
			await settle(MOVIE_SEARCH_DEBOUNCE_MS);

			expect(screen.getByText('Type at least 2 characters to search.')).toBeInTheDocument();
			expect(screen.getByRole('link', { name: 'Dune' })).toBeInTheDocument();
			expect(callsFor(MOVIE_SEARCH)).toHaveLength(0);
		});

		it('hides trending once a search is active and makes no trending call while searching', async () => {
			respondWith(
				() => ({ movieSearch: movieSearchPage({}) }),
				() => ({ movieTrending: movieSearchPage({ items: [DUNE] }) }),
			);
			renderPanel();
			await settle();
			mocks.graphqlRequest.mockClear();

			await typeText('matrix');
			await settle(MOVIE_SEARCH_DEBOUNCE_MS);

			expect(screen.queryByText('Trending movies')).not.toBeInTheDocument();
			expect(screen.getByRole('link', { name: 'The Matrix' })).toBeInTheDocument();
			expect(callsFor(MOVIE_TRENDING)).toHaveLength(0);
			expect(callsFor(MOVIE_SEARCH)).toHaveLength(1);
		});

		it('shows trending again from cache when the box is cleared, without a new call', async () => {
			respondWith(
				() => ({ movieSearch: movieSearchPage({}) }),
				() => ({ movieTrending: movieSearchPage({ items: [DUNE] }) }),
			);
			renderPanel();
			await settle();
			await typeText('matrix');
			await settle(MOVIE_SEARCH_DEBOUNCE_MS);
			mocks.graphqlRequest.mockClear();

			await fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
			await settle();

			expect(screen.getByRole('link', { name: 'Dune' })).toBeInTheDocument();
			expect(callsFor(MOVIE_TRENDING)).toHaveLength(0);
		});

		it('refetches with DAY when Today is chosen and shows that window', async () => {
			respondWith(
				() => ({ movieSearch: movieSearchPage({}) }),
				(variables) => ({
					movieTrending: movieSearchPage({ items: [variables.window === 'DAY' ? movie(3, 'Day Pick') : DUNE] }),
				}),
			);
			renderPanel();
			await settle();

			await fireEvent.click(screen.getByRole('button', { name: 'Today' }));
			await settle();

			expect(mocks.graphqlRequest).toHaveBeenLastCalledWith(MOVIE_TRENDING, { window: 'DAY', page: 1 });
			expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true');
			expect(screen.getByRole('link', { name: 'Day Pick' })).toBeInTheDocument();
			expect(screen.queryByRole('link', { name: 'Dune' })).not.toBeInTheDocument();

			await fireEvent.click(screen.getByRole('button', { name: 'This week' }));
			await settle();

			// Back to This week is still fresh in the cache: no third call.
			expect(screen.getByRole('link', { name: 'Dune' })).toBeInTheDocument();
			expect(callsFor(MOVIE_TRENDING)).toHaveLength(2);
		});

		it('keeps the chosen window across a search and back to idle', async () => {
			respondWith(
				() => ({ movieSearch: movieSearchPage({}) }),
				(variables) => ({
					movieTrending: movieSearchPage({ items: [variables.window === 'DAY' ? movie(3, 'Day Pick') : DUNE] }),
				}),
			);
			renderPanel();
			await settle();
			await fireEvent.click(screen.getByRole('button', { name: 'Today' }));
			await settle();

			await typeText('matrix');
			await settle(MOVIE_SEARCH_DEBOUNCE_MS);
			await fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
			await settle();

			expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true');
			expect(screen.getByRole('link', { name: 'Day Pick' })).toBeInTheDocument();
		});

		it('accumulates the next trending page and drops it when the window changes', async () => {
			respondWith(
				() => ({ movieSearch: movieSearchPage({}) }),
				(variables) => {
					if (variables.window === 'DAY') {
						return { movieTrending: movieSearchPage({ items: [movie(3, 'Day Pick')], totalPages: 1 }) };
					}
					return variables.page === 1
						? { movieTrending: movieSearchPage({ items: [DUNE], page: 1, totalPages: 2, totalResults: 2 }) }
						: {
								movieTrending: movieSearchPage({ items: [movie(4, 'Heat')], page: 2, totalPages: 2, totalResults: 2 }),
							};
				},
			);
			renderPanel();
			await settle();

			await fireEvent.click(screen.getByRole('button', { name: 'Load More' }));
			await settle();

			expect(mocks.graphqlRequest).toHaveBeenLastCalledWith(MOVIE_TRENDING, { window: 'WEEK', page: 2 });
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

		it('shows the trending error with a Retry that loads the feed again', async () => {
			let attempts = 0;
			respondWith(
				() => ({ movieSearch: movieSearchPage({}) }),
				async () => {
					attempts += 1;
					if (attempts === 1) throw new Error('trending is down');
					return { movieTrending: movieSearchPage({ items: [DUNE] }) };
				},
			);
			renderPanel();
			await settle();

			expect(screen.getByText('Trending movies are unavailable right now.')).toBeInTheDocument();
			await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
			await settle();

			expect(screen.getByRole('link', { name: 'Dune' })).toBeInTheDocument();
			expect(callsFor(MOVIE_TRENDING)).toHaveLength(2);
		});

		it('shows the connection message for a trending network failure', async () => {
			respondWith(
				() => ({ movieSearch: movieSearchPage({}) }),
				async () => {
					throw new TypeError('Failed to fetch');
				},
			);
			renderPanel();
			await settle();

			expect(screen.getByText('Unable to reach Perspectize. Check your connection.')).toBeInTheDocument();
		});

		it('shows a loading skeleton while the first trending page is in flight', async () => {
			respondWith(
				() => ({ movieSearch: movieSearchPage({}) }),
				() => new Promise(() => {}),
			);
			renderPanel();
			await settle();

			expect(document.querySelector('[aria-label="Loading trending movies"]')).toBeInTheDocument();
		});

		it('marks trending movies already in the library and adds the others by their url', async () => {
			respondWith(
				() => ({ movieSearch: movieSearchPage({}) }),
				() => ({ movieTrending: movieSearchPage({ items: [DUNE, OPPENHEIMER] }) }),
			);
			const props = renderPanel({ libraryUrls: new Set([DUNE.url]) });
			await settle();

			expect(screen.getAllByRole('button', { name: 'In Library' })).toHaveLength(1);
			await fireEvent.click(screen.getByRole('button', { name: 'Add to Perspectize' }));

			expect(props.onAdd).toHaveBeenCalledWith(OPPENHEIMER.url);
		});
	});
});
