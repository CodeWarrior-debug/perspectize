import { describe, it, expect } from 'vitest';
import {
	castCellRenderer,
	castTooltipItems,
	movieResponse,
	boxOfficeValueGetter,
	vsBudgetValueGetter,
	formatBoxOffice,
	formatVsBudgetCell,
	boxOfficeTooltip,
	vsBudgetTooltip,
	tmdbScoreValueGetter,
	formatTmdbScore,
	hasLowVoteCount,
	tmdbScoreTooltip,
	ratedValueGetter,
	genreValueGetter,
	releasedValueGetter,
	formatReleased,
	contentTags,
	durationValueGetter,
	ageRatingRank,
	typeCellRenderer,
	EMPTY_VALUE,
} from '$lib/utils/formatting';
import {
	COLUMNS,
	COL_TO_SORT,
	DATA_COLUMNS,
	defaultColumnVisibility,
	isMovieOnlyTypeFilter,
	capitalizeContentType,
	compareContentBySorts,
	unknownLastComparator,
	ratedComparator,
} from '$lib/utils/grid-config';
import activityTableSource from '$lib/components/ActivityTable.svelte?raw';
import { headerMinWidth } from '$lib/utils/formatting';
import { activityItemCellRenderer } from '$lib/utils/activityItemCellRenderer';
import {
	sortsToGraphQL,
	urlParamsToGraphQLFilter,
	parseGridParams,
	serializeGridParams,
} from '$lib/utils/gridUrlState';
import type { ContentItem } from '$lib/queries/content';

const DIRECTORS = [{ id: 525, name: 'Christopher Nolan' }];
const CAST = [
	{ id: 6193, name: 'Leonardo DiCaprio', character: 'Cobb', order: 0 },
	{ id: 24045, name: 'Joseph Gordon-Levitt', character: 'Arthur', order: 1 },
	{ id: 27578, name: 'Elliot Page', character: 'Ariadne', order: 2 },
	{ id: 2524, name: 'Tom Hardy', character: 'Eames', order: 3 },
];

function movie(response: Record<string, unknown> | null, extra: Partial<ContentItem> = {}) {
	return { contentType: 'MOVIE', movie: response, ...extra } as unknown as ContentItem;
}

function chipText(el: HTMLElement | string): string {
	return typeof el === 'string' ? el : (el.textContent ?? '');
}

