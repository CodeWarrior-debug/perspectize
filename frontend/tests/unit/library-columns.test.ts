/**
 * The Library column module's interface: each column is defined once, and every list, map and
 * ColDef the Library uses is derived from that one definition. These tests go through the module
 * and the grid builder (no source-text parsing), so a column missing from one of them fails here.
 */
import { describe, it, expect } from 'vitest';
import type { ContentItem } from '#lib/queries/content/index.js';
import { buildLibraryColumnDefs } from '#lib/components/library/columns.js';
import {
	LIBRARY_COLUMNS,
	DATA_COLUMNS,
	INTERNAL_COLUMNS,
	SORTABLE_COLUMNS,
	CLIENT_ONLY_FILTER_COLS,
	CLIENT_ONLY_SORT_COLS,
	COL_TO_FILTER_KEY,
	COL_TO_SORT,
	RETIRED_COL_IDS,
	NUMERIC_COL_IDS,
	EXPORT_EXCLUDED_COLIDS,
	RENDERED_TEXT_COLIDS,
	SPREADSHEET_FORMATTED_COLIDS,
	chartableColIds,
	defaultColumnVisibility,
	exportCellText,
	initiallyHidden,
	isChartEligible,
	libraryColumn,
	sortableColumnsFor,
	togglableColIds,
} from '#lib/utils/libraryColumns/index.js';
import { compareContentBySorts, filterContentRows } from '#lib/utils/libraryColumns/clientRows.js';
import { urlParamsToFilter } from '#lib/utils/gridUrlState.js';
import { ratedComparator, unknownLastComparator } from '#lib/utils/grid-config.js';
import { headerMinWidth } from '#lib/utils/grid-header-width.js';
import type { ColDef } from '@ag-grid-community/core';

const LIBRARY_GRID_WIDTH = 1212;

const defs = buildLibraryColumnDefs({
	chartHeaderParams: (colId) => ({ template: `chart:${colId}` }),
	suppressChartKeyboard: () => false,
});

function colDef(colId: string): ColDef<ContentItem> {
	const def = defs.find((d) => d.colId === colId);
	if (!def) throw new Error(`no colDef for ${colId}`);
	return def;
}

/** Sum of the effective minimum widths (header floor included) of the given columns. */
function totalMinWidth(colIds: string[]): number {
	return colIds.reduce((sum, id) => sum + (colDef(id).minWidth ?? 0), 0);
}

/** AG Grid calls comparator(a, b, nodeA, nodeB, isDescending) and negates the result for descending. */
function agSort<T>(values: T[], cmp: (a: T, b: T, na: unknown, nb: unknown, desc: boolean) => number, desc: boolean) {
	return [...values].sort((a, b) => (desc ? -1 : 1) * cmp(a, b, null, null, desc));
}

