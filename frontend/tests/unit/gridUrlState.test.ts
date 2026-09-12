import { describe, it, expect } from 'vitest';
import {
	parseGridParams,
	serializeGridParams,
	filterToUrlParams,
	urlParamsToFilter,
	urlParamsToGraphQLFilter,
	COL_TO_SORT,
	SORT_TO_COL,
	GRID_DEFAULTS,
} from '$lib/utils/gridUrlState';

// ---------------------------------------------------------------------------
// parseGridParams
// ---------------------------------------------------------------------------

describe('parseGridParams', () => {
	it('returns defaults for empty params', () => {
		const params = new URLSearchParams();
		const result = parseGridParams(params);
		expect(result).toEqual(GRID_DEFAULTS);
	});

	it('parses mode=all', () => {
		const params = new URLSearchParams('mode=all');
		expect(parseGridParams(params).mode).toBe('all');
	});

	it('falls back to default for unknown mode', () => {
		const params = new URLSearchParams('mode=unknown');
		expect(parseGridParams(params).mode).toBe(GRID_DEFAULTS.mode);
	});

	it('parses sort and dir', () => {
		const params = new URLSearchParams('sort=views&dir=asc');
		const result = parseGridParams(params);
		expect(result.sort).toBe('views');
		expect(result.dir).toBe('asc');
	});

	it('falls back to default dir for invalid value', () => {
		const params = new URLSearchParams('dir=sideways');
		expect(parseGridParams(params).dir).toBe(GRID_DEFAULTS.dir);
	});

	it('parses page and pageSize', () => {
		const params = new URLSearchParams('page=3&pageSize=25');
		const result = parseGridParams(params);
		expect(result.page).toBe(3);
		expect(result.pageSize).toBe(25);
	});

	it('falls back to default page for non-numeric value', () => {
		const params = new URLSearchParams('page=abc');
		expect(parseGridParams(params).page).toBe(GRID_DEFAULTS.page);
	});

	it('falls back to default page for page < 1', () => {
		const params = new URLSearchParams('page=0');
		expect(parseGridParams(params).page).toBe(GRID_DEFAULTS.page);
	});

	it('parses q (search)', () => {
		const params = new URLSearchParams('q=cooking+tutorial');
		expect(parseGridParams(params).q).toBe('cooking tutorial');
	});

	it('parses f.* filter params', () => {
		const params = new URLSearchParams('f.type=youtube&f.views=1000..5000');
		const result = parseGridParams(params);
		expect(result.filters).toEqual({ type: 'youtube', views: '1000..5000' });
	});

	it('ignores unknown params', () => {
		const params = new URLSearchParams('unknown=value&another=thing');
		const result = parseGridParams(params);
		expect(result.filters).toEqual({});
		expect(result.sort).toBe(GRID_DEFAULTS.sort);
	});

	it('collects multiple f.* params', () => {
		const params = new URLSearchParams('f.type=youtube&f.channel=mkbhd&f.views=1000..');
		const result = parseGridParams(params);
		expect(result.filters).toEqual({
			type: 'youtube',
			channel: 'mkbhd',
			views: '1000..',
		});
	});
});

// ---------------------------------------------------------------------------
// serializeGridParams
// ---------------------------------------------------------------------------