describe('castCellRenderer', () => {
	it('shows directors only, marked dir.', () => {
		const el = castCellRenderer({ data: movie({ directors: DIRECTORS, cast: [] }) });
		expect(chipText(el)).toBe('dir. Christopher Nolan');
	});

	it('shows cast only, in billing order', () => {
		const el = castCellRenderer({ data: movie({ directors: [], cast: CAST.slice(0, 2) }) }) as HTMLElement;
		const chips = el.querySelectorAll('[data-testid="cast-chip"]');
		expect([...chips].map((c) => c.textContent)).toEqual(['Leonardo DiCaprio', 'Joseph Gordon-Levitt']);
	});

	it('puts directors before cast', () => {
		const el = castCellRenderer({ data: movie({ directors: DIRECTORS, cast: CAST.slice(0, 2) }) }) as HTMLElement;
		const chips = [...el.querySelectorAll('[data-testid="cast-chip"]')].map((c) => c.textContent);
		expect(chips).toEqual(['dir. Christopher Nolan', 'Leonardo DiCaprio', 'Joseph Gordon-Levitt']);
	});

	it('puts directors on line 1 and lead cast on line 2', () => {
		const el = castCellRenderer({ data: movie({ directors: DIRECTORS, cast: CAST.slice(0, 2) }) }) as HTMLElement;
		const lines = [...el.children].map((l) =>
			[...l.querySelectorAll('[data-testid="cast-chip"]')].map((c) => c.textContent),
		);
		expect(lines).toEqual([['dir. Christopher Nolan'], ['Leonardo DiCaprio', 'Joseph Gordon-Levitt']]);
	});

	it('lists two directors and two lead cast, then +N for everyone else, on the last line', () => {
		const dirs = [...DIRECTORS, { id: 1, name: 'Lana Wachowski' }, { id: 2, name: 'Lilly Wachowski' }];
		const el = castCellRenderer({ data: movie({ directors: dirs, cast: CAST }) }) as HTMLElement;
		expect(el.querySelectorAll('[data-testid="cast-chip"]')).toHaveLength(4);
		const more = el.querySelector('[data-testid="cast-more"]');
		expect(more?.textContent).toBe('+3');
		expect(more?.parentElement).toBe(el.lastElementChild);
	});

	it('keeps +N flex-none and lets names shrink so +N is never clipped', () => {
		const el = castCellRenderer({ data: movie({ directors: DIRECTORS, cast: CAST }) }) as HTMLElement;
		expect(el.querySelector('[data-testid="cast-more"]')?.className).toContain('flex-none');
		for (const chip of el.querySelectorAll('[data-testid="cast-chip"]')) {
			expect(chip.className).toContain('truncate');
			expect(chip.className).toContain('min-w-0');
		}
	});

	it('puts +N on the director line when there is no cast', () => {
		const dirs = [...DIRECTORS, { id: 1, name: 'A' }, { id: 2, name: 'B' }];
		const el = castCellRenderer({ data: movie({ directors: dirs, cast: [] }) }) as HTMLElement;
		expect(el.children).toHaveLength(1);
		expect(el.querySelector('[data-testid="cast-more"]')?.textContent).toBe('+1');
	});

	it('shows no +N when everyone is listed', () => {
		const el = castCellRenderer({ data: movie({ directors: DIRECTORS, cast: CAST.slice(0, 2) }) }) as HTMLElement;
		expect(el.querySelector('[data-testid="cast-more"]')).toBeNull();
	});

	it('shows an empty marker when there are no people', () => {
		expect(chipText(castCellRenderer({ data: movie({ directors: [], cast: [] }) }))).toBe(EMPTY_VALUE);
	});

	it('shows an empty marker for a null response', () => {
		expect(chipText(castCellRenderer({ data: movie(null) }))).toBe(EMPTY_VALUE);
	});

	it('shows an empty marker for a non-movie row', () => {
		const row = { contentType: 'YOUTUBE_VIDEO', movie: null, response: { items: [] } } as unknown as ContentItem;
		expect(chipText(castCellRenderer({ data: row }))).toBe(EMPTY_VALUE);
	});

	it('renders nothing without row data', () => {
		expect(castCellRenderer({})).toBe('');
	});
});

describe('castTooltipItems', () => {
	it('lists directors first with role and TMDB person id', () => {
		const items = castTooltipItems(movie({ directors: DIRECTORS, cast: CAST.slice(0, 1) }));
		expect(items).toEqual(['Christopher Nolan · Director · TMDB #525', 'Leonardo DiCaprio · as Cobb · TMDB #6193']);
	});

	it('omits the role text when a cast member has no character', () => {
		const items = castTooltipItems(movie({ directors: [], cast: [{ id: 1, name: 'A', character: '', order: 0 }] }));
		expect(items).toEqual(['A · TMDB #1']);
	});

	it('is empty for a null response', () => {
		expect(castTooltipItems(movie(null))).toEqual([]);
	});

	it('keeps two people with the same name but different TMDB ids as distinct entries', () => {
		const items = castTooltipItems(
			movie({
				directors: [],
				cast: [
					{ id: 111, name: 'Chris Evans', character: 'Steve', order: 0 },
					{ id: 222, name: 'Chris Evans', character: 'Lance', order: 1 },
				],
			}),
		);
		expect(items).toEqual(['Chris Evans · as Steve · TMDB #111', 'Chris Evans · as Lance · TMDB #222']);
	});
});

