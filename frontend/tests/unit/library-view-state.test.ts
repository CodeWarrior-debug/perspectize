import { describe, it, expect, vi, afterEach } from 'vitest';
import { createLibraryViewState } from '#lib/components/library/libraryViewState.svelte.js';
import { libraryListRequest } from '#lib/queries/content/libraryList.js';
import { parseGridParams } from '#lib/utils/gridUrlState.js';
import { CLIENT_ONLY_SORT_COLS } from '#lib/utils/grid-config.js';
import type { ContentItem } from '#lib/queries/content/index.js';

// A URL adapter over a plain closure. The module reads the URL through plain getters, so no reactivity is needed here.
function fakeUrl(initial: string) {
	let search = initial;
	const navigations: { href: string; replace: boolean }[] = [];
	return {
		navigations,
		url: {
			search: () => search,
			pathname: () => '/content-library',
			navigate: (href: string, replace: boolean) => {
				navigations.push({ href, replace });
				search = href.startsWith('?') ? href.slice(1) : '';
			},
		},
	};
}

function setup(initial = '') {
	const fake = fakeUrl(initial);
	const resetCursors = vi.fn();
	const view = createLibraryViewState({ url: fake.url, resetCursors });
	return { view, resetCursors, navigations: fake.navigations };
}

/** The params a page would read from the most recent navigation. */
function lastParams(navigations: { href: string }[]) {
	return parseGridParams(new URLSearchParams(navigations.at(-1)!.href.replace(/^\?/, '')));
}

const views = (min: number) => ({ views: { filterType: 'number', type: 'greaterThanOrEqual', filter: min } });
const youtubeOnly = { type: { filterType: 'set', values: ['youtube_video'] } };

afterEach(() => {
	vi.useRealTimers();
});

describe('data mode', () => {
	it('setMode(all) resets cursors once and writes mode=all on page 1', () => {
		const { view, resetCursors, navigations } = setup();
		view.setMode('all');
		expect(resetCursors).toHaveBeenCalledTimes(1);
		expect(navigations).toHaveLength(1);
		expect(lastParams(navigations)).toMatchObject({ mode: 'all', page: 1 });
	});

	it('setMode(loaded) clears the Loaded sort list', () => {
		const { view } = setup();
		view.sortsFromGrid([{ col: 'views', dir: 'asc' }]);
		expect(view.activeSorts).toEqual([{ col: 'views', dir: 'asc' }]);
		view.setMode('all');
		view.setMode('loaded');
		expect(view.activeSorts).toEqual([]);
	});

	it('setMode(all) carries a pending grid filter into the URL and the commit that follows is a no-op', () => {
		vi.useFakeTimers();
		const { view, navigations, resetCursors } = setup();
		view.gridFilterChanged({ ...views(100), ...youtubeOnly });
		view.setMode('all');
		expect(lastParams(navigations).filters).toEqual({ type: 'youtube_video', views: '100..' });
		vi.advanceTimersByTime(1000);
		expect(navigations).toHaveLength(1);
		expect(resetCursors).toHaveBeenCalledTimes(1);
	});
});

describe('sorts', () => {
	it('setSorts in All writes the sort to the URL, resets cursors and returns to page 1', () => {
		const { view, resetCursors, navigations } = setup('mode=all');
		view.setSorts([{ col: 'views', dir: 'desc' }]);
		expect(resetCursors).toHaveBeenCalledTimes(1);
		expect(lastParams(navigations)).toMatchObject({ sorts: [{ col: 'views', dir: 'desc' }], page: 1 });
	});

	it('setSorts in Loaded does not navigate or reset cursors; activeSorts shows the new list', () => {
		const { view, resetCursors, navigations } = setup();
		view.setSorts([{ col: 'views', dir: 'asc' }]);
		expect(navigations).toHaveLength(0);
		expect(resetCursors).not.toHaveBeenCalled();
		expect(view.activeSorts).toEqual([{ col: 'views', dir: 'asc' }]);
	});

	it('sortsFromGrid in All with the server sorts changes nothing', () => {
		const { view, resetCursors, navigations } = setup('mode=all');
		view.sortsFromGrid(view.serverSorts);
		expect(navigations).toHaveLength(0);
		expect(resetCursors).not.toHaveBeenCalled();
	});

	it('a stale client-only URL sort is excluded from the server and active sorts and is not rewritten', () => {
		const clientOnly = CLIENT_ONLY_SORT_COLS[0];
		const { view, resetCursors, navigations } = setup(`mode=all&sort=${clientOnly}.asc`);
		expect(view.sorts).toEqual([{ col: clientOnly, dir: 'asc' }]);
		expect(view.serverSorts).toEqual([]);
		expect(view.activeSorts).toEqual([]);
		view.sortsFromGrid(view.serverSorts);
		expect(navigations).toHaveLength(0);
		expect(resetCursors).not.toHaveBeenCalled();
	});

	it('clearSorts in All writes sort=none and returns to page 1', () => {
		const { view, resetCursors, navigations } = setup('mode=all&page=3');
		view.clearSorts();
		expect(resetCursors).toHaveBeenCalledTimes(1);
		expect(lastParams(navigations)).toMatchObject({ sorts: [], page: 1 });
	});
});

