import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import CategoryTypeahead, { type CurrentCategory } from '$lib/components/CategoryTypeahead.svelte';

vi.mock('@tanstack/svelte-query', () => ({
	createQuery: vi.fn(() => ({
		isLoading: false,
		data: undefined,
	})),
	keepPreviousData: Symbol('keepPreviousData'),
}));

vi.mock('$lib/queries/client', () => ({
	graphqlClient: { request: vi.fn() },
}));

function baseProps() {
	return {
		contentId: 1,
		currentCategory: null as CurrentCategory | null,
		onSelect: vi.fn(),
		onRemove: vi.fn(),
		onClose: vi.fn(),
	};
}

describe('CategoryTypeahead component', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('does not render a "Current category" section or remove button when no category is set', () => {
		render(CategoryTypeahead, { props: baseProps() });

		expect(screen.queryByText('Current category')).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Remove category' })).not.toBeInTheDocument();
	});

	it('renders the current category label, description, and Wikidata link', () => {
		render(CategoryTypeahead, {
			props: {
				...baseProps(),
				currentCategory: {
					label: 'Physics',
					wikidataQid: 'Q413',
					description: 'Study of matter and energy',
				},
			},
		});

		expect(screen.getByText('Current category')).toBeInTheDocument();
		expect(screen.getByText('Physics')).toBeInTheDocument();
		expect(screen.getByText('Study of matter and energy')).toBeInTheDocument();

		const wikidataLink = screen.getByRole('link', { name: /Q413 on Wikidata/ });
		expect(wikidataLink).toHaveAttribute('href', 'https://www.wikidata.org/wiki/Q413');
	});

	it('calls onRemove when the remove-category button is clicked', async () => {
		const props = baseProps();
		props.currentCategory = { label: 'Physics', wikidataQid: 'Q413' };
		render(CategoryTypeahead, { props });

		await fireEvent.click(screen.getByRole('button', { name: 'Remove category' }));

		expect(props.onRemove).toHaveBeenCalledTimes(1);
	});

	it('renders a Wikipedia link when wikipediaUrl is present', () => {
		render(CategoryTypeahead, {
			props: {
				...baseProps(),
				currentCategory: {
					label: 'Physics',
					wikidataQid: 'Q413',
					wikipediaUrl: 'https://en.wikipedia.org/wiki/Physics',
				},
			},
		});

		const wikipediaLink = screen.getByRole('link', { name: /Read on Wikipedia/ });
		expect(wikipediaLink).toHaveAttribute('href', 'https://en.wikipedia.org/wiki/Physics');
	});

	it('omits the Wikipedia link when wikipediaUrl is absent', () => {
		render(CategoryTypeahead, {
			props: {
				...baseProps(),
				currentCategory: { label: 'Physics', wikidataQid: 'Q413' },
			},
		});

		expect(screen.queryByRole('link', { name: /Read on Wikipedia/ })).not.toBeInTheDocument();
	});
});
