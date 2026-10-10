import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import Page from '../../src/routes/discover/+page.svelte';
import TestWrapper from '../helpers/TestWrapper.svelte';
import { makeClient } from '../helpers/queryBudget';
import { MOVIE_SEARCH, MOVIE_TRENDING } from '$lib/services/tmdbApi';
import { YOUTUBE_TRENDING } from '$lib/services/youtubeApi';
import { LIST_CONTENT } from '$lib/queries/content';

const mocks = vi.hoisted(() => ({
	graphqlRequest: vi.fn(),
	pageUrl: { current: new URL('http://localhost/discover') },
}));

// $app/state: the page reads ?source= from here. A getter lets each test choose the URL.
vi.mock('$app/state', () => ({
	get page() {
		return { url: mocks.pageUrl.current };
	},
}));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: mocks.graphqlRequest }));
vi.mock('$lib/queries/content/useAddMovie', () => ({ useAddMovie: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock('$lib/queries/content/useAddVideo', () => ({ useAddVideo: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock('$lib/queries/users/useMe.svelte', () => ({ useMe: () => ({ me: null }) }));

function respond(doc: string) {
	if (doc === YOUTUBE_TRENDING) return { youtubeTrending: { items: [], nextPageToken: null } };
	if (doc === LIST_CONTENT) return { content: { items: [] } };
	if (doc === MOVIE_SEARCH) return { movieSearch: { items: [], page: 1, totalPages: 0, totalResults: 0 } };
	if (doc === MOVIE_TRENDING) return { movieTrending: { items: [], page: 1, totalPages: 0, totalResults: 0 } };
	throw new Error('unexpected document');
}

function renderPage() {
	render(TestWrapper, { props: { queryClient: makeClient(), component: Page } });
}

describe('Discover page source switch', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		mocks.pageUrl.current = new URL('http://localhost/discover');
		mocks.graphqlRequest.mockImplementation(async (doc: string) => respond(doc));
	});

	it('defaults to YouTube: the YouTube tab is selected and the YouTube search box is shown', () => {
		renderPage();

		expect(screen.getByRole('tab', { name: 'YouTube' })).toHaveAttribute('aria-selected', 'true');
		expect(screen.getByRole('tab', { name: 'Movies' })).toHaveAttribute('aria-selected', 'false');
		expect(screen.getByRole('textbox', { name: 'Search YouTube, or paste a video link' })).toBeInTheDocument();
		expect(screen.queryByRole('textbox', { name: /search movies by title/i })).not.toBeInTheDocument();
		expect(screen.getByText("Browse what's trending on YouTube and add videos to Perspectize")).toBeInTheDocument();
	});

	it('shows the Movies panel and not the YouTube feed when ?source=movies is set', async () => {
		mocks.pageUrl.current = new URL('http://localhost/discover?source=movies');
		renderPage();
		await tick();

		expect(screen.getByRole('tab', { name: 'Movies' })).toHaveAttribute('aria-selected', 'true');
		expect(screen.getByRole('textbox', { name: /search movies by title/i })).toBeInTheDocument();
		expect(screen.queryByRole('textbox', { name: 'Search YouTube, or paste a video link' })).not.toBeInTheDocument();
		expect(screen.getByText('Search TMDB or browse trending movies and add them to Perspectize')).toBeInTheDocument();
	});

	it('does not fetch YouTube trending while the Movies source is shown', async () => {
		mocks.pageUrl.current = new URL('http://localhost/discover?source=movies');
		renderPage();
		await tick();
		await new Promise((resolve) => setTimeout(resolve, 0));

		const documents = mocks.graphqlRequest.mock.calls.map((call) => call[0]);
		expect(documents).not.toContain(YOUTUBE_TRENDING);
	});

	it('clicking Movies writes ?source=movies into the URL without a new history entry', async () => {
		const { goto } = await import('$app/navigation');
		renderPage();

		await fireEvent.click(screen.getByRole('tab', { name: 'Movies' }));

		expect(goto).toHaveBeenCalledWith('/discover?source=movies', {
			replaceState: true,
			keepFocus: true,
			noScroll: true,
		});
	});

	it('clicking YouTube while on Movies removes the source param, leaving other params alone', async () => {
		const { goto } = await import('$app/navigation');
		mocks.pageUrl.current = new URL('http://localhost/discover?source=movies&x=1');
		renderPage();
		await tick();

		await fireEvent.click(screen.getByRole('tab', { name: 'YouTube' }));

		expect(goto).toHaveBeenCalledWith('/discover?x=1', { replaceState: true, keepFocus: true, noScroll: true });
	});

	it('clicking the already-selected tab does not navigate', async () => {
		const { goto } = await import('$app/navigation');
		renderPage();

		await fireEvent.click(screen.getByRole('tab', { name: 'YouTube' }));

		expect(goto).not.toHaveBeenCalled();
	});
});