describe('filters', () => {
	it('gridFilterChanged shows the chips at once and writes the URL only after 500 ms, with cursor reset in All', () => {
		vi.useFakeTimers();
		const { view, navigations, resetCursors } = setup('mode=all');
		const model = { ...views(100), ...youtubeOnly };
		view.gridFilterChanged(model);
		expect(view.chips('')).toEqual(model);
		expect(navigations).toHaveLength(0);
		vi.advanceTimersByTime(499);
		expect(navigations).toHaveLength(0);
		vi.advanceTimersByTime(1);
		expect(lastParams(navigations)).toMatchObject({ filters: { type: 'youtube_video', views: '100..' }, page: 1 });
		expect(resetCursors).toHaveBeenCalledTimes(1);
	});

	it('the debounced commit keeps a person filter set inside the window', () => {
		vi.useFakeTimers();
		const { view, navigations } = setup('mode=all');
		view.gridFilterChanged({ ...views(100), ...youtubeOnly });
		view.filterByPerson('603');
		vi.advanceTimersByTime(500);
		expect(lastParams(navigations).filters).toEqual({ type: 'youtube_video', views: '100..', person: '603' });
	});

	it('a Loaded-mode filter commit writes the URL without resetting the page or cursors', () => {
		vi.useFakeTimers();
		const { view, navigations, resetCursors } = setup('f.type=youtube_video&page=3');
		view.gridFilterChanged({ ...views(100), ...youtubeOnly });
		vi.advanceTimersByTime(500);
		expect(lastParams(navigations)).toMatchObject({ page: 3, filters: { type: 'youtube_video', views: '100..' } });
		expect(resetCursors).not.toHaveBeenCalled();
	});

	it('dispose cancels a pending commit', () => {
		vi.useFakeTimers();
		const { view, navigations } = setup('mode=all');
		view.gridFilterChanged(views(100));
		view.dispose();
		vi.advanceTimersByTime(1000);
		expect(navigations).toHaveLength(0);
	});

	it('removeFilter writes the URL without that key, resets cursors and returns to page 1', () => {
		const { view, navigations, resetCursors } = setup('mode=all&f.type=movie&f.views=100..&page=2');
		view.removeFilter('views');
		expect(resetCursors).toHaveBeenCalledTimes(1);
		expect(lastParams(navigations)).toMatchObject({ filters: { type: 'movie' }, page: 1 });
	});

	it('clearFiltersKeepType keeps only the type filter', () => {
		const { view, navigations } = setup('mode=all&f.type=movie&f.views=100..');
		view.clearFiltersKeepType();
		expect(lastParams(navigations).filters).toEqual({ type: 'movie' });
	});

	it('clearFilters writes f=none', () => {
		const { view, navigations } = setup('mode=all&f.type=movie');
		view.clearFilters();
		expect(lastParams(navigations).filters).toEqual({});
	});

	it('filterByPerson writes f.person, resets cursors and returns to page 1', () => {
		const { view, navigations, resetCursors } = setup('mode=all&page=4');
		view.filterByPerson('603');
		expect(resetCursors).toHaveBeenCalledTimes(1);
		expect(lastParams(navigations)).toMatchObject({ filters: expect.objectContaining({ person: '603' }), page: 1 });
		expect(view.personFilter).toEqual({ id: 603 });
	});

	it('chips add the person chip with the label it is given', () => {
		const { view } = setup('f=none&f.person=603');
		expect(view.chips('Jane Doe')).toEqual({ person: { filterType: 'person', filter: 'Jane Doe' } });
	});
});

