import { describe, it, expect } from 'vitest';
import {
	COLUMNS,
	COL_TO_FILTER_KEY,
	NUMBER_RANGE_COLS,
	DATE_RANGE_COLS,
	SET_FILTER_COLS,
	AGE_RATING_OPTIONS,
	setFilterValueLabel,
	filterContentRows,
	parsePersonFilter,
	rowMatchesPerson,
} from '$lib/utils/grid-config';
import {
	filterToUrlParams,
	urlParamsToFilter,
	urlParamsToGraphQLFilter,
	nonGridFilters,
	parseGridParams,
	serializeGridParams,
} from '$lib/utils/gridUrlState';
import { AgeRatingFilter } from '$lib/utils/contentTypeFilter';
import type { ContentItem } from '$lib/queries/content';

function movie(response: Record<string, unknown> | null, id = '1'): ContentItem {
	return { id, contentType: 'MOVIE', movie: response } as unknown as ContentItem;
}
function youtube(id = '9'): ContentItem {
	return { id, contentType: 'YOUTUBE_VIDEO', movie: null } as unknown as ContentItem;
}
const ids = (rows: ContentItem[]) => rows.map((r) => r.id);

describe('Movie filter column registry', () => {
	it('registers a filter on genre, cast, rated, released, box office and TMDB score', () => {
		expect(COL_TO_FILTER_KEY).toMatchObject({
			genre: 'genre',
			cast: 'cast',
			rated: 'rated',
			released: 'released',
			boxOffice: 'boxoffice',
			tmdbScore: 'tmdb',
		});
		expect(SET_FILTER_COLS.has('rated')).toBe(true);
		expect(DATE_RANGE_COLS.has('released')).toBe(true);
		expect(NUMBER_RANGE_COLS.has('boxOffice')).toBe(true);
		expect(NUMBER_RANGE_COLS.has('tmdbScore')).toBe(true);
	});

	it('leaves Vs. budget unfiltered (derived value, no backend field, would be dropped in All mode)', () => {
		expect(COLUMNS.find((c) => c.colId === 'vsBudget')?.filterKey).toBeUndefined();
		expect(COL_TO_FILTER_KEY.vsBudget).toBeUndefined();
		expect(filterToUrlParams({ vsBudget: { filterType: 'number', type: 'greaterThan', filter: 100 } })).toEqual({});
	});

	it('offers the standard ratings, lowercased for the URL and uppercased for display', () => {
		expect(AGE_RATING_OPTIONS.map((o) => o.label)).toEqual(['G', 'PG', 'PG-13', 'R', 'NC-17', 'NR']);
		expect(AGE_RATING_OPTIONS.map((o) => o.value)).toContain('pg-13');
		expect(setFilterValueLabel('rated', 'pg-13')).toBe('PG-13');
		expect(setFilterValueLabel('type', 'movie')).toBe('Movie');
	});
});

