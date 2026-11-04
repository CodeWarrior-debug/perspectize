import { describe, it, expect } from 'vitest';
import type { ImportItem, ImportSource } from '$lib/queries/imports';
import { EMPTY_VALUE } from '$lib/utils/formatting';
import {
	ageDays,
	buildImportColumnDefs,
	columnsForSet,
	commentRate,
	destinationCellRenderer,
	factColumnKeys,
	factKind,
	factTooltip,
	formatFact,
	likesHidden,
	formatRate,
	formatTotalTime,
	formatUsd,
	importErrorMessage,
	importStatusLabel,
	isImportable,
	isLowSampleRating,
	isoDateFilterParams,
	isSelectable,
	likeRate,
	listOrEmpty,
	passesSheetFilter,
	prettifyFactKey,
	progressLabel,
	ratingTooltip,
	SELECTION_LIMIT,
	selectionLimit,
	selectionSummary,
	sheetTypes,
	titleCellRenderer,
	toImportRows,
	unavailableNote,
	viewsPerDay,
	type ImportRow,
} from '$lib/utils/import-sheet';

function item(overrides: Partial<ImportItem> = {}): ImportItem {
	return {
		id: '1',
		sourceId: '10',
		destinationType: 'YOUTUBE_VIDEO',
		externalId: 'abc',
		url: 'https://www.youtube.com/watch?v=abc',
		title: 'Maps of Meaning 1',
		facts: {
			kind: 'video',
			summary: 'Lecture one of the 2017 course.',
			publishedAt: '2026-10-17T12:00:00Z',
			durationSeconds: 8756,
			viewCount: 10_000,
			likeCount: 300,
			commentCount: 50,
			chapterCount: 3,
			hasCaptions: true,
			thumbnailUrl: 'https://i.ytimg.com/vi/abc/mqdefault.jpg',
		},
		position: 0,
		excluded: false,
		statsFetchedAt: '2026-10-27T12:00:00Z',
		inLibrary: false,
		contentId: null,
		importStatus: null,
		importError: null,
		importedAt: null,
		...overrides,
	};
}

const now = new Date('2026-10-27T12:00:00Z');
const sources = [
	{ id: '10', title: 'Jordan B Peterson', sourceRef: '@JordanBPeterson' },
	{ id: '11', title: null, sourceRef: '525' },
] as ImportSource[];

function row(overrides: Partial<ImportItem> = {}): ImportRow {
	return toImportRows([item(overrides)], sources)[0];
}

const filmFacts = {
	kind: 'movie',
	summary: 'Your mind is the scene of the crime.',
	publishedAt: '2010-07-08T00:00:00Z',
	durationSeconds: 8880,
	rating: 7.4,
	ratingCount: 42,
	ratingSource: 'Metacritic',
	genres: ['Heist', 'Science fiction'],
	topCast: ['Leonardo DiCaprio', 'Ken Watanabe'],
	revenue: 836_848_102,
	budget: 160_000_000,
};

function film(overrides: Partial<ImportItem> = {}): ImportItem {
	return item({ id: 'f1', destinationType: 'MOVIE', sourceId: '11', facts: { ...filmFacts }, ...overrides });
}