describe('serializeGridParams', () => {
	it('returns empty string for all defaults', () => {
		const result = serializeGridParams(GRID_DEFAULTS);
		expect(result).toBe('');
	});

	it('omits default mode', () => {
		const state = { ...GRID_DEFAULTS, mode: 'loaded' as const };
		expect(serializeGridParams(state)).not.toContain('mode');
	});

	it('omits default sort', () => {
		const state = { ...GRID_DEFAULTS, sort: 'updatedAt' };
		expect(serializeGridParams(state)).not.toContain('sort');
	});

	it('serializes mode=all', () => {
		const state = { ...GRID_DEFAULTS, mode: 'all' as const };
		const result = serializeGridParams(state);
		expect(result).toContain('mode=all');
	});

	it('serializes non-default sort', () => {
		const state = { ...GRID_DEFAULTS, sort: 'views', dir: 'asc' as const };
		const result = serializeGridParams(state);
		expect(result).toContain('sort=views');
		expect(result).toContain('dir=asc');
	});

	it('omits default page (1)', () => {
		const state = { ...GRID_DEFAULTS, page: 1 };
		expect(serializeGridParams(state)).not.toContain('page');
	});

	it('serializes non-default page', () => {
		const state = { ...GRID_DEFAULTS, page: 5 };
		const result = serializeGridParams(state);
		expect(result).toContain('page=5');
	});

	it('serializes non-default pageSize', () => {
		const state = { ...GRID_DEFAULTS, pageSize: 25 };
		const result = serializeGridParams(state);
		expect(result).toContain('pageSize=25');
	});

	it('serializes q (search term)', () => {
		const state = { ...GRID_DEFAULTS, q: 'cooking' };
		const result = serializeGridParams(state);
		expect(result).toContain('q=cooking');
	});

	it('serializes filters with f. prefix', () => {
		const state = { ...GRID_DEFAULTS, filters: { type: 'youtube', views: '1000..' } };
		const result = serializeGridParams(state);
		expect(result).toContain('f.type=youtube');
		expect(result).toContain('f.views=1000..');
	});

	it('round-trips with parseGridParams (defaults)', () => {
		const serialized = serializeGridParams(GRID_DEFAULTS);
		const parsed = parseGridParams(new URLSearchParams(serialized));
		expect(parsed).toEqual(GRID_DEFAULTS);
	});

	it('round-trips with parseGridParams (non-defaults)', () => {
		const state = {
			mode: 'all' as const,
			sort: 'views',
			dir: 'asc' as const,
			page: 3,
			pageSize: 25,
			q: 'tutorial',
			qFields: GRID_DEFAULTS.qFields,
			filters: { type: 'youtube', views: '1000..5000' },
		};
		const serialized = serializeGridParams(state);
		const parsed = parseGridParams(new URLSearchParams(serialized));
		expect(parsed).toEqual(state);
	});
});

// ---------------------------------------------------------------------------
// filterToUrlParams
// ---------------------------------------------------------------------------

describe('filterToUrlParams', () => {
	it('handles empty filter model', () => {
		expect(filterToUrlParams({})).toEqual({});
	});

	it('converts text filter to string param', () => {
		const filterModel = {
			type: { filterType: 'text', type: 'contains', filter: 'youtube' },
		};
		const result = filterToUrlParams(filterModel);
		expect(result).toEqual({ type: 'youtube' });
	});

	it('converts channel text filter', () => {
		const filterModel = {
			channel: { filterType: 'text', type: 'contains', filter: 'mkbhd' },
		};
		expect(filterToUrlParams(filterModel)).toEqual({ channel: 'mkbhd' });
	});

	it('converts tags text filter', () => {
		const filterModel = {
			tags: { filterType: 'text', type: 'contains', filter: 'cooking' },
		};
		expect(filterToUrlParams(filterModel)).toEqual({ tags: 'cooking' });
	});

	it('converts description text filter', () => {
		const filterModel = {
			description: { filterType: 'text', type: 'contains', filter: 'tutorial' },
		};
		expect(filterToUrlParams(filterModel)).toEqual({ desc: 'tutorial' });
	});

	it('converts number greaterThan to range "1000.."', () => {
		const filterModel = {
			views: { filterType: 'number', type: 'greaterThan', filter: 1000 },
		};
		expect(filterToUrlParams(filterModel)).toEqual({ views: '1000..' });
	});

	it('converts number greaterThanOrEqual to range "1000.."', () => {
		const filterModel = {
			views: { filterType: 'number', type: 'greaterThanOrEqual', filter: 1000 },
		};
		expect(filterToUrlParams(filterModel)).toEqual({ views: '1000..' });
	});

	it('converts number lessThan to range "..5000"', () => {
		const filterModel = {
			views: { filterType: 'number', type: 'lessThan', filter: 5000 },
		};
		expect(filterToUrlParams(filterModel)).toEqual({ views: '..5000' });
	});

	it('converts number lessThanOrEqual to range "..5000"', () => {
		const filterModel = {
			views: { filterType: 'number', type: 'lessThanOrEqual', filter: 5000 },
		};
		expect(filterToUrlParams(filterModel)).toEqual({ views: '..5000' });
	});

	it('converts number inRange to range "1000..5000"', () => {
		const filterModel = {
			views: { filterType: 'number', type: 'inRange', filter: 1000, filterTo: 5000 },
		};
		expect(filterToUrlParams(filterModel)).toEqual({ views: '1000..5000' });
	});

	it('converts duration number filter', () => {
		const filterModel = {
			duration: { filterType: 'number', type: 'inRange', filter: 60, filterTo: 600 },
		};
		expect(filterToUrlParams(filterModel)).toEqual({ duration: '60..600' });
	});

	it('converts likes number filter', () => {
		const filterModel = {
			likes: { filterType: 'number', type: 'greaterThan', filter: 500 },
		};
		expect(filterToUrlParams(filterModel)).toEqual({ likes: '500..' });
	});

	it('converts date filter to ISO range (inRange)', () => {
		const filterModel = {
			publishDate: { filterType: 'date', type: 'inRange', dateFrom: '2024-01-01', dateTo: '2024-06-30' },
		};
		expect(filterToUrlParams(filterModel)).toEqual({ date: '2024-01..2024-06' });
	});

	it('converts date filter (from only)', () => {
		const filterModel = {
			createdAt: { filterType: 'date', type: 'greaterThanOrEqual', dateFrom: '2024-01-01' },
		};
		expect(filterToUrlParams(filterModel)).toEqual({ added: '2024-01..' });
	});

	it('converts date filter (to only)', () => {
		const filterModel = {
			updatedAt: { filterType: 'date', type: 'lessThanOrEqual', dateTo: '2024-12-31' },
		};
		expect(filterToUrlParams(filterModel)).toEqual({ updated: '..2024-12' });
	});

	it('skips unknown column colIds', () => {
		const filterModel = {
			unknownCol: { filterType: 'text', type: 'contains', filter: 'value' },
		};
		expect(filterToUrlParams(filterModel)).toEqual({});
	});

	it('skips text filter with empty value', () => {
		const filterModel = {
			type: { filterType: 'text', type: 'contains', filter: '' },
		};
		expect(filterToUrlParams(filterModel)).toEqual({});
	});

	it('converts multiple filters', () => {
		const filterModel = {
			type: { filterType: 'text', type: 'contains', filter: 'youtube' },
			views: { filterType: 'number', type: 'greaterThan', filter: 1000 },
		};
		expect(filterToUrlParams(filterModel)).toEqual({ type: 'youtube', views: '1000..' });
	});
});

