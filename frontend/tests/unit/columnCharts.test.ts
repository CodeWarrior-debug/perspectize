import { describe, it, expect } from 'vitest';
import {
	CHART_TYPES,
	CHART_TYPE_LABELS,
	CHART_ELIGIBLE_COLS,
	DEFAULT_CHART_TYPE,
	defaultChartType,
	isChartEligible,
} from '$lib/utils/columnCharts';

describe('chart registry', () => {
	it('has exactly 10 chart types, each with a label', () => {
		expect(CHART_TYPES).toHaveLength(10);
		for (const t of CHART_TYPES) expect(CHART_TYPE_LABELS[t].length).toBeGreaterThan(0);
		expect(CHART_TYPE_LABELS.histogram).toBe('Histogram');
		expect(CHART_TYPE_LABELS.topBottom).toBe('Top and bottom 10');
	});

	it('lists the nine numeric columns and excludes released', () => {
		expect([...CHART_ELIGIBLE_COLS].sort()).toEqual(
			['budget', 'boxOffice', 'duration', 'likes', 'percentLiked', 'tmdbScore', 'views', 'votes', 'vsBudget'].sort(),
		);
		expect(CHART_ELIGIBLE_COLS.has('released')).toBe(false);
	});

	it('gives every eligible column a histogram default', () => {
		for (const col of CHART_ELIGIBLE_COLS) {
			expect(DEFAULT_CHART_TYPE[col]).toBe('histogram');
			expect(defaultChartType(col)).toBe('histogram');
		}
	});

	it('falls back to histogram for unknown columns', () => {
		expect(defaultChartType('nope')).toBe('histogram');
	});
});

describe('isChartEligible', () => {
	it('is true for eligible columns on a movie-only filter', () => {
		expect(isChartEligible('views', 'movie')).toBe(true);
		expect(isChartEligible('boxOffice', 'movie')).toBe(true);
	});

	it('is false for non-movie filters', () => {
		expect(isChartEligible('views', 'youtube')).toBe(false);
		expect(isChartEligible('views', 'movie,youtube')).toBe(false);
		expect(isChartEligible('views', undefined)).toBe(false);
	});

	it('is false for ineligible columns even on movies', () => {
		expect(isChartEligible('released', 'movie')).toBe(false);
	});
});
