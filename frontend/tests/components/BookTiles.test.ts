import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import BookTiles from '$lib/components/BookTiles.svelte';
import type { BookRow } from '$lib/utils/bookFormatting';

// The four real cases: the full record, a rating-only record, a sparse zine with no
// cover or rating, and a record with no year.
const eastOfEden: BookRow = {
	contentType: 'BOOK',
	book: {
		title: 'East of Eden',
		firstPublishYear: 1952,
		pageCountMedian: 611,
		ratingsAverage: 4.1,
		ratingsCount: 100,
		editionCount: 65,
	},
};
const brainscan: BookRow = {
	contentType: 'BOOK',
	book: {
		title: 'Brainscan',
		firstPublishYear: 2011,
		pageCountMedian: 30,
		ratingsAverage: null,
		ratingsCount: null,
		editionCount: 1,
	},
};
const makeAZine: BookRow = {
	contentType: 'BOOK',
	book: {
		title: 'Make a zine!',
		firstPublishYear: null,
		pageCountMedian: null,
		ratingsAverage: null,
		ratingsCount: null,
		editionCount: null,
	},
};

/** The value under a tile's uppercase label (the label and value are sibling divs). */
const tileValue = (label: string) => screen.getByText(label, { exact: true }).nextElementSibling?.textContent?.trim();

describe('BookTiles', () => {
	it('shows the rating, rating count, pages, year and editions when Open Library has them', () => {
		render(BookTiles, { props: { row: eastOfEden } });
		expect(tileValue('Rating')).toBe('4.1');
		expect(tileValue('Rating count')).toBe('100');
		expect(tileValue('Pages')).toBe('611');
		expect(tileValue('Published')).toBe('1952');
		expect(tileValue('Editions')).toBe('65');
	});

	it('shows the year as a plain year, never with a thousands separator', () => {
		render(BookTiles, { props: { row: eastOfEden } });
		expect(tileValue('Published')).not.toContain(',');
	});

	it('shows a dash, not 0, for a rating nobody has given (Brainscan)', () => {
		const { container } = render(BookTiles, { props: { row: brainscan } });
		expect(tileValue('Rating')).toBe('—');
		expect(tileValue('Rating count')).toBe('—');
		expect(tileValue('Pages')).toBe('30');
		expect(container.textContent).not.toMatch(/\b0\b/);
	});

	it('shows a dash for the year when the work has none (Make a zine!)', () => {
		const { container } = render(BookTiles, { props: { row: makeAZine } });
		expect(tileValue('Published')).toBe('—');
		expect(tileValue('Pages')).toBe('—');
		expect(tileValue('Editions')).toBe('—');
		expect(container.textContent).not.toContain('NaN');
		expect(container.textContent).not.toContain('undefined');
	});
});

describe('BookTiles reading log', () => {
	const withLog = (book: Record<string, unknown>): BookRow => ({ contentType: 'BOOK', book: { title: 'X', ...book } });

	it('shows the three counts and the caveat with the as-of date', () => {
		const { container } = render(BookTiles, {
			props: {
				row: withLog({
					wantToReadCount: 1189,
					currentlyReadingCount: 79,
					alreadyReadCount: 153,
					readingLogFetchedAt: '2026-11-12T12:00:00Z',
				}),
			},
		});
		expect(tileValue('Want to read')).toBe('1,189');
		expect(tileValue('Reading now')).toBe('79');
		expect(tileValue('Have read')).toBe('153');
		expect(container.textContent).toContain('Open Library users only, not readers in general');
		expect(container.textContent).toContain('as of Nov 12, 2026');
	});

	it('shows a real 0 as 0', () => {
		render(BookTiles, {
			props: { row: withLog({ wantToReadCount: 5, currentlyReadingCount: 0, alreadyReadCount: 0 }) },
		});
		expect(tileValue('Reading now')).toBe('0');
	});

	it('shows dashes and no caveat for a row stored before the counts existed', () => {
		const { container } = render(BookTiles, { props: { row: eastOfEden } });
		expect(tileValue('Want to read')).toBe('—');
		expect(tileValue('Have read')).toBe('—');
		expect(container.textContent).not.toContain('Open Library users only');
	});

	it('omits "as of" when counts exist without a stored time', () => {
		const { container } = render(BookTiles, { props: { row: withLog({ wantToReadCount: 2 }) } });
		expect(container.textContent).toContain('Open Library users only');
		expect(container.textContent).not.toContain('as of');
	});
});
