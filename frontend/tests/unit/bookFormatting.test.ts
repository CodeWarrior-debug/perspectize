import { describe, it, expect } from 'vitest';
import {
	authorCellRenderer,
	authorCellText,
	authorValueGetter,
	bookAuthors,
	bookResponse,
	bookSubjects,
	editionsValueGetter,
	formatBookRating,
	hasLowRatingCount,
	pagesValueGetter,
	publishedValueGetter,
	ratingTooltip,
	ratingValueGetter,
	readersTooltip,
	readersValueGetter,
	readingLogBreakdown,
	readingLogOf,
	formatAsOf,
	formatReaders,
	READING_LOG_CAVEAT,
	type BookRow,
} from '$lib/utils/bookFormatting';
import { EMPTY_VALUE } from '$lib/utils/formatting';

// The four real cases from the Book design: the full record, a rating-only record, a sparse
// zine with no cover or rating, and a record with no author or year.
const eastOfEden: BookRow = {
	contentType: 'BOOK',
	book: {
		workKey: 'OL23166W',
		title: 'East of Eden',
		authors: [{ name: 'John Steinbeck', openLibraryKey: '/authors/OL26320A' }],
		coverId: 11386937,
		firstPublishYear: 1952,
		pageCountMedian: 611,
		subjects: ['Fiction', 'Family', 'California'],
		ratingsAverage: 4.1,
		ratingsCount: 100,
		editionCount: 65,
	},
};

const eastOfEdenTwoAuthors: BookRow = {
	contentType: 'BOOK',
	book: { ...(eastOfEden.book as object), authors: [{ name: 'John Steinbeck' }, { name: 'Ann Editor' }] },
};

const atomicHabits: BookRow = {
	contentType: 'BOOK',
	book: {
		workKey: 'OL17930368W',
		title: 'Atomic Habits',
		authors: [{ name: 'James Clear' }],
		coverId: 10234120,
		firstPublishYear: 2016,
		pageCountMedian: 322,
		subjects: ['Habit breaking', 'Self-help'],
		ratingsAverage: 3.97,
		ratingsCount: 1489,
		editionCount: 90,
	},
};

const brainscan: BookRow = {
	contentType: 'BOOK',
	book: {
		workKey: 'OL99999W',
		title: 'Brainscan',
		authors: [{ name: 'Zine Author' }],
		coverId: null,
		firstPublishYear: 2011,
		pageCountMedian: 30,
		subjects: ['Zines', 'Comics', 'Humor'],
		ratingsAverage: null,
		ratingsCount: null,
		editionCount: 1,
	},
};

const makeAZine: BookRow = {
	contentType: 'BOOK',
	book: {
		workKey: 'OL88888W',
		title: 'Make a zine!',
		authors: [],
		coverId: null,
		firstPublishYear: null,
		pageCountMedian: null,
		subjects: [],
		ratingsAverage: null,
		ratingsCount: null,
		editionCount: null,
	},
};

describe('bookResponse', () => {
	it('reads the book payload of a BOOK row', () => {
		expect(bookResponse(eastOfEden)?.title).toBe('East of Eden');
	});

	it('falls back to the response payload (details rows)', () => {
		const row: BookRow = { contentType: 'BOOK', response: { title: 'From response' } };
		expect(bookResponse(row)?.title).toBe('From response');
	});

	it('parses a JSON string payload', () => {
		const row: BookRow = { contentType: 'BOOK', book: JSON.stringify({ title: 'Parsed' }) };
		expect(bookResponse(row)?.title).toBe('Parsed');
	});

	it('returns null for a MOVIE row', () => {
		expect(bookResponse({ contentType: 'MOVIE', book: { title: 'Heat' } })).toBeNull();
	});

	it('returns null for a BOOK row whose JSON string is malformed', () => {
		expect(bookResponse({ contentType: 'BOOK', book: '{not json' })).toBeNull();
	});

	it('returns null for a missing row', () => {
		expect(bookResponse(null)).toBeNull();
		expect(bookResponse(undefined)).toBeNull();
	});
});

