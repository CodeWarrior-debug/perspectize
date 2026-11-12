import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { themeQuartz } from '@ag-grid-community/theming';
import { headerMinWidth, headerTextWidth } from '$lib/utils/grid-header-width';
import { GEIST_SEMIBOLD_ADVANCE_EM, GEIST_SEMIBOLD_WIDEST_EM } from '$lib/utils/grid-header-metrics';
import {
	ACTIVITY_GRID_THEME,
	ACTIVITY_HEADER_CHROME,
	ACTIVITY_HEADER_TEXT_CASE,
	GRID_THEME_PARAMS,
	headerChrome,
} from '$lib/utils/grid-theme';

const appCss = readFileSync(resolve(process.cwd(), 'src/app.css'), 'utf8');

describe('headerChrome', () => {
	it('reads the Activity theme: 4px Balham spacing, 16px icons, 11px uppercase letter-spaced headers', () => {
		expect(ACTIVITY_HEADER_CHROME).toEqual({
			fontSize: 11,
			padding: 8,
			sort: 20,
			filter: 20,
			uppercase: true,
			letterSpacingEm: 0.06,
		});
	});

	it('follows the theme, so a spacing change can never leave stale reserved widths', () => {
		// Quartz's headerFontSize is a reference to fontSize, which headerChrome follows.
		expect(headerChrome(themeQuartz.withParams(GRID_THEME_PARAMS))).toEqual({
			fontSize: 14,
			padding: 16,
			sort: 24,
			filter: 24,
			uppercase: false,
			letterSpacingEm: 0,
		});
	});

	it('header text is the weight and font that the metrics table was generated for', () => {
		const params = ACTIVITY_GRID_THEME.getParams() as Record<string, unknown>;
		expect(params.headerFontWeight).toBe(600);
		expect(String(params.fontFamily)).toMatch(/^'Geist'/);
	});

	it('app.css lays the header out the way the chrome assumes', () => {
		// One gap between the label and the funnel; no extra padding on the sort arrow.
		expect(appCss).toMatch(/\.ag-header-cell \.ag-cell-label-container \{\s*gap: var\(--ag-spacing\);/);
		expect(appCss).toMatch(/\.ag-header-cell \.ag-sort-indicator-icon \{\s*padding-left: 0;\s*padding-right: 0;/);
	});

	it('app.css sets the Activity header label the way ACTIVITY_HEADER_TEXT_CASE says', () => {
		const rule = appCss.match(/\.activity-grid \.ag-header-cell-text \{([^}]*)\}/)?.[1] ?? '';
		expect(/text-transform:\s*uppercase/.test(rule)).toBe(ACTIVITY_HEADER_TEXT_CASE.uppercase);
		const spacing = rule.match(/letter-spacing:\s*([\d.]+)em/)?.[1];
		expect(Number(spacing ?? 0)).toBe(ACTIVITY_HEADER_TEXT_CASE.letterSpacingEm);
	});
});

describe('headerTextWidth', () => {
	it('sums the font’s own advance widths', () => {
		const em = ['T', 'y', 'p', 'e'].reduce((sum, ch) => sum + GEIST_SEMIBOLD_ADVANCE_EM[ch.charCodeAt(0) - 32], 0);
		expect(headerTextWidth('Type', { fontSize: 14 })).toBeCloseTo(em * 14, 6);
	});

	it('scales with font size', () => {
		expect(headerTextWidth('Released', { fontSize: 28 })).toBeCloseTo(
			headerTextWidth('Released', { fontSize: 14 }) * 2,
			6,
		);
	});

	it('is wider for wide glyphs than narrow ones of the same count', () => {
		expect(headerTextWidth('WWWW')).toBeGreaterThan(headerTextWidth('iiii'));
	});

	it('counts a character outside the table as the widest glyph, so it never under-estimates', () => {
		expect(headerTextWidth('é', { fontSize: 10 })).toBeCloseTo(GEIST_SEMIBOLD_WIDEST_EM * 10, 6);
		for (const em of Object.values(GEIST_SEMIBOLD_ADVANCE_EM)) {
			expect(em).toBeLessThanOrEqual(GEIST_SEMIBOLD_WIDEST_EM);
		}
	});

	it('measures the label in capitals when the header uppercases it', () => {
		expect(headerTextWidth('Rated', { fontSize: 11, uppercase: true })).toBeCloseTo(
			headerTextWidth('RATED', { fontSize: 11 }),
			6,
		);
		expect(headerTextWidth('Rated', { fontSize: 11, uppercase: true })).toBeGreaterThan(
			headerTextWidth('Rated', { fontSize: 11 }),
		);
	});

	it('adds letter-spacing after every character, the last one included', () => {
		const plain = headerTextWidth('Genre', { fontSize: 11 });
		expect(headerTextWidth('Genre', { fontSize: 11, letterSpacingEm: 0.06 })).toBeCloseTo(plain + 5 * 0.06 * 11, 6);
	});

	it('has an entry for every printable ASCII character', () => {
		expect(Object.keys(GEIST_SEMIBOLD_ADVANCE_EM)).toHaveLength(95);
	});
});

describe('headerMinWidth', () => {
	const { padding, sort, filter } = ACTIVITY_HEADER_CHROME;

	it('is padding + measured label + sort arrow + funnel, rounded up', () => {
		const exact = padding * 2 + headerTextWidth('Released') + sort + filter;
		const width = headerMinWidth('Released');
		expect(Number.isInteger(width)).toBe(true);
		expect(width).toBeGreaterThanOrEqual(exact);
		expect(width).toBeLessThanOrEqual(Math.ceil(exact) + 3);
	});

	it('reserves the sort arrow only for sortable columns', () => {
		expect(headerMinWidth('Genre', { sortable: true }) - headerMinWidth('Genre', { sortable: false })).toBe(sort);
	});

	it('reserves the funnel only for filterable columns', () => {
		expect(headerMinWidth('Genre', { filter: true }) - headerMinWidth('Genre', { filter: false })).toBe(filter);
	});

	it('defaults to a sortable, filterable column', () => {
		expect(headerMinWidth('Type')).toBe(headerMinWidth('Type', { filter: true, sortable: true }));
	});

	it('an empty heading still keeps its padding', () => {
		expect(headerMinWidth('', { filter: false, sortable: false })).toBeGreaterThanOrEqual(padding * 2);
	});

	it('fits the headings that used to truncate at their old hand-tuned minimums', () => {
		// Old floors: Type 84, Rated 82, Duration 111, Released 105, Rating 111. Each cut its label to "…"
		// once the column was sorted or filtered, because the arrow and funnel had no reserved room.
		expect(headerMinWidth('Type')).toBeGreaterThan(84);
		expect(headerMinWidth('Rated')).toBeGreaterThan(82);
		expect(headerMinWidth('Duration')).toBeGreaterThan(111);
		expect(headerMinWidth('Released')).toBeGreaterThan(105);
	});
});
