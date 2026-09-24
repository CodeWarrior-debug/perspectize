import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import FilterBar from '$lib/components/discover/FilterBar.svelte';
import type { SearchFilters } from '$lib/services/youtubeApi';

// Note: bits-ui Select interactions (opening the popover, clicking an item)
// are not reliably testable in jsdom — see SearchBar.test.ts for the
// established precedent in this codebase. These tests stick to
// DOM-observable rendering and the Clear Filters visibility/label logic,
// which is pure prop-driven behavior.

const defaultFilters: SearchFilters = { videoDuration: undefined, publishedAfter: undefined, order: 'relevance' };

describe('FilterBar', () => {
	it('renders without errors', () => {
		const { container } = render(FilterBar, { props: { filters: defaultFilters } });
		expect(container).toBeTruthy();
	});

	it('renders Duration, Upload Date, and Sort Order selects', () => {
		render(FilterBar, { props: { filters: defaultFilters } });
		expect(screen.getByRole('button', { name: /duration/i })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /upload date/i })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /sort order/i })).toBeInTheDocument();
	});

	it('shows default labels when no filters are active', () => {
		render(FilterBar, { props: { filters: defaultFilters } });
		expect(screen.getByText('Any duration')).toBeInTheDocument();
		expect(screen.getByText('Any time')).toBeInTheDocument();
		expect(screen.getByText('Relevance')).toBeInTheDocument();
	});

	it('does not show a Clear Filters button when filters are at defaults', () => {
		render(FilterBar, { props: { filters: defaultFilters } });
		expect(screen.queryByRole('button', { name: 'Clear Filters' })).not.toBeInTheDocument();
	});

	it('shows a Clear Filters button when videoDuration is set', () => {
		render(FilterBar, { props: { filters: { ...defaultFilters, videoDuration: 'short' } } });
		expect(screen.getByRole('button', { name: 'Clear Filters' })).toBeInTheDocument();
		expect(screen.getByText('Under 4 minutes')).toBeInTheDocument();
	});

	it('shows a Clear Filters button when publishedAfter is set', () => {
		render(FilterBar, {
			props: { filters: { ...defaultFilters, publishedAfter: '2024-01-01T00:00:00.000Z' } },
		});
		expect(screen.getByRole('button', { name: 'Clear Filters' })).toBeInTheDocument();
	});

	it('shows a Clear Filters button when order differs from relevance', () => {
		render(FilterBar, { props: { filters: { ...defaultFilters, order: 'date' } } });
		expect(screen.getByRole('button', { name: 'Clear Filters' })).toBeInTheDocument();
		expect(screen.getByText('Upload date')).toBeInTheDocument();
	});
});