describe('Movie filters: grid model <-> URL round trip', () => {
	it('genre text filter', () => {
		const model = { genre: { filterType: 'text', type: 'contains', filter: 'sci' } };
		const url = filterToUrlParams(model);
		expect(url).toEqual({ genre: 'sci' });
		expect(urlParamsToFilter(url)).toEqual(model);
	});

	it('cast text filter', () => {
		const model = { cast: { filterType: 'text', type: 'contains', filter: 'nolan' } };
		const url = filterToUrlParams(model);
		expect(url).toEqual({ cast: 'nolan' });
		expect(urlParamsToFilter(url)).toEqual(model);
	});

	it('rated set filter', () => {
		const model = { rated: { filterType: 'set', values: ['pg-13', 'r'] } };
		const url = filterToUrlParams(model);
		expect(url).toEqual({ rated: 'pg-13,r' });
		expect(urlParamsToFilter(url)).toEqual(model);
	});

	it('released date range keeps the whole day, not just the month', () => {
		const url = filterToUrlParams({
			released: { filterType: 'date', type: 'inRange', dateFrom: '2010-07-15 00:00:00', dateTo: '2012-01-02 00:00:00' },
		});
		expect(url).toEqual({ released: '2010-07-15..2012-01-02' });
		expect(urlParamsToFilter(url)).toEqual({
			released: { filterType: 'date', type: 'inRange', dateFrom: '2010-07-15', dateTo: '2012-01-02' },
		});
	});

	it('released open-ended ranges', () => {
		expect(urlParamsToFilter({ released: '2010-07-15..' })).toEqual({
			released: { filterType: 'date', type: 'greaterThanOrEqual', dateFrom: '2010-07-15' },
		});
		expect(urlParamsToFilter({ released: '..2010-07-15' })).toEqual({
			released: { filterType: 'date', type: 'lessThanOrEqual', dateTo: '2010-07-15' },
		});
	});

	it('other date columns still serialize to month precision', () => {
		expect(
			filterToUrlParams({
				publishDate: { filterType: 'date', type: 'greaterThanOrEqual', dateFrom: '2024-05-17 00:00:00' },
			}),
		).toEqual({ date: '2024-05..' });
	});

	it('box office and TMDB score number ranges (open ends restore as inclusive)', () => {
		const inRange = { boxOffice: { filterType: 'number', type: 'inRange', filter: 1e8, filterTo: 5e8 } };
		expect(filterToUrlParams(inRange)).toEqual({ boxoffice: '100000000..500000000' });
		expect(urlParamsToFilter({ boxoffice: '100000000..500000000' })).toEqual(inRange);
		expect(urlParamsToFilter({ tmdb: '7.5..' })).toEqual({
			tmdbScore: { filterType: 'number', type: 'greaterThanOrEqual', filter: 7.5 },
		});
		expect(urlParamsToFilter({ tmdb: '..9' })).toEqual({
			tmdbScore: { filterType: 'number', type: 'lessThanOrEqual', filter: 9 },
		});
	});

	it('person is not a grid filter: dropped from the model, preserved via nonGridFilters', () => {
		expect(urlParamsToFilter({ person: '525' })).toEqual({});
		expect(nonGridFilters({ person: '525', genre: 'x' })).toEqual({ person: '525' });
		expect(nonGridFilters({ genre: 'x' })).toEqual({});
	});

	it('survives the page URL: serialize then parse', () => {
		const filters = {
			type: 'movie',
			genre: 'drama',
			rated: 'pg-13,r',
			released: '2010-01-01..',
			person: '525:director',
		};
		const search = serializeGridParams({ ...parseGridParams(new URLSearchParams()), filters });
		expect(parseGridParams(new URLSearchParams(search)).filters).toEqual(filters);
	});
});