describe('list rows carry the Movie payload in `movie`, not `response`', () => {
	it('a YOUTUBE_VIDEO list row with movie: null yields the empty marker and no movie payload', () => {
		const row = { contentType: 'YOUTUBE_VIDEO', movie: null } as unknown as ContentItem;
		expect(movieResponse(row)).toBeNull();
		expect(chipText(castCellRenderer({ data: row }))).toBe(EMPTY_VALUE);
	});

	it('a MOVIE list row with movie populated renders the movie cells', () => {
		const el = castCellRenderer({ data: movie({ directors: DIRECTORS, cast: [] }) });
		expect(chipText(el)).toBe('dir. Christopher Nolan');
	});

	it('falls back to `response` when `movie` is absent (details query)', () => {
		const row = { contentType: 'MOVIE', response: { year: 2010 } } as unknown as ContentItem;
		expect(movieResponse(row)).toEqual({ year: 2010 });
	});

	it('prefers `movie` over `response` when both are present', () => {
		const row = { contentType: 'MOVIE', movie: { year: 2011 }, response: { year: 2010 } } as unknown as ContentItem;
		expect(movieResponse(row)).toEqual({ year: 2011 });
	});
});

describe('money getters', () => {
	it('boxOfficeValueGetter reads revenue', () => {
		expect(boxOfficeValueGetter({ data: movie({ revenue: 836_800_000 }) })).toBe(836_800_000);
	});

	it('treats null, zero and missing revenue as unknown', () => {
		expect(boxOfficeValueGetter({ data: movie({ revenue: null }) })).toBeNull();
		expect(boxOfficeValueGetter({ data: movie({ revenue: 0 }) })).toBeNull();
		expect(boxOfficeValueGetter({ data: movie(null) })).toBeNull();
		expect(boxOfficeValueGetter({})).toBeNull();
	});

	it('formats box office compactly and shows a dash for unknown', () => {
		expect(formatBoxOffice(836_800_000)).toBe('$836.8M');
		expect(formatBoxOffice(null)).toBe(EMPTY_VALUE);
		expect(formatBoxOffice(0)).toBe(EMPTY_VALUE);
	});

	it('boxOfficeTooltip gives the exact figure, empty when unknown', () => {
		expect(boxOfficeTooltip({ data: movie({ revenue: 836_836_967 }) })).toBe('$836,836,967');
		expect(boxOfficeTooltip({ data: movie({ revenue: 0 }) })).toBe('');
	});

	it('vsBudgetValueGetter is revenue over budget as a percentage', () => {
		expect(vsBudgetValueGetter({ data: movie({ revenue: 300, budget: 100 }) })).toBe(300);
	});

	it('vsBudgetValueGetter is null when either side is null or zero', () => {
		expect(vsBudgetValueGetter({ data: movie({ revenue: null, budget: 100 }) })).toBeNull();
		expect(vsBudgetValueGetter({ data: movie({ revenue: 100, budget: null }) })).toBeNull();
		expect(vsBudgetValueGetter({ data: movie({ revenue: 0, budget: 0 }) })).toBeNull();
		expect(vsBudgetValueGetter({ data: movie(null) })).toBeNull();
	});

	it('formats vs budget as a percentage and a dash for unknown', () => {
		expect(formatVsBudgetCell(3455.4)).toBe('3,455%');
		expect(formatVsBudgetCell(null)).toBe(EMPTY_VALUE);
	});

	it('vsBudgetTooltip states the multiple, the net gain and the marketing caveat', () => {
		const t = vsBudgetTooltip({ data: movie({ revenue: 300_000_000, budget: 100_000_000 }) });
		expect(t).toContain('3.0×');
		expect(t).toContain('$200,000,000');
		expect(t).toContain('gain');
		expect(t).toContain('marketing');
		expect(t).toContain('does not mean a loss');
	});

	it('vsBudgetTooltip states a net loss when revenue is below budget', () => {
		const t = vsBudgetTooltip({ data: movie({ revenue: 40_000_000, budget: 100_000_000 }) });
		expect(t).toContain('0.4×');
		expect(t).toContain('loss');
		expect(t).toContain('$60,000,000');
	});

	it('vsBudgetTooltip is empty when unknown', () => {
		expect(vsBudgetTooltip({ data: movie({ revenue: 0, budget: 100 }) })).toBe('');
	});
});

