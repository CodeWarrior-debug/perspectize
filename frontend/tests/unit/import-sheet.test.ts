import { describe, it, expect } from 'vitest';
import type { ImportFacts, ImportItem, ImportSource } from '$lib/queries/imports';
import { EMPTY_VALUE } from '$lib/utils/formatting';
import {
	buildImportColumnDefs,
	destinationCellRenderer,
	factColumnDef,
	factKeys,
	factTooltip,
	formatFact,
	formatTotalTime,
	importErrorMessage,
	importStatusLabel,
	isImportable,
	isoDateFilterParams,
	isSelectable,
	passesSheetFilter,
	prettifyKey,
	progressLabel,
	SELECTION_LIMIT,
	selectionLimit,
	selectionSummary,
	sheetTypes,
	titleCellRenderer,
	toImportRows,
	unavailableNote,
	type ImportRow,
} from '$lib/utils/import-sheet';

const videoFacts: ImportFacts = {
	kind: 'VIDEO',
	summary: 'Lecture one of the 2017 course.',
	publishedAt: '2026-10-17T12:00:00Z',
	durationSeconds: 8756,
	viewCount: 10_000,
	likeCount: 300,
	commentCount: 50,
	chapterCount: 3,
	hasCaptions: true,
	thumbnailUrl: 'https://i.ytimg.com/vi/abc/mqdefault.jpg',
};

const filmFacts: ImportFacts = {
	kind: 'MOVIE',
	publishedAt: '2010-07-16T00:00:00Z',
	durationSeconds: 8880,
	rating: 8.4,
	ratingCount: 38_000,
	ratingSource: 'TMDB',
	genres: ['Action', 'Science Fiction'],
	topCast: ['Leonardo DiCaprio', 'Joseph Gordon-Levitt', 'Elliot Page'],
	revenue: 839_030_630,
};