describe('column definitions', () => {
	it('lists each colId once', () => {
		const ids = LIBRARY_COLUMNS.map((c) => c.colId);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('gives every grid column a ColDef, with the same colId set', () => {
		expect(defs.map((d) => d.colId).sort()).toEqual(LIBRARY_COLUMNS.map((c) => c.colId).sort());
	});

	it('every filterable column has a server mapping or is explicitly client-only', () => {
		for (const col of LIBRARY_COLUMNS) {
			if (!col.filter) continue;
			expect(col.filter.server !== undefined || col.filter.clientOnly === true, col.colId).toBe(true);
		}
	});

	it('the client-only filters are the Webpage Site, Published and Author (until the server fields ship)', () => {
		expect([...CLIENT_ONLY_FILTER_COLS].sort()).toEqual(['webAuthor', 'webPublished', 'webSite']);
	});

	it('Released has a server sort (RELEASE_DATE) and is not client-only', () => {
		expect(COL_TO_SORT.released).toBe('RELEASE_DATE');
		expect(CLIENT_ONLY_SORT_COLS).not.toContain('released');
	});

	it('retires percentLiked: not a column, and not in any default layout', () => {
		expect([...RETIRED_COL_IDS]).toEqual(['percentLiked']);
		expect(LIBRARY_COLUMNS.map((c) => c.colId)).not.toContain('percentLiked');
		expect(defaultColumnVisibility('lg', 'general').visible).not.toContain('percentLiked');
	});
});

describe('column pickers', () => {
	it('offers every grid column except the always-visible item and perspectize', () => {
		const expected = defs.map((d) => d.colId).filter((id) => id !== 'item' && id !== 'perspectize');
		expect([...togglableColIds(true)].sort()).toEqual(expected.sort());
	});

	it('takes every label from the grid header', () => {
		for (const col of [...DATA_COLUMNS, ...INTERNAL_COLUMNS, ...SORTABLE_COLUMNS]) {
			expect(col.label, col.colId).toBe(colDef(col.colId).headerName);
		}
	});

	it('does not offer Type in the sort picker, though the grid can sort by it', () => {
		expect(SORTABLE_COLUMNS.map((c) => c.colId)).not.toContain('type');
		expect(COL_TO_SORT.type).toBe('NAME');
	});

	it('hides the client-only sorts in All Items mode', () => {
		const all = sortableColumnsFor('all').map((c) => c.colId);
		for (const id of CLIENT_ONLY_SORT_COLS) expect(all, id).not.toContain(id);
		expect(sortableColumnsFor('loaded').map((c) => c.colId)).toEqual(SORTABLE_COLUMNS.map((c) => c.colId));
	});
});

describe('server maps', () => {
	it('maps the Movie sorts to their backend enums', () => {
		expect(COL_TO_SORT).toMatchObject({
			boxOffice: 'BOX_OFFICE',
			vsBudget: 'VS_BUDGET',
			rated: 'AGE_RATING',
			tmdbScore: 'TMDB_SCORE',
		});
	});

	it('keeps Vs. budget unfiltered (derived value, no backend field)', () => {
		expect(COL_TO_FILTER_KEY.vsBudget).toBeUndefined();
		expect(libraryColumn('vsBudget')?.filter).toBeUndefined();
	});

	it('maps Published, Pages and Book rating to their server range filters', () => {
		expect(COL_TO_FILTER_KEY).toMatchObject({ published: 'published', pages: 'pages', rating: 'bookrating' });
		expect(urlParamsToFilter({ pages: '100..400' })).toEqual({
			pages: { filterType: 'number', type: 'inRange', filter: 100, filterTo: 400 },
		});
	});
});

describe('grid ColDefs', () => {
	it('floors every column at its header width', () => {
		for (const def of defs) {
			const header = headerMinWidth(def.headerName ?? '', {
				filter: def.filter !== false,
				sortable: def.sortable !== false,
			});
			expect(def.minWidth, def.colId).toBeGreaterThanOrEqual(header);
		}
	});

	it('keeps every minWidth at or under its maxWidth', () => {
		for (const def of defs) {
			if (def.maxWidth !== undefined) expect(def.minWidth, def.colId).toBeLessThanOrEqual(def.maxWidth);
		}
	});

	it('starts each column hidden unless the general set shows it at the widest tier', () => {
		for (const def of defs) {
			expect(def.hide ?? false, def.colId).toBe(initiallyHidden(def.colId ?? ''));
		}
	});

	it('the default sets fit the 1212px grid', () => {
		expect(totalMinWidth(defaultColumnVisibility('lg', 'general').visible)).toBeLessThanOrEqual(LIBRARY_GRID_WIDTH);
		expect(totalMinWidth(defaultColumnVisibility('lg', 'claim', 'claim').visible)).toBeLessThanOrEqual(
			LIBRARY_GRID_WIDTH,
		);
		const movie = defaultColumnVisibility('lg', 'movie', 'movie').visible;
		expect(movie).not.toContain('type');
		expect(totalMinWidth(movie)).toBeLessThanOrEqual(LIBRARY_GRID_WIDTH);
		for (const tier of ['md', 'lg'] as const) {
			expect(totalMinWidth(defaultColumnVisibility(tier, 'book', 'book').visible), tier).toBeLessThanOrEqual(
				LIBRARY_GRID_WIDTH,
			);
		}
	});

	it('the Movie lg set keeps its header-derived floors', () => {
		const visible = defaultColumnVisibility('lg', 'movie', 'movie').visible;
		const widths = Object.fromEntries(visible.map((id) => [id, colDef(id).minWidth]));
		expect(widths).toMatchObject({ item: 175, genre: 79, rated: 110, cast: 125, released: 133, tmdbScore: 115 });
	});

	it('uses the module comparators for the Rated, Box office and Vs. budget columns', () => {
		expect(colDef('rated').comparator).toBe(ratedComparator);
		expect(colDef('boxOffice').comparator).toBe(unknownLastComparator);
		expect(colDef('vsBudget').comparator).toBe(unknownLastComparator);
	});

	it('Published renders the plain year, not the thousands-separated number', () => {
		const format = colDef('published').valueFormatter as (p: { value: number }) => string;
		expect(format({ value: 1999 })).toBe('1999');
	});

	it('keeps the perspective control as the pinned, never-sorted first column', () => {
		expect(colDef('perspectize')).toMatchObject({ pinned: 'left', sortable: false, width: 50 });
	});
});

describe('numeric and chart columns', () => {
	it('right-aligns the numeric columns, Book pages and rating included', () => {
		expect([...NUMERIC_COL_IDS].sort()).toEqual(
			['boxOffice', 'budget', 'duration', 'likes', 'pages', 'rating', 'tmdbScore', 'views', 'vsBudget', 'votes'].sort(),
		);
		for (const id of NUMERIC_COL_IDS) expect(colDef(id).type, id).toBe('rightAligned');
		expect(colDef('published').type).toBeUndefined();
		expect(colDef('tmdbId').type).toBeUndefined();
	});

	it('charts Book pages and rating in the Book view, and the Movie numbers in the Movie view', () => {
		expect(isChartEligible('pages', 'book')).toBe(true);
		expect(isChartEligible('rating', 'book')).toBe(true);
		expect(isChartEligible('pages', 'movie')).toBe(false);
		expect(isChartEligible('boxOffice', 'movie')).toBe(true);
		expect(isChartEligible('views', 'youtube_video')).toBe(false);
		expect(chartableColIds('book')).toEqual(['pages', 'rating']);
	});

	it('gives each chartable column its header chart button', () => {
		expect(colDef('pages').headerComponentParams).toBeTypeOf('function');
		expect(colDef('published').headerComponentParams).toBeUndefined();
	});
});

describe('client-side rows', () => {
	const rows = [
		{ id: 'a', name: 'Beta', viewCount: 10, publishedAt: '2020-01-01T00:00:00Z', contentType: 'YOUTUBE_VIDEO' },
		{ id: 'b', name: 'alpha', viewCount: null, publishedAt: '2021-06-01T00:00:00Z', contentType: 'MOVIE' },
		{ id: 'c', name: 'Gamma', viewCount: 7, publishedAt: null, contentType: 'BOOK' },
	] as unknown as ContentItem[];

	it('sorts by the column value, unknown last in both directions', () => {
		const sortedIds = (col: string, dir: 'asc' | 'desc') =>
			[...rows].sort((a, b) => compareContentBySorts(a, b, [{ col, dir }])).map((r) => r.id);
		expect(sortedIds('views', 'asc')).toEqual(['c', 'a', 'b']);
		expect(sortedIds('views', 'desc')).toEqual(['a', 'c', 'b']);
		expect(sortedIds('item', 'asc')).toEqual(['b', 'a', 'c']);
	});

	it('filters a number range and a set on the column values', () => {
		expect(filterContentRows(rows, urlParamsToFilter({ views: '5..' })).map((r) => r.id)).toEqual(['a', 'c']);
		expect(filterContentRows(rows, urlParamsToFilter({ type: 'movie' })).map((r) => r.id)).toEqual(['b']);
	});
});

describe('exports', () => {
	it('reads renderer-only columns from the row, and excludes the perspective control', () => {
		expect([...RENDERED_TEXT_COLIDS].sort()).toEqual(['author', 'cast', 'category', 'item', 'webRoles']);
		expect([...EXPORT_EXCLUDED_COLIDS]).toEqual(['perspectize']);
	});

	it('keeps the formatted text for length, the 0-100 ratings and identifiers', () => {
		expect([...SPREADSHEET_FORMATTED_COLIDS].sort()).toEqual(
			['duration', 'myAgreement', 'myImportance', 'myQuality', 'tmdbId'].sort(),
		);
	});

	it('exports the item title from the row, not the grid value', () => {
		const row = { name: 'Lasagna', displayTitle: "Nonna's Lasagna" } as unknown as ContentItem;
		expect(exportCellText(row, 'item', undefined)).toBe("Nonna's Lasagna");
	});
});

// The grid's left-to-right order. It is not the column-picker order; these literals pin what the
// grid shows, so a reorder is a deliberate, visible change.
describe('grid column order', () => {
	const orderedVisible = (tier: 'lg', view: Parameters<typeof defaultColumnVisibility>[1], solo: string | null) => {
		const visible = new Set(defaultColumnVisibility(tier, view, solo).visible);
		return defs.map((d) => d.colId).filter((id): id is string => !!id && visible.has(id));
	};

	it('pins the full grid order', () => {
		expect(defs.map((d) => d.colId)).toEqual([
			'perspectize',
			'item',
			'type',
			'category',
			'effectiveDate',
			'evaluateBy',
			'myQuality',
			'myImportance',
			'myAgreement',
			'genre',
			'rated',
			'cast',
			'duration',
			'views',
			'likes',
			'released',
			'boxOffice',
			'vsBudget',
			'tmdbScore',
			'publishDate',
			'channel',
			'user',
			'tags',
			'description',
			'webSite',
			'webPublished',
			'webRoles',
			'webAuthor',
			'author',
			'published',
			'pages',
			'rating',
			'editions',
			'readers',
			'budget',
			'votes',
			'collection',
			'synopsis',
			'tmdbId',
			'updatedAt',
			'createdAt',
			'id',
			'addedByUserID',
			'url',
		]);
	});

	it('pins the default column order per view at lg', () => {
		expect(orderedVisible('lg', 'general', null)).toEqual([
			'perspectize',
			'item',
			'type',
			'category',
			'duration',
			'views',
			'likes',
			'publishDate',
			'channel',
			'tags',
		]);
		expect(orderedVisible('lg', 'movie', 'movie')).toEqual([
			'perspectize',
			'item',
			'genre',
			'rated',
			'cast',
			'duration',
			'released',
			'boxOffice',
			'vsBudget',
			'tmdbScore',
			'tags',
		]);
		expect(orderedVisible('lg', 'book', 'book')).toEqual([
			'perspectize',
			'item',
			'tags',
			'author',
			'published',
			'pages',
			'rating',
		]);
		expect(orderedVisible('lg', 'claim', 'claim')).toEqual([
			'perspectize',
			'item',
			'category',
			'effectiveDate',
			'evaluateBy',
			'myQuality',
			'myImportance',
			'myAgreement',
		]);
		expect(orderedVisible('lg', 'webpage', 'web_page')).toEqual([
			'perspectize',
			'item',
			'category',
			'webSite',
			'webPublished',
			'createdAt',
		]);
	});

	it('pins the first-paint hide flags for category and user', () => {
		expect(colDef('category').hide).toBe(true);
		expect(colDef('user').hide).toBe(false);
	});
});