describe('tmdb score', () => {
	it('is the vote average out of 10 with one decimal, never a percent', () => {
		expect(tmdbScoreValueGetter({ data: movie({ voteAverage: 8.364, voteCount: 35000 }) })).toBe(8.364);
		expect(formatTmdbScore(8.364)).toBe('8.4');
		expect(formatTmdbScore(8.0)).toBe('8.0');
		expect(formatTmdbScore(8.4)).not.toContain('%');
	});

	it('is unknown with no votes or no response', () => {
		expect(tmdbScoreValueGetter({ data: movie({ voteAverage: 0, voteCount: 0 }) })).toBeNull();
		expect(tmdbScoreValueGetter({ data: movie(null) })).toBeNull();
		expect(formatTmdbScore(null)).toBe(EMPTY_VALUE);
	});

	it('flags fewer than 50 votes as low confidence', () => {
		expect(hasLowVoteCount({ data: movie({ voteAverage: 9, voteCount: 49 }) })).toBe(true);
		expect(hasLowVoteCount({ data: movie({ voteAverage: 9, voteCount: 50 }) })).toBe(false);
		expect(hasLowVoteCount({ data: movie(null) })).toBe(false);
	});

	it('tooltip shows the score out of 10 and the vote count, with a caution when few votes', () => {
		expect(tmdbScoreTooltip({ data: movie({ voteAverage: 8.4, voteCount: 35000 }) })).toBe(
			'8.4 / 10 from 35,000 votes',
		);
		expect(tmdbScoreTooltip({ data: movie({ voteAverage: 9, voteCount: 3 }) })).toContain('fewer than 50 votes');
		expect(tmdbScoreTooltip({ data: movie(null) })).toBe('');
	});
});

describe('simple movie getters', () => {
	it('rated is the certification, null when empty', () => {
		expect(ratedValueGetter({ data: movie({ certification: 'PG-13' }) })).toBe('PG-13');
		expect(ratedValueGetter({ data: movie({ certification: '' }) })).toBeNull();
		expect(ratedValueGetter({ data: movie(null) })).toBeNull();
	});

	it('genre joins the genres, null when none', () => {
		expect(genreValueGetter({ data: movie({ genres: ['Action', 'Science Fiction'] }) })).toBe(
			'Action, Science Fiction',
		);
		expect(genreValueGetter({ data: movie({ genres: [] }) })).toBeNull();
	});

	it('released formats the release date without shifting the day across timezones', () => {
		expect(releasedValueGetter({ data: movie({ releaseDate: '2010-07-15' }) })).toBe('2010-07-15');
		expect(formatReleased('2010-07-15')).toBe('Jul 15, 2010');
		expect(formatReleased(null)).toBe(EMPTY_VALUE);
		expect(releasedValueGetter({ data: movie({ releaseDate: '' }) })).toBeNull();
	});

	it('ranks certifications G < PG < PG-13 < R < NC-17, unrated last', () => {
		const ranks = ['G', 'PG', 'PG-13', 'R', 'NC-17'].map((c) => ageRatingRank(c));
		expect(ranks).toEqual([...ranks].sort((a, b) => (a as number) - (b as number)));
		expect(ageRatingRank('NR')).toBeNull();
		expect(ageRatingRank(undefined)).toBeNull();
	});
});

describe('Tags for movies', () => {
	it('uses TMDB keywords when the row has no tags', () => {
		expect(contentTags(movie({ keywords: ['dream', 'heist'] }, { tags: null }))).toEqual(['dream', 'heist']);
	});

	it('prefers real tags (YouTube) over response keywords', () => {
		const row = { contentType: 'YOUTUBE_VIDEO', tags: ['a'], movie: null } as unknown as ContentItem;
		expect(contentTags(row)).toEqual(['a']);
	});

	it('is null when there is nothing', () => {
		expect(contentTags(movie(null, { tags: null }))).toBeNull();
	});
});

describe('Duration for movies', () => {
	it('shows 8520 seconds as 2:22:00', () => {
		expect(durationValueGetter({ data: { length: 8520, lengthUnits: 'seconds' } })).toBe('2:22:00');
	});
});