function item(overrides: Partial<ImportItem> = {}): ImportItem {
	return {
		id: '1',
		sourceId: '10',
		destinationType: 'YOUTUBE_VIDEO',
		externalId: 'abc',
		url: 'https://www.youtube.com/watch?v=abc',
		title: 'Maps of Meaning 1',
		facts: videoFacts,
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

const sources = [
	{ id: '10', title: 'Jordan B Peterson', sourceRef: '@JordanBPeterson' },
	{ id: '11', title: null, sourceRef: '525' },
] as ImportSource[];

function row(overrides: Partial<ImportItem> = {}): ImportRow {
	return toImportRows([item(overrides)], sources)[0];
}

const film = () => row({ id: '2', sourceId: '11', destinationType: 'MOVIE', facts: filmFacts });

describe('facts', () => {
	it('column headers are prettified keys', () => {
		expect(prettifyKey('viewCount')).toBe('View count');
		expect(prettifyKey('durationSeconds')).toBe('Duration seconds');
		expect(prettifyKey('thumbnailUrl')).toBe('Thumbnail URL');
		expect(prettifyKey('kind')).toBe('Kind');
	});

	it('one column per key any row has: the shared ones first, then A to Z, never the title-cell facts', () => {
		expect(factKeys([row(), film()])).toEqual([
			'kind',
			'publishedAt',
			'durationSeconds',
			'chapterCount',
			'commentCount',
			'genres',
			'hasCaptions',
			'likeCount',
			'rating',
			'ratingCount',
			'ratingSource',
			'revenue',
			'topCast',
			'viewCount',
		]);
		expect(factKeys([film()]), 'a filmography has no view or like columns').not.toContain('viewCount');
		expect(factKeys([])).toEqual([]);
	});

	it.each([
		['viewCount', 1_234_567, '1.2 M'],
		['rating', 8.4, '8.4'],
		['durationSeconds', 8756, '2:25:56'],
		['publishedAt', '2026-10-17T12:00:00Z', 'Oct 17, 2026'],
		['hasCaptions', true, 'Yes'],
		['hasCaptions', false, 'No'],
		['topCast', ['A', 'B'], 'A, B'],
		['genres', [], EMPTY_VALUE],
		['kind', 'VIDEO', 'Video'],
		['ratingSource', 'TMDB', 'TMDB'],
		['likeCount', undefined, EMPTY_VALUE],
		['likeCount', null, EMPTY_VALUE],
	] as const)('%s %o reads as %s', (key, value, text) => {
		expect(formatFact(key, value as never)).toBe(text);
	});

	it('a missing fact is unknown, never 0', () => {
		// A channel that hides likes sends no likeCount key at all.
		const hidden = row({ facts: Object.fromEntries(Object.entries(videoFacts).filter(([k]) => k !== 'likeCount')) });
		const likes = factColumnDef('likeCount', [hidden]);
		const shown = (likes.valueFormatter as (p: { value: unknown }) => string)({
			value: (likes.valueGetter as (p: { data: ImportRow }) => unknown)({ data: hidden }),
		});
		expect(shown).toBe(EMPTY_VALUE);
	});

	it('compact numbers carry the exact figure in the tooltip', () => {
		expect(factTooltip('viewCount', 1_234_567)).toBe('1,234,567');
		expect(factTooltip('durationSeconds', 8756)).toBe('');
		expect(factTooltip('topCast', ['A', 'B'])).toBe('A, B');
		expect(factTooltip('summary', 'text')).toBe('');
	});
});

describe('columns', () => {
	const ids = (defs: { colId?: string }[]) => defs.map((d) => d.colId);

	it('fixed columns around one column per fact, newest first', () => {
		const defs = buildImportColumnDefs([row(), film()], 2);
		expect(ids(defs).slice(0, 4)).toEqual(['select', 'title', 'destination', 'source']);
		expect(ids(defs).at(-1)).toBe('status');
		expect(ids(defs)).toContain('fact:viewCount');
		expect(ids(defs)).toContain('fact:topCast');
		expect(defs.find((d) => d.colId === 'fact:publishedAt')?.sort).toBe('desc');
		const select = defs[0];
		expect(select.pinned).toBe('left');
		expect(select.headerCheckboxSelectionFilteredOnly).toBe(true);
	});

	it('one source hides the Source column, which would repeat it on every row', () => {
		expect(ids(buildImportColumnDefs([row()], 1))).not.toContain('source');
	});

	it('every column keeps its width as a floor, so the sheet scrolls instead of squeezing', () => {
		for (const d of buildImportColumnDefs([row(), film()])) if (d.width) expect(d.minWidth).toBe(d.width);
	});

	it('the filter follows the values: numbers, dates and text', () => {
		const rows = [row(), film()];
		expect(factColumnDef('viewCount', rows).filter).toBe('agNumberColumnFilter');
		expect(factColumnDef('publishedAt', rows).filter).toBe('agDateColumnFilter');
		expect(factColumnDef('ratingSource', rows).filter).toBe('agTextColumnFilter');
		const cast = factColumnDef('topCast', rows);
		expect(cast.filter).toBe('agTextColumnFilter');
		expect((cast.filterValueGetter as (p: { data: ImportRow }) => string)({ data: film() })).toBe(
			'Leonardo DiCaprio, Joseph Gordon-Levitt, Elliot Page',
		);
	});

	it('the sheet says once what its sources cannot supply', () => {
		expect(unavailableNote(sheetTypes([film()]))).toContain("TMDB doesn't publish views");
		expect(unavailableNote(sheetTypes([row()]))).toContain('dislike counts');
		expect(unavailableNote(new Set())).toBe('');
	});

	it('the date filter compares ISO timestamps by UTC day', () => {
		const cmp = isoDateFilterParams.comparator!;
		const day = new Date(2026, 9, 17);
		expect(cmp(day, '2026-10-17T23:00:00Z')).toBe(0);
		expect(cmp(day, '2026-10-16T12:00:00Z')).toBe(-1);
		expect(cmp(day, '2026-10-18T00:00:00Z')).toBe(1);
		expect(cmp(day, null as unknown as string)).toBe(-1);
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
			row({ id: '2', facts: { ...videoFacts, durationSeconds: 3600 } }),
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
	it('title shows the thumbnail, title and summary', () => {
		const el = titleCellRenderer({ data: row() }) as HTMLElement;
		expect(el.querySelector('img')?.getAttribute('src')).toBe('https://i.ytimg.com/vi/abc/mqdefault.jpg');
		expect(el.textContent).toContain('Maps of Meaning 1');
		expect(el.textContent).toContain('Lecture one of the 2017 course.');
		const bare = titleCellRenderer({ data: row({ facts: { kind: 'VIDEO' } }) }) as HTMLElement;
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
