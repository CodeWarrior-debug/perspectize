import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import type { Component } from 'svelte';
import TestWrapper from '../helpers/TestWrapper.svelte';
import CategoryTypeahead from '$lib/components/CategoryTypeahead.svelte';
import CategoryTypeaheadHost from './fixtures/CategoryTypeaheadHost.svelte';

vi.mock('$lib/queries/client', () => ({
	graphqlClient: { request: vi.fn().mockResolvedValue({ wikidataSearch: [] }) },
}));

function makeClient() {
	return new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
	});
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderWith(component: Component<any>, props: Record<string, unknown> = {}) {
	return render(TestWrapper, {
		props: { queryClient: makeClient(), component, props },
	});
}

describe('CategoryTypeahead', () => {
	it('renders the Wikidata search input', () => {
		renderWith(CategoryTypeahead);
		expect(screen.getByPlaceholderText('Search Wikidata...')).toBeInTheDocument();
	});

	it('renders current category label as a link when wikipediaUrl is present', () => {
		renderWith(CategoryTypeahead, {
			contentId: 1,
			currentCategory: {
				label: 'Science',
				wikidataQid: 'Q336',
				wikipediaUrl: 'https://en.wikipedia.org/wiki/Science',
			},
			onSelect: () => {},
			onClose: () => {},
		});

		const link = screen.getByRole('link', { name: 'Science' });
		expect(link).toHaveAttribute('href', 'https://en.wikipedia.org/wiki/Science');
	});

	it('renders current category label as plain text when wikipediaUrl is absent', () => {
		renderWith(CategoryTypeahead, {
			contentId: 1,
			currentCategory: { label: 'Science', wikidataQid: 'Q336' },
			onSelect: () => {},
			onClose: () => {},
		});

		expect(screen.queryByRole('link', { name: 'Science' })).not.toBeInTheDocument();
		expect(screen.getByText('Science', { exact: false })).toBeInTheDocument();
	});

	describe('debounce', () => {
		beforeEach(() => vi.useFakeTimers());
		afterEach(() => vi.useRealTimers());

		// Regression: the debounce $effect read `searchTerm` only inside its
		// setTimeout callback, so Svelte never tracked it as a dependency. The
		// effect ran once on mount and never again — debouncedTerm stayed '',
		// the search query stayed disabled, and no request ever fired.
		it('propagates the typed term to debouncedTerm 300ms after typing stops', async () => {
			renderWith(CategoryTypeaheadHost);
			const input = screen.getByPlaceholderText('Search Wikidata...');

			await fireEvent.input(input, { target: { value: 'stretch' } });
			await vi.advanceTimersByTimeAsync(300);

			expect(screen.getByTestId('debounced-term')).toHaveTextContent('stretch');
		});

		it('does not propagate before the 300ms delay elapses', async () => {
			renderWith(CategoryTypeaheadHost);
			const input = screen.getByPlaceholderText('Search Wikidata...');

			await fireEvent.input(input, { target: { value: 'stretch' } });
			await vi.advanceTimersByTimeAsync(299);

			expect(screen.getByTestId('debounced-term')).toHaveTextContent('');
		});
	});
});