describe('movie type cell', () => {
	it('is not the YouTube icon', () => {
		const el = typeCellRenderer({ data: { contentType: 'MOVIE' } }) as HTMLElement;
		expect(el.textContent).toContain('Movie');
		expect(el.innerHTML).not.toContain('FF0000');
	});

	it('type filter knows the Movie label', () => {
		expect(capitalizeContentType('MOVIE')).toBe('Movie');
	});
});

describe('movie item cell', () => {
	it('shows poster, title and year', () => {
		const el = activityItemCellRenderer({
			data: {
				id: '1',
				name: 'Inception',
				url: 'https://www.themoviedb.org/movie/27205',
				contentType: 'MOVIE',
				movie: { posterPath: '/abc.jpg', year: 2010 },
			},
		}) as HTMLElement;
		expect(el.querySelector('img')?.getAttribute('src')).toBe('https://image.tmdb.org/t/p/w92/abc.jpg');
		expect(el.querySelector('[data-testid="item-title"]')?.textContent).toBe('Inception');
		expect(el.querySelector('[data-testid="item-subtitle"]')?.textContent).toBe('2010');
	});

	it('omits the poster and year when unknown', () => {
		const el = activityItemCellRenderer({
			data: { id: '1', name: 'Inception', url: null, contentType: 'MOVIE', movie: null },
		}) as HTMLElement;
		expect(el.querySelector('img')).toBeNull();
		expect(el.querySelector('[data-testid="item-subtitle"]')).toBeNull();
	});
});

describe('Movie COLUMNS entries', () => {
	const byId = (id: string) => COLUMNS.find((c) => c.colId === id);

	it('Box office, Vs. budget and Rated sort server-side by their backend enums', () => {
		expect(byId('boxOffice')).toMatchObject({ sortable: true, serverSort: 'BOX_OFFICE', label: 'Box office' });
		expect(byId('vsBudget')).toMatchObject({ sortable: true, serverSort: 'VS_BUDGET', label: 'Vs. budget' });
		expect(byId('rated')).toMatchObject({ sortable: true, serverSort: 'AGE_RATING', label: 'Rated' });
		expect(COL_TO_SORT.boxOffice).toBe('BOX_OFFICE');
		expect(COL_TO_SORT.vsBudget).toBe('VS_BUDGET');
		expect(COL_TO_SORT.rated).toBe('AGE_RATING');
		expect(sortsToGraphQL([{ col: 'boxOffice', dir: 'desc' }])).toEqual([{ field: 'BOX_OFFICE', order: 'DESC' }]);
	});

	it('Cast, Genre, Released and TMDB Score are not sortable', () => {
		for (const id of ['cast', 'genre', 'released', 'tmdbScore']) {
			expect(byId(id)?.sortable, id).toBe(false);
			expect(byId(id)?.serverSort, id).toBeUndefined();
		}
	});

	it('Duration is the header name for the runtime column', () => {
		expect(byId('duration')?.label).toBe('Duration');
	});

	it('client-side sort uses the movie values, unknown last', () => {
		const a = movie({ revenue: 10 });
		const b = movie({ revenue: 20 });
		const none = movie({ revenue: null });
		const sorted = [none, a, b].sort((x, y) => compareContentBySorts(x, y, [{ col: 'boxOffice', dir: 'desc' }]));
		expect(sorted).toEqual([b, a, none]);
		const r = [movie({ certification: 'R' }), movie({ certification: 'G' }), movie({ certification: 'NR' })];
		r.sort((x, y) => compareContentBySorts(x, y, [{ col: 'rated', dir: 'asc' }]));
		expect(r.map((x) => (x.movie as { certification: string }).certification)).toEqual(['G', 'R', 'NR']);
	});

	it('Budget, Votes, Collection, Synopsis and TMDB ID are picker columns', () => {
		const ids = DATA_COLUMNS.map((c) => c.colId);
		for (const id of ['budget', 'votes', 'collection', 'synopsis', 'tmdbId']) expect(ids).toContain(id);
	});
});