describe('facts', () => {
	it('labels come from the key name, with the suffix as the unit', () => {
		expect(prettifyFactKey('revenue')).toBe('Revenue (USD)');
		expect(prettifyFactKey('budget')).toBe('Budget (USD)');
		expect(prettifyFactKey('viewCount')).toBe('Views');
		expect(prettifyFactKey('ratingCount')).toBe('Ratings');
		expect(prettifyFactKey('durationSeconds')).toBe('Duration');
		expect(prettifyFactKey('publishedAt')).toBe('Published');
		expect(prettifyFactKey('hasCaptions')).toBe('Captions');
		expect(prettifyFactKey('topCast')).toBe('Top cast');
		expect(prettifyFactKey('someNewKey'), 'a key nobody planned for still reads').toBe('Some new key');
	});

	it('values are formatted by key, and missing is the empty marker, never 0', () => {
		const v = item();
		expect(formatFact('durationSeconds', v)).toBe('2:25:56');
		expect(formatFact('viewCount', v)).toBe('10.0 K');
		expect(formatFact('publishedAt', v)).toBe('Oct 17, 2026');
		expect(formatFact('hasCaptions', v)).toBe('Yes');
		expect(formatFact('kind', v)).toBe('Video');
		expect(formatFact('kind', item({ facts: { kind: 'MOVIE' } }))).toBe('Movie');
		const f = film();
		expect(formatFact('rating', f)).toBe('7.4 / 10');
		expect(formatFact('revenue', f)).toBe('$836.8M');
		expect(formatFact('genres', f)).toBe('Heist, Science fiction');
		expect(formatFact('viewCount', f)).toBe(EMPTY_VALUE);
		expect(factTooltip('revenue', f)).toBe('$836.8M worldwide on a $160.0M budget');
		expect(factTooltip('viewCount', v)).toBe('10,000');
		expect(factKind('budget')).toBe('number');
		expect(factKind('publishedAt')).toBe('date');
		expect(factKind('genres')).toBe('text');
	});

	it('a channel that hides likes says so, rather than a blank that reads as none', () => {
		const hidden = item({ facts: { viewCount: 500 } });
		expect(likesHidden(hidden)).toBe(true);
		expect(formatFact('likeCount', hidden)).toBe('hidden');
		expect(factTooltip('likeCount', hidden)).toBe('The channel hides likes on this video');
		expect(likeRate(hidden.facts), 'hidden likes are unknown, not 0').toBeNull();
		expect(factColumnKeys([hidden]), 'the Likes column is where "hidden" is said').toContain('likeCount');
		expect(likesHidden(film()), 'films have no likes to hide').toBe(false);
		expect(formatFact('likeCount', film())).toBe(EMPTY_VALUE);
	});

	it('rates and momentum', () => {
		expect(likeRate(item().facts)).toBeCloseTo(0.03);
		expect(commentRate(item().facts)).toBeCloseTo(0.005);
		expect(viewsPerDay(item().facts, now)).toBeCloseTo(1000);
		expect(formatRate(0.0312)).toBe('3.1%');
		expect(formatRate(null)).toBe(EMPTY_VALUE);
		expect(ageDays({}, now)).toBeNull();
		expect(ageDays({ publishedAt: 'not a date' }, now)).toBeNull();
		expect(ageDays({ publishedAt: '2026-10-27T11:00:00Z' }, now)).toBe(1);
	});

	it('ratings name their source, and a critic aggregate rests on reviews, not votes', () => {
		expect(ratingTooltip(film().facts)).toBe('Metacritic: 7.4 / 10 from 42 critic reviews');
		expect(isLowSampleRating(film().facts), '42 reviews would be muted under the 50-vote user threshold').toBe(false);
		expect(isLowSampleRating({ ...filmFacts, ratingCount: 6 })).toBe(true);
		expect(ratingTooltip({ rating: 8.4, ratingCount: 12, ratingSource: 'TMDB' })).toContain('few ratings');
		expect(ratingTooltip({ rating: 7.4 })).toBe('Rating: 7.4 / 10');
		expect(ratingTooltip({})).toBe('');
	});

	it('money reads in dollars', () => {
		expect(formatUsd(1_081_169_825)).toBe('$1.08B');
		expect(formatUsd(48_500)).toBe('$48,500');
		expect(formatUsd(null)).toBe(EMPTY_VALUE);
		expect(listOrEmpty([])).toBe(EMPTY_VALUE);
	});
});

