import { describe, it, expect } from 'vitest';
import {
	binReadout,
	chartCaption,
	chartHeading,
	cumulativeReadout,
	coverageReadout,
	densityReadout,
	lineReadout,
	movieReadout,
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
