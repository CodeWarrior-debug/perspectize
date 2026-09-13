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
function renderWith(component: Component<any>) {
	return render(TestWrapper, {
		props: { queryClient: makeClient(), component, props: {} },
	});
}

describe('CategoryTypeahead', () => {
	it('renders the Wikidata search input', () => {
		renderWith(CategoryTypeahead);
		expect(screen.getByPlaceholderText('Search Wikidata...')).toBeInTheDocument();
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