describe('columns come from the facts present', () => {
	it('a channel sheet has video columns and no film ones; a filmography the reverse', () => {
		const videos = factColumnKeys([item()]);
		expect(videos).toEqual([
			'kind',
			'publishedAt',
			'durationSeconds',
			'viewCount',
			'likeCount',
			'likeRate',
			'commentCount',
			'viewsPerDay',
			'chapterCount',
			'hasCaptions',
		]);
		const films = factColumnKeys([film()]);
		expect(films).toEqual([
			'kind',
			'publishedAt',
			'durationSeconds',
			'rating',
			'topCast',
			'genres',
			'revenue',
			'budget',
			'ratingCount',
		]);
		for (const k of ['summary', 'thumbnailUrl', 'ratingSource']) expect(films).not.toContain(k);
	});

	it('a key any row has becomes a column, and a new key needs no code', () => {
		const keys = factColumnKeys([film(), film({ id: 'f2', facts: { ...filmFacts, awards_count: 3 } })]);
		expect(keys).toContain('awards_count');
		const defs = buildImportColumnDefs(toImportRows([film()], sources), now);
		expect(defs.find((d) => d.colId === 'fact:revenue')?.headerName).toBe('Revenue (USD)');
	});

	it('Decide hides secondary facts and bookkeeping; one source hides the Source column', () => {
		const ids = buildImportColumnDefs(toImportRows([film()], sources), now)
			.map((d) => d.colId!)
			.filter((id) => id !== 'select');
		const decide = columnsForSet('decide', ids, 1);
		expect(decide.shown).toEqual([
			'title',
			'destination',
			'fact:kind',
			'fact:publishedAt',
			'fact:durationSeconds',
			'fact:rating',
			'fact:topCast',
			'fact:genres',
			'fact:revenue',
			'status',
		]);
		expect(decide.hidden).toEqual([
			'source',
			'fact:budget',
			'fact:ratingCount',
			'recency',
			'externalId',
			'statsFetchedAt',
		]);
		expect(columnsForSet('all', ids, 2)).toEqual({ shown: ids, hidden: [] });
	});

	it('every column keeps its width as a floor, and every data column has a floating filter', () => {
		const defs = buildImportColumnDefs(toImportRows([item(), film()], sources), now);
		for (const d of defs) expect(d.minWidth, d.colId).toBe(d.width);
		for (const d of defs.filter((d) => !['select', 'statsFetchedAt'].includes(d.colId!)))
			expect(d.floatingFilter, d.colId).toBe(true);
		const select = defs.find((d) => d.colId === 'select')!;
		expect(select.headerCheckboxSelectionFilteredOnly).toBe(true);
		expect(select.pinned).toBe('left');
	});

	it('value getters read the facts, and derived columns compute', () => {
		const defs = buildImportColumnDefs(toImportRows([item()], sources), now);
		const get = (id: string) =>
			(defs.find((d) => d.colId === id)!.valueGetter as (p: { data: ImportRow }) => unknown)({ data: row() });
		expect(get('fact:viewCount')).toBe(10_000);
		expect(get('fact:likeRate')).toBeCloseTo(0.03);
		expect(get('fact:viewsPerDay')).toBeCloseTo(1000);
		expect(get('recency')).toBe(1);
	});

	it('the date filter compares ISO timestamps by UTC day', () => {
		const cmp = isoDateFilterParams.comparator!;
		const day = new Date(2026, 9, 17);
		expect(cmp(day, '2026-10-17T23:00:00Z')).toBe(0);
		expect(cmp(day, '2026-10-16T12:00:00Z')).toBe(-1);
		expect(cmp(day, '2026-10-18T00:00:00Z')).toBe(1);
		expect(cmp(day, null as unknown as string)).toBe(-1);
	});

	it('the sheet says once what its sources cannot supply', () => {
		expect(sheetTypes([item(), film()])).toEqual(new Set(['YOUTUBE_VIDEO', 'MOVIE']));
		expect(unavailableNote(new Set(['MOVIE'] as const))).toBe(
			"TMDB doesn't publish views, likes or comments for films.",
		);
		expect(unavailableNote(new Set())).toBe('');
	});
});

describe('status and selection', () => {
	it.each([
		[{ inLibrary: false, importStatus: null }, 'Not imported', true],
		[{ inLibrary: true, importStatus: null }, 'In library', false],
		[{ inLibrary: false, importStatus: 'QUEUED' }, 'Importing…', false],
		[{ inLibrary: true, importStatus: 'IMPORTED' }, 'Imported', false],
		[{ inLibrary: true, importStatus: 'SKIPPED' }, 'Already in library', false],
		[{ inLibrary: false, importStatus: 'FAILED' }, 'Failed', true],
		[{ inLibrary: true, importStatus: 'FAILED' }, 'In library', false],
	] as const)('%o → %s, selectable %s', (state, label, selectable) => {
		const it = item(state as Partial<ImportItem>);
		expect(importStatusLabel(it)).toBe(label);
		expect(isSelectable(it)).toBe(selectable);
	});

	it('toolbar filters by source and library status', () => {
		const lib = row({ inLibrary: true });
		const fresh = row();
		const other = row({ sourceId: '11' });
		expect(other.sourceTitle, 'falls back to the ref when a source has no title').toBe('525');
		expect(passesSheetFilter(fresh, { sourceId: '', library: 'all' })).toBe(true);
		expect(passesSheetFilter(other, { sourceId: '10', library: 'all' })).toBe(false);
		expect(passesSheetFilter(lib, { sourceId: '', library: 'new' })).toBe(false);
		expect(passesSheetFilter(fresh, { sourceId: '', library: 'new' })).toBe(true);
		expect(passesSheetFilter(lib, { sourceId: '', library: 'lib' })).toBe(true);
		expect(passesSheetFilter(fresh, { sourceId: '', library: 'lib' })).toBe(false);
	});

	it('summarises a selection by destination type, source and time', () => {
		const s = selectionSummary([
			row(),
			row({ id: '2', facts: { durationSeconds: 3600 } }),
			row({ id: '3', destinationType: 'MOVIE', sourceId: '11', facts: {} }),
		]);
		expect(s.count).toBe(3);
		expect(s.totalSeconds).toBe(8756 + 3600);
		expect(s.byDestination).toEqual([
			{ label: 'YouTube Video', count: 2 },
			{ label: 'Movie', count: 1 },
		]);
		expect(s.bySource).toEqual([
			{ title: 'Jordan B Peterson', count: 2 },
			{ title: '525', count: 1 },
		]);
		expect(formatTotalTime(s.totalSeconds)).toBe('about 3 h');
		expect(formatTotalTime(90)).toBe('about 2 min');
		expect(formatTotalTime(0)).toBe('');
	});
});

