import { describe, it, expect } from 'vitest';
import {
	binReadout,
	chartCaption,
	chartHeading,
	cumulativeReadout,
	coverageReadout,
	densityReadout,
	lineReadout,
	displayName,
	itemNounFor,
	movieReadout,
	rankTitles,
	titlesText,
	moviesText,
	nearestIndex,
	pieReadout,
	stepIndex,
} from '#lib/utils/chartReadout';
import { CHART_TYPES } from '#lib/utils/columnCharts';

const millions = (n: number) => `$${n / 1e6}M`;

describe('nearestIndex', () => {
	const items = [{ x: 1 }, { x: 5 }, { x: 9 }];

	it('returns the item whose x is closest to the pointer', () => {
		expect(nearestIndex(items, 0)).toBe(0);
		expect(nearestIndex(items, 6)).toBe(1);
		expect(nearestIndex(items, 100)).toBe(2);
	});

	it('uses y as well when both coordinates are given', () => {
		const dots = [
			{ x: 10, y: 0 },
			{ x: 10, y: 50 },
		];
		expect(nearestIndex(dots, 10, 45)).toBe(1);
		expect(nearestIndex(dots, 10, 5)).toBe(0);
	});

	it('returns null for an empty list', () => {
		expect(nearestIndex([], 3)).toBeNull();
	});
});

describe('stepIndex', () => {
	it('starts at the first item going forward and the last going back when nothing is selected', () => {
		expect(stepIndex(null, 1, 3)).toBe(0);
		expect(stepIndex(null, -1, 3)).toBe(2);
	});

	it('moves one step and stops at either end', () => {
		expect(stepIndex(1, 1, 3)).toBe(2);
		expect(stepIndex(2, 1, 3)).toBe(2);
		expect(stepIndex(0, -1, 3)).toBe(0);
	});

	it('is null when there is nothing to select', () => {
		expect(stepIndex(null, 1, 0)).toBeNull();
	});
});

describe('readout text', () => {
	const format = millions;

	it('pluralises movie counts', () => {
		expect(moviesText(1)).toBe('1 movie');
		expect(moviesText(0)).toBe('0 movies');
		expect(moviesText(14)).toBe('14 movies');
	});

	it('histogram bin reads as range, then count', () => {
		expect(binReadout({ lo: 10e6, hi: 20e6, count: 14 }, format)).toBe('$10M–$20M · 14 movies');
	});

	it('line point reads as its midpoint, count and range', () => {
		expect(lineReadout({ lo: 10e6, hi: 20e6, count: 1 }, format)).toBe('$15M: 1 movie from $10M to $20M');
	});

	it('cumulative point reads as value, rank of total and share', () => {
		expect(cumulativeReadout(40e6, 3, 4, format)).toBe('$40M · 3 of 4 movies (75%) at or below');
	});

	it('density point reads as an expected count in one band', () => {
		expect(densityReadout(45e6, 5.6, 10e6, format)).toBe('$45M · about 6 movies in the $10M band around it');
		expect(densityReadout(45e6, 0.3, 10e6, format)).toBe('$45M · under 1 movie in the $10M band around it');
	});

	it('movie readout names the movie, and says Untitled when it has no name', () => {
		expect(movieReadout('Film 3', 40e6, format)).toBe('Film 3 · $40M');
		expect(movieReadout('', 5e6, format)).toBe('Untitled · $5M');
	});

	it('pie slice reads as label, count and share of the values', () => {
		expect(pieReadout('Other', 1, 4)).toBe('Other · 1 movie (25%)');
	});

	it('coverage reads as count, state and share of all rows', () => {
		expect(coverageReadout('filled', 12, 20)).toBe('12 with a value (60%)');
		expect(coverageReadout('empty', 8, 20)).toBe('8 empty (40%)');
	});

	it('share is 0% rather than NaN when there are no rows', () => {
		expect(coverageReadout('empty', 0, 0)).toBe('0 empty (0%)');
	});
});