describe('Movie default column set', () => {
	it('is detected only when the type filter is exactly MOVIE', () => {
		expect(isMovieOnlyTypeFilter('movie')).toBe(true);
		expect(isMovieOnlyTypeFilter(' Movie ')).toBe(true);
		expect(isMovieOnlyTypeFilter('movie,youtube_video')).toBe(false);
		expect(isMovieOnlyTypeFilter('youtube_video')).toBe(false);
		expect(isMovieOnlyTypeFilter(undefined)).toBe(false);
	});

	it('shows the spec default columns at lg and omits Date Added', () => {
		const { visible } = defaultColumnVisibility('lg', true);
		expect(visible).toEqual(
			expect.arrayContaining([
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
			]),
		);
		expect(visible).not.toContain('createdAt');
		expect(visible).not.toContain('type');
		for (const id of ['budget', 'votes', 'collection', 'synopsis', 'tmdbId', 'views', 'likes', 'channel']) {
			expect(visible, id).not.toContain(id);
		}
	});

	it('reveals Movie columns progressively by tier', () => {
		expect(defaultColumnVisibility('xs', true).visible).toEqual(['perspectize', 'item']);
		const md = defaultColumnVisibility('md', true).visible;
		expect(md).toContain('cast');
		expect(md).not.toContain('boxOffice');
	});

	it('keeps the YouTube set unchanged and hides every Movie column', () => {
		const lg = defaultColumnVisibility('lg', false);
		expect(lg.visible).toEqual(
			expect.arrayContaining([
				'item',
				'type',
				'perspectize',
				'category',
				'channel',
				'duration',
				'publishDate',
				'views',
				'likes',
				'percentLiked',
				'tags',
			]),
		);
		for (const id of ['genre', 'rated', 'cast', 'released', 'boxOffice', 'vsBudget', 'tmdbScore']) {
			expect(lg.visible, id).not.toContain(id);
			expect(lg.hidden, id).toContain(id);
		}
		expect(lg.hidden).toContain('description');
		expect(defaultColumnVisibility('xs', false).visible).toEqual(['item', 'type', 'perspectize']);
	});

	it('every column is either shown or hidden, never both', () => {
		for (const tier of ['xs', 'sm', 'md', 'lg'] as const) {
			for (const movieOnly of [true, false]) {
				const { visible, hidden } = defaultColumnVisibility(tier, movieOnly);
				expect(visible.filter((c) => hidden.includes(c))).toEqual([]);
			}
		}
	});
});

describe('Movie search scopes', () => {
	it('keeps the cast scope while the movie filter is on', () => {
		const p = parseGridParams(new URLSearchParams('f.type=movie&qf=cast'));
		expect(p.qFields).toEqual(['cast']);
	});

	it('drops hidden movie scopes once the movie filter is removed', () => {
		const p = parseGridParams(new URLSearchParams('f.type=youtube_video&qf=title,cast,director'));
		expect(p.qFields).toEqual(['title']);
	});

	it('falls back to the visible defaults when every qf scope is hidden', () => {
		const p = parseGridParams(new URLSearchParams('f.type=youtube_video&qf=cast'));
		expect(p.qFields).toEqual(['title', 'desc', 'channel', 'tags']);
	});

	it('lists Cast and Director as search scopes when the type filter includes movies', () => {
		const p = parseGridParams(new URLSearchParams('f.type=movie'));
		expect(p.qFields).toEqual(['title', 'desc', 'channel', 'tags', 'cast', 'director']);
	});

	it('keeps the four base scopes for non-movie views', () => {
		expect(parseGridParams(new URLSearchParams('f.type=youtube_video')).qFields).toEqual([
			'title',
			'desc',
			'channel',
			'tags',
		]);
	});

	it('maps cast and director to the backend enum values', () => {
		const f = urlParamsToGraphQLFilter({ type: 'movie' }, 'nolan', ['cast', 'director']);
		expect(f?.searchFields).toEqual(['CAST', 'DIRECTOR']);
		expect(f?.contentTypes).toEqual(['MOVIE']);
	});

	it('omits qf from the URL when it is the default for the filter, includes it otherwise', () => {
		const defaults = parseGridParams(new URLSearchParams('f.type=movie'));
		expect(serializeGridParams(defaults)).not.toContain('qf=');
		const narrowed = { ...defaults, qFields: ['cast' as const] };
		expect(serializeGridParams(narrowed)).toContain('qf=cast');
		expect(parseGridParams(new URLSearchParams(serializeGridParams(narrowed))).qFields).toEqual(['cast']);
	});
});