describe('authors', () => {
	it('lists every author in order', () => {
		expect(bookAuthors(eastOfEdenTwoAuthors).map((a) => a.name)).toEqual(['John Steinbeck', 'Ann Editor']);
	});

	it('the first author is the value the grid sorts and filters on', () => {
		expect(authorValueGetter({ data: eastOfEdenTwoAuthors })).toBe('John Steinbeck');
		expect(authorValueGetter({ data: makeAZine })).toBeNull();
	});

	it.each([
		[makeAZine, ''],
		[eastOfEden, 'John Steinbeck'],
		[
			{
				contentType: 'BOOK',
				book: { authors: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] },
			} satisfies BookRow,
			'A +2',
		],
	])('authorCellText is %j for the row', (row, expected) => {
		expect(authorCellText(row)).toBe(expected);
	});

	it('the Author cell shows the dash for no author, never an empty box', () => {
		const cell = authorCellRenderer({ data: makeAZine });
		expect(typeof cell === 'string' ? cell : cell.textContent).toBe(EMPTY_VALUE);
	});

	it('the Author cell shows the first name with a +N count', () => {
		const cell = authorCellRenderer({ data: eastOfEdenTwoAuthors });
		expect(typeof cell === 'string' ? cell : cell.textContent).toBe('John Steinbeck +1');
	});
});

describe('publishedValueGetter', () => {
	it('is the plain four-digit year, never with a thousands separator', () => {
		expect(publishedValueGetter({ data: eastOfEden })).toBe('1952');
	});

	it.each([makeAZine, { contentType: 'BOOK', book: { firstPublishYear: 0 } } satisfies BookRow])(
		'is null when the year is absent or 0',
		(row) => {
			expect(publishedValueGetter({ data: row })).toBeNull();
		},
	);
});

describe('pagesValueGetter', () => {
	it('is the median page count', () => {
		expect(pagesValueGetter({ data: eastOfEden })).toBe(611);
	});

	it('is null when unknown or 0, never 0', () => {
		expect(pagesValueGetter({ data: makeAZine })).toBeNull();
		expect(pagesValueGetter({ data: { contentType: 'BOOK', book: { pageCountMedian: 0 } } })).toBeNull();
	});
});

describe('ratings', () => {
	it('ratingValueGetter reads the average out of 5', () => {
		expect(ratingValueGetter({ data: eastOfEden })).toBe(4.1);
	});

	it('treats a null or 0 average as unknown', () => {
		expect(ratingValueGetter({ data: brainscan })).toBeNull();
		expect(ratingValueGetter({ data: { contentType: 'BOOK', book: { ratingsAverage: 0 } } })).toBeNull();
	});

	it('formatBookRating renders one decimal, and the dash when unknown', () => {
		expect(formatBookRating(4.1)).toBe('4.1');
		expect(formatBookRating(3.97)).toBe('4.0');
		expect(formatBookRating(null)).toBe(EMPTY_VALUE);
	});

	it('hasLowRatingCount is true under 5 ratings and false at 5', () => {
		expect(hasLowRatingCount({ data: { contentType: 'BOOK', book: { ratingsAverage: 4, ratingsCount: 4 } } })).toBe(
			true,
		);
		expect(hasLowRatingCount({ data: { contentType: 'BOOK', book: { ratingsAverage: 4, ratingsCount: 5 } } })).toBe(
			false,
		);
	});

	it('hasLowRatingCount is true when the count is missing but a rating exists', () => {
		expect(hasLowRatingCount({ data: { contentType: 'BOOK', book: { ratingsAverage: 4.2 } } })).toBe(true);
	});

	it('ratingTooltip names the average and the count', () => {
		expect(ratingTooltip({ data: eastOfEden })).toBe('4.1 out of 5 · 100 ratings');
	});

	it('ratingTooltip says there are no ratings yet when unknown', () => {
		expect(ratingTooltip({ data: brainscan })).toBe('No ratings yet');
	});
});