describe('cell renderers', () => {
	it('title shows the thumbnail, title and summary from the facts', () => {
		const el = titleCellRenderer({ data: row() }) as HTMLElement;
		expect(el.querySelector('img')?.getAttribute('src')).toBe('https://i.ytimg.com/vi/abc/mqdefault.jpg');
		expect(el.textContent).toContain('Maps of Meaning 1');
		expect(el.textContent).toContain('Lecture one of the 2017 course.');
		const bare = titleCellRenderer({ data: row({ facts: {} }) }) as HTMLElement;
		expect(bare.querySelector('img')).toBeNull();
		expect(bare.textContent).toContain('open the row for the full description');
		expect(titleCellRenderer({})).toBe('');
	});

	it('destination shows the content type icon and its name', () => {
		const video = destinationCellRenderer({ data: row() }) as HTMLElement;
		expect(video.textContent).toContain('YouTube Video');
		expect(video.querySelector('svg')).not.toBeNull();
		const movie = destinationCellRenderer({ data: row({ destinationType: 'MOVIE' }) }) as HTMLElement;
		expect(movie.textContent).toContain('Movie');
		expect(destinationCellRenderer({})).toBe('');
	});
});

describe('requests, limits and "don\'t import"', () => {
	it('non-admins select up to 1,000 at a time; admins a whole channel', () => {
		expect(SELECTION_LIMIT).toBe(1000);
		expect(selectionLimit(false)).toBe(1000);
		expect(selectionLimit(true)).toBe(5000);
	});

	it('a row marked "don\'t import" can be ticked (to clear it) but is not imported', () => {
		const marked = item({ excluded: true });
		expect(isSelectable(marked)).toBe(true);
		expect(isImportable(marked)).toBe(false);
		expect(isImportable(item())).toBe(true);
		expect(importStatusLabel(marked)).toBe("Won't import");
		expect(importStatusLabel({ ...marked, inLibrary: true })).toBe('In library');
		expect(importStatusLabel({ ...marked, importStatus: 'FAILED' })).toBe("Won't import");
	});

	it("the Won't import filter holds marked rows, and Not imported leaves them out", () => {
		const rows = toImportRows(
			[item({ id: '1' }), item({ id: '2', excluded: true }), item({ id: '3', inLibrary: true })],
			[],
		);
		const pick = (library: 'new' | 'excluded') =>
			rows.filter((r) => passesSheetFilter(r, { sourceId: '', library })).map((r) => r.id);
		expect(pick('new')).toEqual(['1']);
		expect(pick('excluded')).toEqual(['2']);
	});

	it('the selection splits what Import would import from what is marked', () => {
		const rows = toImportRows([item({ id: '1' }), item({ id: '2', excluded: true }), item({ id: '3' })], []);
		const s = selectionSummary(rows);
		expect(s.count).toBe(3);
		expect(s.importable).toBe(2);
		expect(s.excluded).toBe(1);
	});
});

describe('messages', () => {
	it("shows the server's reason without the sentinel prefix", () => {
		const err = {
			response: { errors: [{ message: 'invalid input: select up to 1,000 rows at a time (you picked 1,001)' }] },
		};
		expect(importErrorMessage(err)).toBe('Select up to 1,000 rows at a time (you picked 1,001)');
		expect(importErrorMessage(new Error('access denied: only an admin may review import requests'))).toBe(
			'Only an admin may review import requests',
		);
		expect(importErrorMessage(null, 'Fallback')).toBe('Fallback');
	});

	it('progress reads as counts while running and as the outcome after', () => {
		expect(progressLabel({ total: 1000, done: 340, imported: 330, skipped: 8, failed: 2, running: true })).toBe(
			'Importing 340 of 1,000 · 330 added · 8 already in library · 2 failed',
		);
		expect(progressLabel({ total: 4, done: 4, imported: 4, skipped: 0, failed: 0, running: false })).toBe(
			'Imported 4 of 4',
		);
	});
});
