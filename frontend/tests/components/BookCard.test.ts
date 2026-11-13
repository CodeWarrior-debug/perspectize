import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import BookCard from '$lib/components/discover/BookCard.svelte';
import type { BookSearchResult } from '$lib/services/openLibraryApi';

vi.mock('$lib/queries/users/useMe.svelte', () => ({ useMe: () => ({ me: null }) }));

const EAST_OF_EDEN_URL = 'https://openlibrary.org/works/OL23166W';

const eastOfEden: BookSearchResult = {
	workKey: 'OL23166W',
	title: 'East of Eden',
	authorName: ['John Steinbeck'],
	coverId: 8231856,
	firstPublishYear: 1952,
	pageCountMedian: 611,
	subjects: ['Fiction', 'Family', 'California', 'Salinas Valley', 'Fifth subject'],
	ratingsAverage: 4.1,
	ratingsCount: 100,
	editionCount: 65,
	wantToReadCount: 1189,
	currentlyReadingCount: 79,
	alreadyReadCount: 153,
	readingLogCount: 1421,
	url: EAST_OF_EDEN_URL,
};

// A sparse work: no cover, no rating, one edition, no subjects.
const brainscan: BookSearchResult = {
	workKey: 'OL99W',
	title: 'Brainscan',
	authorName: [],
	coverId: null,
	firstPublishYear: 2011,
	pageCountMedian: 30,
	subjects: [],
	ratingsAverage: null,
	ratingsCount: null,
	editionCount: 1,
	wantToReadCount: null,
	currentlyReadingCount: null,
	alreadyReadCount: null,
	readingLogCount: null,
	url: 'https://openlibrary.org/works/OL99W',
};

function renderCard(
	result: BookSearchResult,
	props: { libraryItem?: { id: string; name: string } | null; isPending?: boolean } = {},
) {
	const onAdd = vi.fn();
	const view = render(BookCard, { props: { result, onAdd, ...props } });
	return { ...view, onAdd };
}

describe('BookCard', () => {
	it('links the title to the work in a new tab without leaking the opener', () => {
		renderCard(eastOfEden);
		const link = screen.getByRole('link', { name: 'East of Eden' });
		expect(link).toHaveAttribute('href', EAST_OF_EDEN_URL);
		expect(link).toHaveAttribute('target', '_blank');
		expect(link).toHaveAttribute('rel', 'noopener noreferrer');
	});

	it('shows the cover at the medium size with contain fit, the authors, the facts, the rating and the first four subjects', () => {
		renderCard(eastOfEden);
		const cover = screen.getByRole('img', { name: 'Cover of East of Eden' });
		expect(cover.getAttribute('src')).toBe('https://covers.openlibrary.org/b/id/8231856-M.jpg');
		expect(cover).toHaveClass('object-contain');
		expect(screen.getByText('John Steinbeck')).toBeInTheDocument();
		expect(screen.getByText('1952 · 611 pages · 65 editions')).toBeInTheDocument();
		expect(screen.getByText('★ 4.1 (100)')).toBeInTheDocument();
		expect(screen.getByText('Salinas Valley')).toBeInTheDocument();
		expect(screen.queryByText('Fifth subject')).not.toBeInTheDocument();
	});

	it('shows a book placeholder, not an image, when the work has no cover, and No ratings when unrated', () => {
		const { container } = renderCard(brainscan);
		expect(container.querySelector('img')).toBeNull();
		expect(screen.getByText('No ratings')).toBeInTheDocument();
		expect(screen.getByText('2011 · 30 pages · 1 edition')).toBeInTheDocument();
		expect(container.textContent).not.toMatch(/\b0\b/);
	});

	it('shows Year unknown when the work has no first-publish year', () => {
		renderCard({ ...brainscan, firstPublishYear: null, pageCountMedian: null, editionCount: null });
		expect(screen.getByText('Year unknown')).toBeInTheDocument();
	});

	it('treats a zero page count, edition count or rating as unknown, never as 0', () => {
		const { container } = renderCard({
			...brainscan,
			pageCountMedian: 0,
			editionCount: 0,
			ratingsAverage: 0,
			ratingsCount: 0,
		});
		expect(screen.getByText('2011')).toBeInTheDocument();
		expect(screen.getByText('No ratings')).toBeInTheDocument();
		expect(container.textContent).not.toContain('0 pages');
		expect(container.textContent).not.toContain('0 editions');
	});

	it('mutes the rating when it rests on fewer than 5 ratings', () => {
		renderCard({ ...eastOfEden, ratingsCount: 3 });
		expect(screen.getByText('★ 4.1 (3)')).toHaveClass('text-muted-foreground');
	});

	it('does not mute the rating when it rests on 5 or more ratings', () => {
		renderCard(eastOfEden);
		expect(screen.getByText('★ 4.1 (100)')).toHaveClass('text-foreground');
	});

	it('shows the shared library actions, and no Add button, for a work already in the library', () => {
		renderCard(eastOfEden, { libraryItem: { id: '7', name: 'East of Eden' } });
		expect(screen.getByTestId('library-status')).toHaveTextContent('In Library');
		expect(screen.getByRole('link', { name: 'Go to item' })).toHaveAttribute('href', '/content-library?open=7');
		expect(screen.queryByRole('button', { name: 'Add to Perspectize' })).not.toBeInTheDocument();
	});

	it('disables Add while this work is being added', () => {
		renderCard(eastOfEden, { isPending: true });
		expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled();
	});

	it('calls onAdd with the work url when Add is clicked', async () => {
		const { onAdd } = renderCard(eastOfEden);
		await fireEvent.click(screen.getByRole('button', { name: 'Add to Perspectize' }));
		expect(onAdd).toHaveBeenCalledWith(EAST_OF_EDEN_URL);
	});
});

describe('BookCard reading log', () => {
	it('shows the breakdown and says it is Open Library users only', () => {
		renderCard(eastOfEden);
		const line = screen.getByText('1,189 want to read · 79 reading now · 153 have read on Open Library');
		expect(line).toHaveAttribute('title', 'Open Library users only, not readers in general');
	});

	it('keeps a real 0 and leaves a missing count out', () => {
		renderCard({
			...eastOfEden,
			wantToReadCount: 3,
			currentlyReadingCount: 0,
			alreadyReadCount: null,
			readingLogCount: null,
		});
		expect(screen.getByText('3 want to read · 0 reading now on Open Library')).toBeInTheDocument();
	});

	it('says there is no data, never 0, when Open Library gave no counts', () => {
		renderCard(brainscan);
		expect(screen.getByText('No Open Library reading-log data')).toBeInTheDocument();
		expect(screen.queryByText(/want to read/)).toBeNull();
	});

	it('falls back to the shelved total when only the total is known', () => {
		renderCard({ ...brainscan, readingLogCount: 1421 });
		expect(screen.getByText('1,421 shelved on Open Library')).toBeInTheDocument();
	});
});