describe('editions and subjects', () => {
	it('editionsValueGetter is the count, or null when unknown', () => {
		expect(editionsValueGetter({ data: eastOfEden })).toBe(65);
		expect(editionsValueGetter({ data: makeAZine })).toBeNull();
	});

	it('bookSubjects is the subject list, or null when there are none', () => {
		expect(bookSubjects(brainscan)).toEqual(['Zines', 'Comics', 'Humor']);
		expect(bookSubjects(makeAZine)).toBeNull();
	});
});

describe('reading log (Open Library users only)', () => {
	const row = (book: Record<string, unknown>): BookRow => ({ contentType: 'BOOK', book });
	const full = row({
		wantToReadCount: 1189,
		currentlyReadingCount: 79,
		alreadyReadCount: 153,
		readingLogCount: 1421,
		readingLogFetchedAt: '2026-11-12T12:00:00Z',
	});

	it('readersValueGetter is the want-to-read count', () => {
		expect(readersValueGetter({ data: full })).toBe(1189);
	});

	it('a real 0 stays 0 and a missing count is null', () => {
		expect(readersValueGetter({ data: row({ wantToReadCount: 0 }) })).toBe(0);
		expect(readersValueGetter({ data: row({ wantToReadCount: null }) })).toBeNull();
		expect(readersValueGetter({ data: row({}) })).toBeNull();
		expect(readersValueGetter({ data: { contentType: 'MOVIE', book: { wantToReadCount: 5 } } })).toBeNull();
	});

	it('formatReaders separates thousands, keeps 0 and dashes unknown', () => {
		expect(formatReaders(1189)).toBe('1,189');
		expect(formatReaders(0)).toBe('0');
		expect(formatReaders(null)).toBe(EMPTY_VALUE);
		expect(formatReaders(undefined)).toBe(EMPTY_VALUE);
	});

	it('readingLogBreakdown leaves a missing count out and keeps a 0', () => {
		expect(readingLogBreakdown(readingLogOf(full.book as never))).toBe(
			'1,189 want to read · 79 reading now · 153 have read',
		);
		expect(readingLogBreakdown(readingLogOf({ wantToReadCount: 3, currentlyReadingCount: 0 }))).toBe(
			'3 want to read · 0 reading now',
		);
		expect(readingLogBreakdown(readingLogOf({}))).toBe('');
	});

	it('readingLogBreakdown falls back to the total when only it is known', () => {
		expect(readingLogBreakdown(readingLogOf({ readingLogCount: 1421 }))).toBe('1,421 shelved');
	});

	it('formatAsOf renders a date, and null for a missing or invalid time', () => {
		expect(formatAsOf('2026-11-12T12:00:00Z')).toBe('Nov 12, 2026');
		expect(formatAsOf(undefined)).toBeNull();
		expect(formatAsOf('not a date')).toBeNull();
	});

	it('readersTooltip has the breakdown, the Open-Library-only caveat and the as-of date', () => {
		const text = readersTooltip({ data: full });
		expect(text).toContain('1,189 want to read · 79 reading now · 153 have read');
		expect(text).toContain(READING_LOG_CAVEAT);
		expect(text).toContain('as of Nov 12, 2026');
	});

	it('readersTooltip omits "as of" for a row with counts but no stored time', () => {
		const text = readersTooltip({ data: row({ wantToReadCount: 4 }) });
		expect(text).toContain('4 want to read');
		expect(text).not.toContain('as of');
	});

	it('readersTooltip says there is no data, rather than 0, for a row without counts', () => {
		const text = readersTooltip({ data: row({ title: 'Old row' }) });
		expect(text).toMatch(/No Open Library reading-log data/);
		expect(text).not.toMatch(/\b0\b/);
	});
});