describe('Movie filters: GraphQL ContentFilter mapping', () => {
	it('maps genre to genreContains', () => {
		expect(urlParamsToGraphQLFilter({ genre: 'sci' }, '')).toEqual({ genreContains: 'sci' });
	});

	it('maps cast to castContains', () => {
		expect(urlParamsToGraphQLFilter({ cast: 'nolan' }, '')).toEqual({ castContains: 'nolan' });
	});

	it('maps rated to uppercase ageRating list', () => {
		expect(urlParamsToGraphQLFilter({ rated: 'pg-13,r,nc-17' }, '')).toEqual({ ageRating: ['PG-13', 'R', 'NC-17'] });
	});

	it('maps released to releasedAfter / releasedBefore (either or both)', () => {
		expect(urlParamsToGraphQLFilter({ released: '2010-01-01..2012-12-31' }, '')).toEqual({
			releasedAfter: '2010-01-01',
			releasedBefore: '2012-12-31',
		});
		expect(urlParamsToGraphQLFilter({ released: '2010-01-01..' }, '')).toEqual({ releasedAfter: '2010-01-01' });
		expect(urlParamsToGraphQLFilter({ released: '..2012-12-31' }, '')).toEqual({ releasedBefore: '2012-12-31' });
	});

	it('maps boxoffice and tmdb to min/max', () => {
		expect(urlParamsToGraphQLFilter({ boxoffice: '1000000..' }, '')).toEqual({ minBoxOffice: 1000000 });
		expect(urlParamsToGraphQLFilter({ boxoffice: '..5000000' }, '')).toEqual({ maxBoxOffice: 5000000 });
		expect(urlParamsToGraphQLFilter({ tmdb: '7.5..9' }, '')).toEqual({ minTmdbScore: 7.5, maxTmdbScore: 9 });
	});

	it('maps person to personId, with an optional role', () => {
		expect(urlParamsToGraphQLFilter({ person: '525' }, '')).toEqual({ personId: '525' });
		expect(urlParamsToGraphQLFilter({ person: '525:director' }, '')).toEqual({
			personId: '525',
			personRole: 'DIRECTOR',
		});
		expect(urlParamsToGraphQLFilter({ person: '6193:cast' }, '')).toEqual({ personId: '6193', personRole: 'CAST' });
	});

	it('drops a malformed person value instead of sending it', () => {
		expect(urlParamsToGraphQLFilter({ person: 'nolan' }, '')).toBeUndefined();
		expect(urlParamsToGraphQLFilter({ person: '0' }, '')).toBeUndefined();
	});

	it('drops a Vs. budget URL param (no server field)', () => {
		expect(urlParamsToGraphQLFilter({ vsbudget: '100..' }, '')).toBeUndefined();
	});
});

describe('parsePersonFilter', () => {
	it('parses id and optional role', () => {
		expect(parsePersonFilter('525')).toEqual({ id: 525 });
		expect(parsePersonFilter('525:Director')).toEqual({ id: 525, role: 'director' });
	});
	it('rejects junk', () => {
		for (const bad of ['', undefined, 'abc', '-3', '12:actor', '1.5']) expect(parsePersonFilter(bad)).toBeNull();
	});
});

describe('filterContentRows: Movie filters (matches server semantics)', () => {
	const inception = movie(
		{
			genres: ['Action', 'Science Fiction'],
			certification: 'PG-13',
			releaseDate: '2010-07-15',
			revenue: 836_800_000,
			voteCount: 40000,
			voteAverage: 8.4,
			directors: [{ id: 525, name: 'Christopher Nolan' }],
			cast: [{ id: 6193, name: 'Leonardo DiCaprio', order: 0 }],
		},
		'inception',
	);
	const drama = movie(
		{
			genres: ['Drama'],
			certification: 'R',
			releaseDate: '2000-01-01',
			revenue: 5_000_000,
			voteCount: 100,
			voteAverage: 6,
		},
		'drama',
	);
	const bare = movie({}, 'bare'); // no genre / rating / date / revenue / score
	const yt = youtube('yt');
	const rows = [inception, drama, bare, yt];

	it('cast: case-insensitive contains on a cast or director name; rows without people excluded', () => {
		const f = (filter: string) =>
			ids(filterContentRows(rows, { cast: { filterType: 'text', type: 'contains', filter } }));
		expect(f('NOLAN')).toEqual(['inception']); // director
		expect(f('dicap')).toEqual(['inception']); // cast
		expect(f('zzz')).toEqual([]);
	});

	it('genre: case-insensitive contains; rows without genres excluded', () => {
		const f = (filter: string) =>
			ids(filterContentRows(rows, { genre: { filterType: 'text', type: 'contains', filter } }));
		expect(f('SCIENCE')).toEqual(['inception']);
		expect(f('dra')).toEqual(['drama']);
		expect(f('zzz')).toEqual([]);
	});

	it('rated: membership in the selected set; rows without a rating excluded', () => {
		expect(ids(filterContentRows(rows, { rated: { filterType: 'set', values: ['pg-13'] } }))).toEqual(['inception']);
		expect(ids(filterContentRows(rows, { rated: { filterType: 'set', values: ['pg-13', 'r'] } }))).toEqual([
			'inception',
			'drama',
		]);
	});

	it('released: inclusive on both ends; rows without a date excluded', () => {
		const range = (type: string, extra: object) =>
			ids(filterContentRows(rows, { released: { filterType: 'date', type, ...extra } }));
		expect(range('greaterThanOrEqual', { dateFrom: '2010-07-15' })).toEqual(['inception']);
		expect(range('lessThanOrEqual', { dateTo: '2010-07-15' })).toEqual(['inception', 'drama']);
		expect(range('inRange', { dateFrom: '2010-07-16', dateTo: '2011-01-01' })).toEqual([]);
		expect(range('inRange', { dateFrom: '2000-01-01', dateTo: '2000-01-01' })).toEqual(['drama']);
	});

	it('boxOffice: inclusive bounds; unknown revenue excluded', () => {
		const f = (m: object) => ids(filterContentRows(rows, { boxOffice: { filterType: 'number', ...m } }));
		expect(f({ type: 'greaterThanOrEqual', filter: 836_800_000 })).toEqual(['inception']);
		expect(f({ type: 'lessThanOrEqual', filter: 5_000_000 })).toEqual(['drama']);
		expect(f({ type: 'inRange', filter: 1, filterTo: 1e9 })).toEqual(['inception', 'drama']);
	});

	it('tmdbScore: inclusive bounds; unscored excluded', () => {
		const f = (m: object) => ids(filterContentRows(rows, { tmdbScore: { filterType: 'number', ...m } }));
		expect(f({ type: 'greaterThanOrEqual', filter: 8.4 })).toEqual(['inception']);
		expect(f({ type: 'lessThanOrEqual', filter: 6 })).toEqual(['drama']);
	});

	it('url -> model -> rows composes end to end', () => {
		const model = urlParamsToFilter({ genre: 'drama', rated: 'r', boxoffice: '5000000..', tmdb: '..6' });
		expect(ids(filterContentRows(rows, model))).toEqual(['drama']);
	});
});

