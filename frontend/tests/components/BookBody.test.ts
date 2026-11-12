import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import BookBody from '$lib/components/BookBody.svelte';
import type { BookRow } from '$lib/utils/bookFormatting';

const ATTRIBUTION = 'Data: Open Library (archive.org), community-contributed; may be incomplete.';

const eastOfEden: BookRow = {
	contentType: 'BOOK',
	book: {
		title: 'East of Eden',
		description:
			'**East of Eden** follows two families in the Salinas Valley.\n\n---\n\n[1]: https://example.com/source',
		relatedWorks: [
			{ title: 'East of Eden 1/2', url: 'https://openlibrary.org/works/OL1W' },
			{ title: 'East of Eden 2/2', url: 'https://openlibrary.org/works/OL2W' },
		],
		subjects: ['Fiction', 'Family', 'California'],
	},
};

const atomicHabits: BookRow = {
	contentType: 'BOOK',
	book: { title: 'Atomic Habits', description: 'Small changes, remarkable results.', subjects: [] },
};

const makeAZine: BookRow = { contentType: 'BOOK', book: { title: 'Make a zine!', subjects: [] } };

describe('BookBody', () => {
	it('shows the description as plain text, the related works as links, and the tags as chips', () => {
		render(BookBody, { props: { row: eastOfEden } });
		expect(screen.getByText('Description')).toBeInTheDocument();
		// Markdown emphasis and the reference line are removed; the words remain.
		expect(screen.getByText(/follows two families in the Salinas Valley/)).toBeInTheDocument();
		expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
		expect(screen.getByText('Related works')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'East of Eden 1/2' })).toBeInTheDocument();
		expect(screen.getByText('Tags')).toBeInTheDocument();
		expect(screen.getByText('Family')).toBeInTheDocument();
	});

	it('opens related works in a new tab without leaking the opener', () => {
		render(BookBody, { props: { row: eastOfEden } });
		const link = screen.getByRole('link', { name: 'East of Eden 1/2' });
		expect(link.getAttribute('target')).toBe('_blank');
		expect(link.getAttribute('rel')).toBe('noopener noreferrer');
		expect(link.getAttribute('href')).toBe('https://openlibrary.org/works/OL1W');
	});

	it('shows the description and no related works or tags for a book that has only a description (Atomic Habits)', () => {
		render(BookBody, { props: { row: atomicHabits } });
		expect(screen.getByText('Small changes, remarkable results.')).toBeInTheDocument();
		expect(screen.queryByText('Related works')).not.toBeInTheDocument();
		expect(screen.queryByText('Tags')).not.toBeInTheDocument();
	});

	it('shows no description, related works or tags headings when there is nothing to show (Make a zine!)', () => {
		render(BookBody, { props: { row: makeAZine } });
		expect(screen.queryByText('Description')).not.toBeInTheDocument();
		expect(screen.queryByText('Related works')).not.toBeInTheDocument();
		expect(screen.queryByText('Tags')).not.toBeInTheDocument();
	});

	it('always shows the Open Library attribution, verbatim', () => {
		for (const row of [eastOfEden, atomicHabits, makeAZine]) {
			const { unmount } = render(BookBody, { props: { row } });
			expect(screen.getByText(ATTRIBUTION)).toBeInTheDocument();
			unmount();
		}
	});

	it('never turns a description into markup: an injected image tag leaves no image behind', () => {
		const hostile: BookRow = {
			contentType: 'BOOK',
			book: { description: 'Read this <img src=x onerror=alert(1)> now', subjects: [] },
		};
		const { container } = render(BookBody, { props: { row: hostile } });
		expect(container.querySelector('img')).toBeNull();
		expect(container.querySelector('[onerror]')).toBeNull();
		expect(container.textContent).toContain('Read this');
		expect(container.textContent).not.toContain('<img');
	});

	it('does not render a related work whose link is not on openlibrary.org', () => {
		const row: BookRow = {
			contentType: 'BOOK',
			book: {
				relatedWorks: [
					{ title: 'Off-site', url: 'https://evil.example/x' },
					{ title: 'On-site', url: 'https://openlibrary.org/works/OL9W' },
				],
			},
		};
		render(BookBody, { props: { row } });
		expect(screen.queryByRole('link', { name: 'Off-site' })).not.toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'On-site' })).toBeInTheDocument();
	});
});