// ---------------------------------------------------------------------------
// urlParamsToFilter
// ---------------------------------------------------------------------------

describe('urlParamsToFilter', () => {
	it('returns empty object for empty filters', () => {
		expect(urlParamsToFilter({})).toEqual({});
	});

	it('converts text param to AG Grid text filter', () => {
		const result = urlParamsToFilter({ type: 'youtube' });
		expect(result).toEqual({
			type: { filterType: 'text', type: 'contains', filter: 'youtube' },
		});
	});

	it('converts channel text param', () => {
		const result = urlParamsToFilter({ channel: 'mkbhd' });
		expect(result).toEqual({
			channel: { filterType: 'text', type: 'contains', filter: 'mkbhd' },
		});
	});

	it('converts tags text param', () => {
		const result = urlParamsToFilter({ tags: 'cooking' });
		expect(result).toEqual({
			tags: { filterType: 'text', type: 'contains', filter: 'cooking' },
		});
	});

	it('converts desc text param', () => {
		const result = urlParamsToFilter({ desc: 'tutorial' });
		expect(result).toEqual({
			description: { filterType: 'text', type: 'contains', filter: 'tutorial' },
		});
	});

	it('converts range "1000.." to number greaterThan', () => {
		const result = urlParamsToFilter({ views: '1000..' });
		expect(result).toEqual({
			views: { filterType: 'number', type: 'greaterThan', filter: 1000 },
		});
	});

	it('converts range "..5000" to number lessThan', () => {
		const result = urlParamsToFilter({ views: '..5000' });
		expect(result).toEqual({
			views: { filterType: 'number', type: 'lessThan', filter: 5000 },
		});
	});

	it('converts range "1000..5000" to number inRange', () => {
		const result = urlParamsToFilter({ views: '1000..5000' });
		expect(result).toEqual({
			views: { filterType: 'number', type: 'inRange', filter: 1000, filterTo: 5000 },
		});
	});

	it('converts duration range', () => {
		const result = urlParamsToFilter({ duration: '60..600' });
		expect(result).toEqual({
			duration: { filterType: 'number', type: 'inRange', filter: 60, filterTo: 600 },
		});
	});

	it('converts likes range', () => {
		const result = urlParamsToFilter({ likes: '500..' });
		expect(result).toEqual({
			likes: { filterType: 'number', type: 'greaterThan', filter: 500 },
		});
	});

	it('converts date range "2024-01..2024-06" to date inRange filter', () => {
		const result = urlParamsToFilter({ date: '2024-01..2024-06' });
		expect(result).toEqual({
			publishDate: { filterType: 'date', type: 'inRange', dateFrom: '2024-01', dateTo: '2024-06' },
		});
	});

	it('converts date range from only "2024-01.."', () => {
		const result = urlParamsToFilter({ added: '2024-01..' });
		expect(result).toEqual({
			createdAt: { filterType: 'date', type: 'greaterThanOrEqual', dateFrom: '2024-01' },
		});
	});

	it('converts date range to only "..2024-12"', () => {
		const result = urlParamsToFilter({ updated: '..2024-12' });
		expect(result).toEqual({
			updatedAt: { filterType: 'date', type: 'lessThanOrEqual', dateTo: '2024-12' },
		});
	});

	it('skips unknown filter keys', () => {
		const result = urlParamsToFilter({ unknown: 'value' });
		expect(result).toEqual({});
	});

	it('converts multiple filters', () => {
		const result = urlParamsToFilter({ type: 'youtube', views: '1000..' });
		expect(result.type).toBeDefined();
		expect(result.views).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// urlParamsToGraphQLFilter
// ---------------------------------------------------------------------------

describe('urlParamsToGraphQLFilter', () => {
	it('returns undefined for empty filters and no search', () => {
		expect(urlParamsToGraphQLFilter({}, '')).toBeUndefined();
	});

	it('maps q (search) to search field, defaulting to all search scopes', () => {
		const result = urlParamsToGraphQLFilter({}, 'cooking');
		expect(result).toEqual({
			search: 'cooking',
			searchFields: ['TITLE', 'DESCRIPTION', 'CHANNEL_TITLE', 'TAGS'],
		});
	});

	it('omits searchFields when scoped to TITLE only (matches the server default)', () => {
		const result = urlParamsToGraphQLFilter({}, 'cooking', ['title']);
		expect(result).toEqual({ search: 'cooking' });
	});

	it('sends a narrowed searchFields list for a partial scope', () => {
		const result = urlParamsToGraphQLFilter({}, 'cooking', ['title', 'desc']);
		expect(result).toEqual({ search: 'cooking', searchFields: ['TITLE', 'DESCRIPTION'] });
	});

	it('maps f.type to contentType (uppercased)', () => {
		const result = urlParamsToGraphQLFilter({ type: 'youtube' }, '');
		expect(result).toEqual({ contentType: 'YOUTUBE' });
	});

	it('maps f.views range to minViewCount/maxViewCount', () => {
		const result = urlParamsToGraphQLFilter({ views: '1000..5000' }, '');
		expect(result).toEqual({ minViewCount: 1000, maxViewCount: 5000 });
	});

	it('maps f.views min only to minViewCount', () => {
		const result = urlParamsToGraphQLFilter({ views: '1000..' }, '');
		expect(result).toEqual({ minViewCount: 1000 });
	});

	it('maps f.views max only to maxViewCount', () => {
		const result = urlParamsToGraphQLFilter({ views: '..5000' }, '');
		expect(result).toEqual({ maxViewCount: 5000 });
	});

	it('maps f.likes range to minLikeCount/maxLikeCount', () => {
		const result = urlParamsToGraphQLFilter({ likes: '100..500' }, '');
		expect(result).toEqual({ minLikeCount: 100, maxLikeCount: 500 });
	});

	it('maps f.duration range to minLengthSeconds/maxLengthSeconds', () => {
		const result = urlParamsToGraphQLFilter({ duration: '60..600' }, '');
		expect(result).toEqual({ minLengthSeconds: 60, maxLengthSeconds: 600 });
	});

	it('maps f.date range to publishedAfter/publishedBefore', () => {
		const result = urlParamsToGraphQLFilter({ date: '2024-01..2024-06' }, '');
		expect(result).toEqual({ publishedAfter: '2024-01', publishedBefore: '2024-06' });
	});

	it('maps f.date from-only', () => {
		const result = urlParamsToGraphQLFilter({ date: '2024-01..' }, '');
		expect(result).toEqual({ publishedAfter: '2024-01' });
	});

	it('maps f.channel to channelTitle', () => {
		const result = urlParamsToGraphQLFilter({ channel: 'mkbhd' }, '');
		expect(result).toEqual({ channelTitle: 'mkbhd' });
	});

	it('maps f.tags to tagContains', () => {
		const result = urlParamsToGraphQLFilter({ tags: 'cooking' }, '');
		expect(result).toEqual({ tagContains: 'cooking' });
	});

	it('maps f.desc to descriptionSearch', () => {
		const result = urlParamsToGraphQLFilter({ desc: 'tutorial' }, '');
		expect(result).toEqual({ descriptionSearch: 'tutorial' });
	});

	it('maps f.added range to createdAfter/createdBefore', () => {
		const result = urlParamsToGraphQLFilter({ added: '2024-01..2024-12' }, '');
		expect(result).toEqual({ createdAfter: '2024-01', createdBefore: '2024-12' });
	});

	it('maps f.updated range to updatedAfter/updatedBefore', () => {
		const result = urlParamsToGraphQLFilter({ updated: '..2024-06' }, '');
		expect(result).toEqual({ updatedBefore: '2024-06' });
	});

	it('combines multiple filters and search', () => {
		const result = urlParamsToGraphQLFilter({ type: 'youtube', views: '1000..' }, 'cooking');
		expect(result).toEqual({
			search: 'cooking',
			searchFields: ['TITLE', 'DESCRIPTION', 'CHANNEL_TITLE', 'TAGS'],
			contentType: 'YOUTUBE',
			minViewCount: 1000,
		});
	});

	it('maps item filter to search field', () => {
		const result = urlParamsToGraphQLFilter({ item: 'baby shark' }, '');
		expect(result).toEqual({ search: 'baby shark' });
	});

	it('item filter overrides search bar value', () => {
		const result = urlParamsToGraphQLFilter({ item: 'specific title' }, 'broad search');
		expect(result).toEqual({
			search: 'specific title',
			searchFields: ['TITLE', 'DESCRIPTION', 'CHANNEL_TITLE', 'TAGS'],
		});
	});

	it('ignores empty filter values', () => {
		const result = urlParamsToGraphQLFilter({ type: '' }, '');
		expect(result).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// COL_TO_SORT / SORT_TO_COL
// ---------------------------------------------------------------------------

describe('COL_TO_SORT / SORT_TO_COL', () => {
	it('COL_TO_SORT has entries for all expected columns', () => {
		expect(COL_TO_SORT.item).toBe('NAME');
		expect(COL_TO_SORT.duration).toBe('LENGTH');
		expect(COL_TO_SORT.views).toBe('VIEW_COUNT');
		expect(COL_TO_SORT.likes).toBe('LIKE_COUNT');
		expect(COL_TO_SORT.publishDate).toBe('PUBLISHED_AT');
		expect(COL_TO_SORT.channel).toBe('CHANNEL_TITLE');
		expect(COL_TO_SORT.createdAt).toBe('CREATED_AT');
		expect(COL_TO_SORT.updatedAt).toBe('UPDATED_AT');
	});

	it('SORT_TO_COL has entries for all sort values', () => {
		expect(SORT_TO_COL.NAME).toBe('item');
		expect(SORT_TO_COL.LENGTH).toBe('duration');
		expect(SORT_TO_COL.VIEW_COUNT).toBe('views');
		expect(SORT_TO_COL.LIKE_COUNT).toBe('likes');
		expect(SORT_TO_COL.PUBLISHED_AT).toBe('publishDate');
		expect(SORT_TO_COL.CHANNEL_TITLE).toBe('channel');
		expect(SORT_TO_COL.CREATED_AT).toBe('createdAt');
		expect(SORT_TO_COL.UPDATED_AT).toBe('updatedAt');
	});

	it('round-trips all sortable columns (col → sort → col)', () => {
		// All SORT_TO_COL values should appear as keys in COL_TO_SORT
		const sortableColIds = Object.values(SORT_TO_COL);
		for (const colId of sortableColIds) {
			const sortBy = COL_TO_SORT[colId];
			expect(sortBy).toBeDefined();
			// Going back from sortBy to colId should give the same colId
			expect(SORT_TO_COL[sortBy]).toBe(colId);
		}
	});

	it('has item in COL_TO_SORT mapping to NAME', () => {
		expect(COL_TO_SORT['item']).toBe('NAME');
		expect(SORT_TO_COL['NAME']).toBe('item');
	});
});