describe('rowMatchesPerson', () => {
	const m = movie({
		directors: [{ id: 525, name: 'Christopher Nolan' }],
		cast: [{ id: 6193, name: 'Leonardo DiCaprio', order: 0 }],
	});
	it('matches a director or cast member by TMDB id', () => {
		expect(rowMatchesPerson(m, { id: 525 })).toBe(true);
		expect(rowMatchesPerson(m, { id: 6193 })).toBe(true);
		expect(rowMatchesPerson(m, { id: 1 })).toBe(false);
	});
	it('honours the role, and never matches a non-movie', () => {
		expect(rowMatchesPerson(m, { id: 525, role: 'cast' })).toBe(false);
		expect(rowMatchesPerson(m, { id: 525, role: 'director' })).toBe(true);
		expect(rowMatchesPerson(youtube(), { id: 525 })).toBe(false);
	});
});

describe('AgeRatingFilter (checkbox list)', () => {
	function mount() {
		const filterChangedCallback = () => {};
		const filter = new AgeRatingFilter();
		filter.init({ filterChangedCallback } as never);
		document.body.replaceChildren(filter.getGui());
		return filter;
	}

	it('is inactive until a rating is ticked, then models the lowercase set in option order', () => {
		const filter = mount();
		expect(filter.isFilterActive()).toBe(false);
		expect(filter.getModel()).toBeNull();
		const box = (label: string) =>
			[...document.querySelectorAll('label')].find((l) => l.textContent === label)!.querySelector('input')!;
		box('R').click();
		box('PG-13').click();
		expect(filter.getModel()).toEqual({ filterType: 'set', values: ['pg-13', 'r'] });
	});

	it('passes only rows with a ticked rating', () => {
		const filter = mount();
		filter.setModel({ filterType: 'set', values: ['r'] });
		const pass = (certification?: string) => filter.doesFilterPass({ data: movie({ certification }) } as never);
		expect(pass('R')).toBe(true);
		expect(pass('PG')).toBe(false);
		expect(pass(undefined)).toBe(false);
	});
});
