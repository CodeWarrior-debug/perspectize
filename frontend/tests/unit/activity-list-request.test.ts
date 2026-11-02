/**
 * The Activity list key and request come from one builder (activityListRequest), which
 * ActivityTable and the route prefetch both use. These tests pin the key and the variables
 * for the URL states that matter, so the refactor is provably behaviour-preserving and a
 * future key/variable desync (see frontend/CLAUDE.md, queryKey rule) fails here.
 */
import { describe, it, expect } from 'vitest';
import { hashKey } from '@tanstack/svelte-query';
import { activityListRequest, cursorsAfterPage, LOADED_MODE_FIRST } from '$lib/queries/content';
import { queryKeys } from '$lib/queries/keys';
import {
	ALL_SEARCH_SCOPES,
	COL_TO_SORT,
	parseGridParams,
	searchScopesFor,
	urlParamsToGraphQLFilter,
} from '$lib/utils/gridUrlState';

const params = (qs: string) => parseGridParams(new URLSearchParams(qs));

describe('activityListRequest: key parity with the request it describes', () => {
	it('default (Loaded, first load): YouTube type filter, UPDATED_AT, first 10 in the key', () => {
		const req = activityListRequest(params(''), null);
		const expected = queryKeys.content.list({
			sortBy: 'UPDATED_AT',
			sortOrder: 'DESC',
			sorts: undefined,
			search: '',
			searchFields: ALL_SEARCH_SCOPES,
			first: 10,
			after: null,
			filter: { contentTypes: ['YOUTUBE_VIDEO'] },
			mode: 'loaded',
		});
		expect(hashKey(req.queryKey)).toBe(hashKey(expected));
		expect(req.variables).toEqual({
			first: LOADED_MODE_FIRST,
			after: null,
			sortBy: 'UPDATED_AT',
			sortOrder: 'DESC',
			sorts: undefined,
			filter: { contentTypes: ['YOUTUBE_VIDEO'] },
			includeTotalCount: true,
		});
	});

	it('"All" mode with a sort: the sort reaches both the key and the variables', () => {
		const req = activityListRequest(params(`mode=all&sort=views.desc`), null);
		const sorts = [{ field: COL_TO_SORT.views, order: 'DESC' as const }];
		const expected = queryKeys.content.list({
			sortBy: COL_TO_SORT.views,
			sortOrder: 'DESC',
			sorts,
			search: '',
			searchFields: ALL_SEARCH_SCOPES,
			first: 10,
			after: null,
			filter: { contentTypes: ['YOUTUBE_VIDEO'] },
			mode: 'all',
		});
		expect(hashKey(req.queryKey)).toBe(hashKey(expected));
		expect(req.variables.sorts).toEqual(sorts);
		expect(req.variables.first).toBe(10);
	});

	it('"All" mode with column filters: every filter reaches the key', () => {
		const req = activityListRequest(params('mode=all&f.type=movie&f.views=1000..5000'), null);
		const urlFilters = { type: 'movie', views: '1000..5000' };
		const filter = urlParamsToGraphQLFilter(urlFilters, '', ALL_SEARCH_SCOPES);
		const expected = queryKeys.content.list({
			sortBy: 'UPDATED_AT',
			sortOrder: 'DESC',
			sorts: [{ field: COL_TO_SORT.updatedAt, order: 'DESC' }],
			search: '',
			// A movie type filter turns Cast and Director on as search scopes.
			searchFields: searchScopesFor(urlFilters),
			first: 10,
			after: null,
			filter: filter as Record<string, unknown>,
			mode: 'all',
		});
		expect(req.variables.filter).toEqual(filter);
		expect(hashKey(req.queryKey)).toBe(hashKey(expected));
	});

	it('search text and scopes: the search is in the key and the variables', () => {
		const req = activityListRequest(params('q=matrix'), null);
		const filter = urlParamsToGraphQLFilter({ type: 'youtube_video' }, 'matrix', ALL_SEARCH_SCOPES);
		const expected = queryKeys.content.list({
			sortBy: 'UPDATED_AT',
			sortOrder: 'DESC',
			sorts: undefined,
			search: 'matrix',
			searchFields: ALL_SEARCH_SCOPES,
			first: 10,
			after: null,
			filter: filter as Record<string, unknown>,
			mode: 'loaded',
		});
		expect(hashKey(req.queryKey)).toBe(hashKey(expected));
		expect(req.variables.filter).toEqual(filter);
	});

	it('"Loaded" mode ignores the sort and the cursor in the request, and keeps them out of the variables', () => {
		const req = activityListRequest(params('mode=loaded&sort=views.desc'), null);
		expect(req.variables.sorts).toBeUndefined();
		expect(req.variables.sortBy).toBe('UPDATED_AT');
		expect(req.variables.after).toBeNull();
		expect(req.variables.first).toBe(LOADED_MODE_FIRST);
	});
});

describe('activityListRequest: every variable the request sends is in the key', () => {
	it('the cursor (after) changes the key in "All" mode', () => {
		const first = activityListRequest(params('mode=all'), null);
		const second = activityListRequest(params('mode=all'), 'cursor:10');
		expect(hashKey(first.queryKey)).not.toBe(hashKey(second.queryKey));
		expect(second.variables.after).toBe('cursor:10');
	});

	it('the page size changes the key and the "All" mode request', () => {
		const a = activityListRequest(params('mode=all&pageSize=10'), null);
		const b = activityListRequest(params('mode=all&pageSize=25'), null);
		expect(hashKey(a.queryKey)).not.toBe(hashKey(b.queryKey));
		expect(b.variables.first).toBe(25);
	});
});

describe('cursorsAfterPage: the cursor stack advances from loaded data (cache hits included)', () => {
	const more = { hasNextPage: true, endCursor: 'c2' };
	const none = { hasNextPage: false, endCursor: null };

	it('page 1 with a next page pushes its endCursor as the page 2 cursor', () => {
		expect(cursorsAfterPage([null], 1, more)).toEqual([null, 'c2']);
	});

	it('is a no-op when the stack already reaches this page (no repeat push)', () => {
		const stack = [null, 'c2'];
		expect(cursorsAfterPage(stack, 1, more)).toBe(stack);
	});

	it('pushes the next cursor when the furthest page is the one loaded', () => {
		expect(cursorsAfterPage([null, 'c2'], 2, { hasNextPage: true, endCursor: 'c3' })).toEqual([null, 'c2', 'c3']);
	});

	it('does not push for a page behind the furthest one (Previous, or a revisit)', () => {
		const stack = [null, 'c2', 'c3'];
		expect(cursorsAfterPage(stack, 2, { hasNextPage: true, endCursor: 'c3' })).toBe(stack);
	});

	it('does not push at the last page', () => {
		const stack = [null];
		expect(cursorsAfterPage(stack, 1, none)).toBe(stack);
	});
});