// AG Grid calls comparator(a, b, nodeA, nodeB, isDescending) and negates the result for descending,
// so "unknown last in both directions" means returning the opposite sign when descending.
function agSort<T>(values: T[], cmp: (a: T, b: T, na: unknown, nb: unknown, desc: boolean) => number, desc: boolean) {
	return [...values].sort((a, b) => (desc ? -1 : 1) * cmp(a, b, null, null, desc));
}

describe('grid comparators (Loaded-mode desktop grid)', () => {
	it('unknownLastComparator orders numbers with null last ascending and descending', () => {
		const v = [null, 20, 10, null, 30];
		expect(agSort(v, unknownLastComparator, false)).toEqual([10, 20, 30, null, null]);
		expect(agSort(v, unknownLastComparator, true)).toEqual([30, 20, 10, null, null]);
	});

	it('ratedComparator orders by rating, not A-Z, unrated last in both directions', () => {
		const v = ['R', null, 'G', 'PG-13', 'NC-17', 'PG', 'NR'];
		expect(agSort(v, ratedComparator, false).slice(0, 5)).toEqual(['G', 'PG', 'PG-13', 'R', 'NC-17']);
		expect(agSort(v, ratedComparator, false).slice(5).sort()).toEqual([null, 'NR'].sort());
		expect(agSort(v, ratedComparator, true).slice(0, 5)).toEqual(['NC-17', 'R', 'PG-13', 'PG', 'G']);
		const desc = agSort(v, ratedComparator, true);
		expect(desc.slice(5).every((x) => x === null || x === 'NR')).toBe(true);
	});

	it('the Rated, Box office and Vs. budget colDefs use these comparators', () => {
		for (const id of ['rated', 'boxOffice', 'vsBudget']) {
			const block = activityTableSource.split(/(?=colId:\s*')/g).find((b) => b.startsWith(`colId: '${id}'`));
			expect(block, id).toMatch(/comparator:\s*(ratedComparator|unknownLastComparator)/);
		}
	});
});

describe('default column sets fit the 1212px grid', () => {
	const blocks = activityTableSource.split(/(?=colId:\s*')/g);
	function minWidth(colId: string): number {
		const b = blocks.find((x) => x.startsWith(`colId: '${colId}'`));
		if (!b) throw new Error(`no colDef for ${colId}`);
		const explicit = b.match(/\n\s*minWidth:\s*(\d+)/)?.[1];
		if (explicit) return Number(explicit);
		const name = b.match(/headerName:\s*'([^']*)'/)?.[1] ?? '';
		return headerMinWidth(name, !/\n\s*filter:\s*false/.test(b));
	}
	it.each([
		['YouTube', false],
		['Movie', true],
	])('%s lg set sums under 1212', (_n, movieOnly) => {
		const { visible } = defaultColumnVisibility('lg', movieOnly as boolean);
		const total = visible.reduce((sum, id) => sum + minWidth(id), 0);
		expect(total).toBeLessThanOrEqual(1212);
	});

	it('Movie lg minimum widths are the tuned table (sum 1207)', () => {
		const { visible } = defaultColumnVisibility('lg', true);
		const widths = Object.fromEntries(visible.map((id) => [id, minWidth(id)]));
		expect(widths).toMatchObject({
			item: 185,
			genre: 82,
			rated: 82,
			cast: 125,
			duration: 111,
			released: 105,
			boxOffice: 138,
			vsBudget: 118,
			tmdbScore: 121,
			tags: 90,
		});
		expect(Object.values(widths).reduce((a, b) => a + b, 0)).toBe(1207);
	});

	it('no colDef has minWidth above maxWidth', () => {
		for (const b of blocks) {
			const min = b.match(/\n\s*minWidth:\s*(\d+)/)?.[1];
			const max = b.match(/\n\s*maxWidth:\s*(\d+)/)?.[1];
			if (min && max) expect(Number(min), b.slice(0, 30)).toBeLessThanOrEqual(Number(max));
		}
	});
});