describe('paging and page size', () => {
	it('nextPage and prevPage move the page and never reset cursors', () => {
		const { view, navigations, resetCursors } = setup('mode=all&pageSize=10&page=2');
		view.nextPage(50);
		expect(lastParams(navigations).page).toBe(3);
		view.prevPage();
		expect(lastParams(navigations).page).toBe(2);
		expect(resetCursors).not.toHaveBeenCalled();
	});

	it('nextPage does nothing on the last page', () => {
		const { view, navigations } = setup('mode=all&pageSize=10&page=5');
		view.nextPage(50);
		expect(navigations).toHaveLength(0);
	});

	it('setPageSize resets cursors and returns to page 1', () => {
		const { view, navigations, resetCursors } = setup('mode=all&page=4');
		view.setPageSize(25);
		expect(resetCursors).toHaveBeenCalledTimes(1);
		expect(lastParams(navigations)).toMatchObject({ pageSize: 25, page: 1 });
	});

	it('pageCount rounds up and is at least zero', () => {
		const { view } = setup('mode=all&pageSize=10');
		expect(view.pageCount(0)).toBe(0);
		expect(view.pageCount(21)).toBe(3);
	});
});

describe('card list rows', () => {
	const rows = [
		{ id: 1, name: 'a', viewCount: 500 },
		{ id: 2, name: 'b', viewCount: 50 },
		{ id: 3, name: 'c', viewCount: 900 },
	] as unknown as ContentItem[];

	it('in Loaded mode applies the column filter and the Loaded sort, the same source as the grid', () => {
		const { view } = setup('f=none&f.views=100..');
		view.setSorts([{ col: 'views', dir: 'desc' }]);
		expect(view.cardRows(rows).map((r) => r.id)).toEqual([3, 1]);
	});

	it('in Loaded mode applies the person filter', () => {
		const { view } = setup('f=none&f.person=603');
		expect(view.cardRows(rows)).toEqual([]);
	});

	it('in All mode returns the server rows untouched', () => {
		const { view } = setup('mode=all&f.views=100..');
		expect(view.cardRows(rows)).toBe(rows);
	});
});

describe('list request variables', () => {
	const request = (view: { params: Parameters<typeof libraryListRequest>[0] }) =>
		libraryListRequest(view.params, null).variables;

	it('Loaded fetches 50 rows, All fetches the page size', () => {
		const { view } = setup('f.type=youtube_video');
		expect(request(view).first).toBe(50);
		view.setMode('all');
		expect(request(view).first).toBe(10);
	});

	it('Loaded sends only the Type filter and search; All also sends the column filters', () => {
		const { view } = setup('f.type=youtube_video&f.views=100..');
		expect(request(view).filter).not.toHaveProperty('minViewCount');
		view.setMode('all');
		expect(request(view).filter).toMatchObject({ minViewCount: 100 });
	});

	it('a person filter in All reaches the server as personId', () => {
		const { view } = setup('mode=all');
		view.filterByPerson('603');
		expect(request(view).filter).toMatchObject({ personId: '603' });
	});

	it('a sort in All reaches the server as a single sort entry', () => {
		const { view } = setup('mode=all');
		view.setSorts([{ col: 'views', dir: 'desc' }]);
		expect(request(view).sorts).toHaveLength(1);
	});
});

describe('URL round trip', () => {
	it('after each write, the params a page reads back equal view.params', () => {
		const { view, navigations } = setup('mode=all');
		view.setSorts([{ col: 'views', dir: 'desc' }]);
		expect(lastParams(navigations)).toEqual(view.params);
		view.nextPage(100);
		expect(lastParams(navigations)).toEqual(view.params);
		expect(navigations.every((n) => n.replace)).toBe(true);
	});
});
