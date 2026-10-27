import { describe, it, expect } from 'vitest';
import type { ImportItem, ImportSource } from '$lib/queries/imports';
import { EMPTY_VALUE } from '$lib/utils/formatting';
import {
	ageDays,
	buildImportColumnDefs,
	columnsForSet,
	commentRate,
	DECIDE_COLUMNS,
	destinationCellRenderer,
	formatLikes,
	formatRate,
	formatRating,
	formatTotalTime,
	IMPORT_COL_IDS,
	importStatusLabel,
	isLowSampleRating,
	isoDateFilterParams,
	isSelectable,
	likeRate,
	passesSheetFilter,
	ratingTooltip,
	selectionSummary,
	titleCellRenderer,
	toImportRows,
	viewsPerDay,
	type ImportRow,
} from '$lib/utils/import-sheet';

function item(overrides: Partial<ImportItem> = {}): ImportItem {
	return {
		id: '1',
		sourceId: '10',
		destinationType: 'YOUTUBE_VIDEO',
		kind: 'VIDEO',
		externalId: 'abc',
		url: 'https://www.youtube.com/watch?v=abc',
		title: 'Maps of Meaning 1',
		summary: 'Lecture one of the 2017 course.',
		publishedAt: '2026-10-17T12:00:00Z',
		durationSeconds: 8756,
		viewCount: 10_000,
		likeCount: 300,
		commentCount: 50,
		rating: null,
		ratingCount: null,
		ratingSource: null,
		chapterCount: 3,
		hasCaptions: true,
		thumbnailUrl: 'https://i.ytimg.com/vi/abc/mqdefault.jpg',
		position: 0,
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

describe('decision figures', () => {
	it('rates and momentum', () => {
		expect(likeRate(item())).toBeCloseTo(0.03);
		expect(commentRate(item())).toBeCloseTo(0.005);
		expect(ageDays(item(), now)).toBeCloseTo(10);
		expect(viewsPerDay(item(), now)).toBeCloseTo(1000);
		expect(formatRate(0.0312)).toBe('3.1%');
		expect(formatRate(null)).toBe(EMPTY_VALUE);
	});

	it('hidden likes are unknown, never 0, and a movie has no likes at all', () => {
		const hidden = item({ likeCount: null });
		expect(likeRate(hidden)).toBeNull();
		expect(formatLikes(hidden)).toBe('hidden');
		expect(formatLikes(item({ likeCount: null, destinationType: 'MOVIE' }))).toBe(EMPTY_VALUE);
		expect(likeRate(item({ viewCount: 0 }))).toBeNull();
	});

	it('unknown dates and views give no age-based figures', () => {
		expect(ageDays(item({ publishedAt: null }), now)).toBeNull();
		expect(ageDays(item({ publishedAt: 'not a date' }), now)).toBeNull();
		expect(viewsPerDay(item({ viewCount: null }), now)).toBeNull();
		expect(ageDays(item({ publishedAt: '2026-10-27T11:00:00Z' }), now)).toBe(1);
	});

	it('ratings name their source and mute small samples', () => {
		const film = item({ destinationType: 'MOVIE', rating: 8.4, ratingCount: 38000, ratingSource: 'TMDB' });
		expect(formatRating(film)).toBe('8.4 / 10');
		expect(ratingTooltip(film)).toBe('TMDB: 8.4 / 10 from 38,000 ratings');
		expect(isLowSampleRating(film)).toBe(false);
		const few = { ...film, ratingCount: 12 };
		expect(isLowSampleRating(few)).toBe(true);
		expect(ratingTooltip(few)).toContain('few ratings');
		expect(formatRating(item())).toBe(EMPTY_VALUE);
		expect(ratingTooltip(item())).toBe('');
		expect(ratingTooltip({ rating: 7.4, ratingCount: null, ratingSource: null })).toBe('Rating: 7.4 / 10');
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
			row({ id: '2', durationSeconds: 3600 }),
			row({ id: '3', destinationType: 'MOVIE', sourceId: '11', durationSeconds: null }),
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

describe('columns', () => {
	const defs = buildImportColumnDefs(now);
	const byId = new Map(defs.map((d) => [d.colId, d]));

	it('has the destination content type column in the Decide set', () => {
		expect(byId.get('destination')?.headerName).toBe('Becomes');
		expect(DECIDE_COLUMNS).toContain('destination');
	});

	it('every toggled column exists, and the selection column is pinned with select-all-filtered', () => {
		for (const id of IMPORT_COL_IDS) expect(byId.has(id), id).toBe(true);
		const select = byId.get('select')!;
		expect(select.checkboxSelection).toBe(true);
		expect(select.headerCheckboxSelectionFilteredOnly).toBe(true);
		expect(select.pinned).toBe('left');
		expect(byId.get('title')?.pinned).toBe('left');
	});

	it('Decide hides only the bookkeeping columns; All shows everything', () => {
		const decide = columnsForSet('decide');
		expect(decide.shown).toEqual([...DECIDE_COLUMNS]);
		expect(decide.hidden).toEqual(['ratingCount', 'chapters', 'captions', 'recency', 'externalId', 'statsFetchedAt']);
		expect(columnsForSet('all')).toEqual({ shown: [...IMPORT_COL_IDS], hidden: [] });
	});

	it('every column keeps its width as a floor, so the sheet scrolls instead of squeezing', () => {
		for (const d of defs) expect(d.minWidth, d.colId).toBe(d.width);
	});

	it('every data column can be filtered from the floating filter row', () => {
		for (const d of defs) {
			if (d.colId === 'select' || d.colId === 'statsFetchedAt') continue;
			expect(d.floatingFilter, d.colId).toBe(true);
		}
	});

	it('value getters compute the derived columns', () => {
		const r = row();
		const get = (id: string) => (byId.get(id)!.valueGetter as (p: { data: ImportRow }) => unknown)({ data: r });
		expect(get('likeRate')).toBeCloseTo(0.03);
		expect(get('viewsPerDay')).toBeCloseTo(1000);
		expect(get('status')).toBe('Not imported');
		expect(get('recency')).toBe(1);
		expect(get('captions')).toBe('Yes');
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

describe('cell renderers', () => {
	it('title shows the thumbnail, title and summary', () => {
		const el = titleCellRenderer({ data: row() }) as HTMLElement;
		expect(el.querySelector('img')?.getAttribute('src')).toBe('https://i.ytimg.com/vi/abc/mqdefault.jpg');
		expect(el.textContent).toContain('Maps of Meaning 1');
		expect(el.textContent).toContain('Lecture one of the 2017 course.');
		const bare = titleCellRenderer({ data: row({ summary: null, thumbnailUrl: null }) }) as HTMLElement;
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