describe('movie titles in readouts', () => {
	const format = millions;
	const row = (name: string, value: number) => ({ name, value });

	it('rankTitles orders by value, largest first, and ties by title', () => {
		const rows = [row('Beta', 5), row('Alpha', 5), row('Gamma', 9)];
		expect(rankTitles(rows)).toEqual(['Gamma', 'Alpha', 'Beta']);
	});

	it('rankTitles keeps only the top three', () => {
		const rows = [row('A', 1), row('B', 2), row('C', 3), row('D', 4)];
		expect(rankTitles(rows)).toEqual(['D', 'C', 'B']);
	});

	it('rankTitles labels a movie with no title as Untitled', () => {
		expect(rankTitles([row('', 7)])).toEqual(['Untitled']);
		expect(displayName('')).toBe('Untitled');
		expect(displayName('Film')).toBe('Film');
	});

	it('titlesText lists one title without a "more" count', () => {
		expect(titlesText(['Film A'], 1)).toBe('Film A');
	});

	it('titlesText lists three titles exactly when there are no more', () => {
		expect(titlesText(['A', 'B', 'C'], 3)).toBe('A, B, C');
	});

	it('titlesText adds "+N more" from the full count, not the shown list', () => {
		expect(titlesText(['A', 'B', 'C'], 5)).toBe('A, B, C, +2 more');
	});

	it('titlesText is empty when there are no movies', () => {
		expect(titlesText([], 0)).toBe('');
	});

	it('binReadout appends titles after the count, and leaves the text alone without them', () => {
		const bin = { lo: 10e6, hi: 20e6, count: 4 };
		expect(binReadout(bin, format, 'A, B, C, +1 more')).toBe('$10M–$20M · 4 movies · A, B, C, +1 more');
		expect(binReadout(bin, format)).toBe('$10M–$20M · 4 movies');
	});

	it('an empty bin reads its count of zero with no titles appended', () => {
		expect(binReadout({ lo: 10e6, hi: 20e6, count: 0 }, format, '')).toBe('$10M–$20M · 0 movies');
	});

	it('lineReadout and cumulativeReadout append titles the same way', () => {
		expect(lineReadout({ lo: 10e6, hi: 20e6, count: 1 }, format, 'Film A')).toBe(
			'$15M: 1 movie from $10M to $20M · Film A',
		);
		expect(cumulativeReadout(40e6, 3, 4, format, 'C, B, A')).toBe('$40M · 3 of 4 movies (75%) at or below · C, B, A');
	});
});

describe('chartHeading and chartCaption', () => {
	it('heading names the column and the number of movies', () => {
		expect(chartHeading('Box office', 120)).toBe('Box office · 120 movies');
		expect(chartHeading('Box office', 1)).toBe('Box office · 1 movie');
	});

	it.each(CHART_TYPES)('%s caption names the column', (type) => {
		expect(chartCaption(type, 'box office')).toContain('box office');
	});

	it('histogram caption says what the height and across mean', () => {
		expect(chartCaption('histogram', 'box office')).toBe('Number of movies (height) by box office (across)');
	});
});

describe('readouts name rows by content type', () => {
	const book = itemNounFor('book');
	const fmt = (n: number) => String(n);

	it('each view has its own noun; the All Items view says items', () => {
		expect(itemNounFor('movie')).toEqual({ one: 'movie', many: 'movies' });
		expect(book).toEqual({ one: 'book', many: 'books' });
		expect(itemNounFor('webpage').many).toBe('webpages');
		expect(itemNounFor('claim').many).toBe('claims');
		expect(itemNounFor('general')).toEqual({ one: 'item', many: 'items' });
	});

	it('count text and every readout use the given noun', () => {
		expect(moviesText(1, book)).toBe('1 book');
		expect(moviesText(8, book)).toBe('8 books');
		expect(binReadout({ lo: 0, hi: 100, count: 2 }, fmt, '', book)).toBe('0–100 · 2 books');
		expect(lineReadout({ lo: 0, hi: 100, count: 1 }, fmt, '', book)).toBe('50: 1 book from 0 to 100');
		expect(cumulativeReadout(300, 2, 4, fmt, '', book)).toBe('300 · 2 of 4 books (50%) at or below');
		expect(densityReadout(10, 0.2, 5, fmt, book)).toBe('10 · under 1 book in the 5 band around it');
		expect(densityReadout(10, 3, 5, fmt, book)).toBe('10 · about 3 books in the 5 band around it');
		expect(pieReadout('0–100', 1, 4, book)).toBe('0–100 · 1 book (25%)');
		expect(chartHeading('Pages', 8, book)).toBe('Pages · 8 books');
	});

	it('no caption says movies for books', () => {
		for (const type of CHART_TYPES) {
			expect(chartCaption(type, 'Pages', book)).not.toMatch(/movie/i);
		}
		expect(chartCaption('histogram', 'Pages', book)).toBe('Number of books (height) by Pages (across)');
		expect(chartCaption('strip', 'Pages', book)).toBe('Each dot is one book, placed by Pages (across)');
		expect(chartCaption('coverage', 'Pages', book)).toBe('Books with and without a Pages');
	});
});
