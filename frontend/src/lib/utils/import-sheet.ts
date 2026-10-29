import type { ColDef, IDateFilterParams, ValueFormatterParams } from '@ag-grid-community/core';
import type { ImportDestinationType, ImportItem, ImportItemKind, ImportSource } from '$lib/queries/imports';
import { EMPTY_VALUE, formatCount, formatCountExact, formatDurationSeconds, typeCellRenderer } from './formatting';
import { contentTypeLabel } from './grid-config';

/**
 * Import staging sheet: pure column, filter and selection logic, kept out of
 * ImportSheet.svelte so it can be unit tested (AG Grid doesn't render in jsdom).
 *
 * Every row shows enough to decide without leaving the page (ADDING_CONTENT_TYPE.md,
 * Decision 8): what it is, how big, how current, how well received; the detail
 * panel has the rest. Missing is never 0: hidden likes say "hidden", and a
 * figure a content type doesn't have shows the empty marker.
 */

/** A row's row-data shape: the item plus its source's title, for the Source column and search. */
export interface ImportRow extends ImportItem {
	sourceTitle: string;
}

export function toImportRows(items: readonly ImportItem[], sources: readonly ImportSource[]): ImportRow[] {
	const titles = new Map(sources.map((s) => [s.id, s.title ?? s.sourceRef]));
	return items.map((it) => ({ ...it, sourceTitle: titles.get(it.sourceId) ?? '' }));
}

export const KIND_LABELS: Record<ImportItemKind, string> = {
	VIDEO: 'Video',
	SHORT: 'Short',
	LIVE: 'Live',
	MOVIE: 'Movie',
};

/** Ratings resting on fewer votes than this are shown muted (Decision 8: low-sample figures). */
export const LOW_SAMPLE_RATING_COUNT = 50;

/**
 * Per-source overrides of LOW_SAMPLE_RATING_COUNT. A critic aggregate rests on a few
 * dozen reviews at most, so 50 would mute nearly every film it scores.
 */
const LOW_SAMPLE_BY_SOURCE: Record<string, number> = { Metacritic: 10 };

function lowSampleThreshold(source: string | null): number {
	return (source && LOW_SAMPLE_BY_SOURCE[source]) || LOW_SAMPLE_RATING_COUNT;
}

/** What the count under a rating counts: critic reviews for Metacritic, user ratings otherwise. */
export function ratingCountNoun(source: string | null): string {
	return source === 'Metacritic' ? 'critic reviews' : 'ratings';
}

const DAY_MS = 86_400_000;

/** Days since publishing, at least 1, or null when the date is unknown. */
export function ageDays(item: Pick<ImportItem, 'publishedAt'>, now: Date): number | null {
	if (!item.publishedAt) return null;
	const t = Date.parse(item.publishedAt);
	if (Number.isNaN(t)) return null;
	return Math.max(1, (now.getTime() - t) / DAY_MS);
}

/** Likes ÷ views, or null when either is unknown (hidden likes are unknown, not 0). */
export function likeRate(item: Pick<ImportItem, 'likeCount' | 'viewCount'>): number | null {
	if (item.likeCount === null || !item.viewCount) return null;
	return item.likeCount / item.viewCount;
}

/** Comments ÷ views, or null when either is unknown. */
export function commentRate(item: Pick<ImportItem, 'commentCount' | 'viewCount'>): number | null {
	if (item.commentCount === null || !item.viewCount) return null;
	return item.commentCount / item.viewCount;
}

/** Views per day since publishing: momentum, so a new upload isn't judged on raw views. */
export function viewsPerDay(item: Pick<ImportItem, 'viewCount' | 'publishedAt'>, now: Date): number | null {
	const days = ageDays(item, now);
	if (days === null || item.viewCount === null) return null;
	return item.viewCount / days;
}

export function formatRate(rate: number | null, digits = 1): string {
	return rate === null ? EMPTY_VALUE : `${(rate * 100).toFixed(digits)}%`;
}

/** Likes cell text: "hidden" when a YouTube channel hides them; the empty marker when the type has no likes. */
export function formatLikes(item: Pick<ImportItem, 'likeCount' | 'destinationType'>): string {
	if (item.likeCount !== null) return formatCount(item.likeCount);
	return item.destinationType === 'YOUTUBE_VIDEO' ? 'hidden' : EMPTY_VALUE;
}

/** "8.4 / 10" — the rating's source and count go in the tooltip and the detail panel. */
export function formatRating(item: Pick<ImportItem, 'rating'>): string {
	return item.rating === null ? EMPTY_VALUE : `${item.rating.toFixed(1)} / 10`;
}

export function ratingTooltip(item: Pick<ImportItem, 'rating' | 'ratingCount' | 'ratingSource'>): string {
	if (item.rating === null) return '';
	const source = item.ratingSource ?? 'Rating';
	const count =
		item.ratingCount === null
			? ''
			: ` from ${formatCountExact(item.ratingCount)} ${ratingCountNoun(item.ratingSource)}`;
	const low = isLowSampleRating(item) ? ` (few ${ratingCountNoun(item.ratingSource)}, treat with care)` : '';
	return `${source}: ${item.rating.toFixed(1)} / 10${count}${low}`;
}

export function isLowSampleRating(item: Pick<ImportItem, 'rating' | 'ratingCount' | 'ratingSource'>): boolean {
	return item.rating !== null && item.ratingCount !== null && item.ratingCount < lowSampleThreshold(item.ratingSource);
}

/** The row's state in words: library first, then the import outcome. */
export function importStatusLabel(item: Pick<ImportItem, 'inLibrary' | 'importStatus'>): string {
	switch (item.importStatus) {
		case 'QUEUED':
			return 'Importing…';
		case 'IMPORTED':
			return 'Imported';
		case 'SKIPPED':
			return 'Already in library';
		case 'FAILED':
			return item.inLibrary ? 'In library' : 'Failed';
	}
	return item.inLibrary ? 'In library' : 'Not imported';
}

/** A row can be picked when it isn't in the library and isn't queued or done. Failed rows can be retried. */
export function isSelectable(item: Pick<ImportItem, 'inLibrary' | 'importStatus'>): boolean {
	if (item.inLibrary) return false;
	return item.importStatus === null || item.importStatus === 'FAILED';
}

export type LibraryFilter = 'all' | 'new' | 'lib';

/** The toolbar's filters, applied outside AG Grid's column filters. */
export interface SheetFilter {
	/** Source id, or '' for every source. */
	sourceId: string;
	library: LibraryFilter;
}

export function passesSheetFilter(row: ImportRow, f: SheetFilter): boolean {
	if (f.sourceId && row.sourceId !== f.sourceId) return false;
	if (f.library === 'new') return isSelectable(row);
	if (f.library === 'lib') return row.inLibrary;
	return true;
}

export interface SelectionSummary {
	count: number;
	totalSeconds: number;
	bySource: { title: string; count: number }[];
	byDestination: { label: string; count: number }[];
}

export function selectionSummary(rows: readonly ImportRow[]): SelectionSummary {
	const bySource = new Map<string, number>();
	const byDest = new Map<string, number>();
	let totalSeconds = 0;
	for (const r of rows) {
		bySource.set(r.sourceTitle, (bySource.get(r.sourceTitle) ?? 0) + 1);
		const label = contentTypeLabel(r.destinationType.toLowerCase());
		byDest.set(label, (byDest.get(label) ?? 0) + 1);
		totalSeconds += r.durationSeconds ?? 0;
	}
	return {
		count: rows.length,
		totalSeconds,
		bySource: [...bySource].map(([title, count]) => ({ title, count })),
		byDestination: [...byDest].map(([label, count]) => ({ label, count })),
	};
}

/** "about 3 h" / "about 25 min" of watching, for the selection bar. */
export function formatTotalTime(seconds: number): string {
	if (seconds <= 0) return '';
	if (seconds < 3600) return `about ${Math.max(1, Math.round(seconds / 60))} min`;
	return `about ${Math.round(seconds / 3600)} h`;
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

export type ColumnSet = 'decide' | 'all';

/** Column ids shown in the default "Decide" set: the ones that answer "is this worth importing?". */
export const DECIDE_COLUMNS: readonly string[] = [
	'title',
	'destination',
	'kind',
	'source',
	'published',
	'length',
	'rating',
	'starring',
	'genres',
	'views',
	'likes',
	'likeRate',
	'comments',
	'viewsPerDay',
	'status',
];

/** Every column id that the column set toggles (the pinned checkbox column is always shown). */
export const IMPORT_COL_IDS: readonly string[] = [
	...DECIDE_COLUMNS,
	'ratingCount',
	'chapters',
	'captions',
	'recency',
	'externalId',
	'statsFetchedAt',
];

/**
 * The content types a column has data for; a column not listed here applies to every type.
 * A sheet hides columns that apply to none of its rows, so a filmography isn't a wall of
 * empty view and like columns (Decision 8: say once what the source can't supply).
 */
export const COLUMN_TYPES: Readonly<Record<string, readonly ImportDestinationType[]>> = {
	// Video / Short / Live; a film's kind would only repeat the Becomes column.
	kind: ['YOUTUBE_VIDEO'],
	views: ['YOUTUBE_VIDEO'],
	likes: ['YOUTUBE_VIDEO'],
	likeRate: ['YOUTUBE_VIDEO'],
	comments: ['YOUTUBE_VIDEO'],
	viewsPerDay: ['YOUTUBE_VIDEO'],
	chapters: ['YOUTUBE_VIDEO'],
	captions: ['YOUTUBE_VIDEO'],
	genres: ['MOVIE'],
	starring: ['MOVIE'],
	rating: ['MOVIE'],
	ratingCount: ['MOVIE'],
};

function appliesToAny(colId: string, types: ReadonlySet<ImportDestinationType>): boolean {
	const only = COLUMN_TYPES[colId];
	return !only || only.some((t) => types.has(t));
}

/** The destination types present in a sheet's rows. */
export function sheetTypes(rows: readonly Pick<ImportItem, 'destinationType'>[]): Set<ImportDestinationType> {
	return new Set(rows.map((r) => r.destinationType));
}

/**
 * Columns to show and hide for a column set, given the destination types in the sheet.
 * With one source the Source column would repeat it on every row, so it hides.
 */
export function columnsForSet(
	set: ColumnSet,
	types: ReadonlySet<ImportDestinationType>,
	sourceCount = 2,
): { shown: string[]; hidden: string[] } {
	const inSet = set === 'all' ? new Set(IMPORT_COL_IDS) : new Set(DECIDE_COLUMNS);
	const shown = IMPORT_COL_IDS.filter(
		(id) => inSet.has(id) && appliesToAny(id, types) && (id !== 'source' || sourceCount > 1),
	);
	const showing = new Set(shown);
	return { shown, hidden: IMPORT_COL_IDS.filter((id) => !showing.has(id)) };
}

/** What each source can't supply, said once above the sheet instead of in a column of blanks. */
const UNAVAILABLE: Record<ImportDestinationType, string> = {
	YOUTUBE_VIDEO: 'YouTube no longer shares dislike counts, and videos carry no rating.',
	MOVIE: "TMDB doesn't publish views, likes or comments for films.",
};

/**
 * One line for the sheet: what its sources don't supply, and where that shows. A sheet of
 * one type hides those columns; a mixed sheet keeps them and leaves the other type's cells empty.
 */
export function unavailableNote(types: ReadonlySet<ImportDestinationType>): string {
	const parts = (Object.keys(UNAVAILABLE) as ImportDestinationType[])
		.filter((t) => types.has(t))
		.map((t) => UNAVAILABLE[t]);
	if (parts.length === 0) return '';
	const tail = types.size > 1 ? 'Those cells are empty for the rows they don’t apply to.' : 'Those columns are hidden.';
	return `${parts.join(' ')} ${tail}`;
}

/** Date filter comparator for ISO timestamps (AG Grid's date filter compares by local midnight). */
export const isoDateFilterParams: IDateFilterParams = {
	comparator: (filterDate: Date, cellValue: string | null) => {
		if (!cellValue) return -1;
		const d = new Date(cellValue);
		const cell = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
		const filter = Date.UTC(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate());
		return cell < filter ? -1 : cell > filter ? 1 : 0;
	},
	buttons: ['reset'],
};

/** A short list as "a, b, c", or the empty marker. */
export function listOrEmpty(values: readonly string[]): string {
	return values.length ? values.join(', ') : EMPTY_VALUE;
}

function formatPublished(iso: string | null): string {
	if (!iso) return EMPTY_VALUE;
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return EMPTY_VALUE;
	return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Title cell: thumbnail, title, and the one-line summary under it. */
export function titleCellRenderer(params: { data?: ImportRow }): HTMLElement | string {
	const row = params.data;
	if (!row) return '';
	const wrap = document.createElement('div');
	wrap.className = 'flex h-full items-center gap-2';
	if (row.thumbnailUrl) {
		const img = document.createElement('img');
		img.src = row.thumbnailUrl;
		img.alt = '';
		img.loading = 'lazy';
		img.className =
			row.destinationType === 'MOVIE'
				? 'h-10 w-7 shrink-0 rounded object-cover'
				: 'h-9 w-16 shrink-0 rounded object-cover';
		wrap.appendChild(img);
	}
	const text = document.createElement('div');
	text.className = 'flex min-w-0 flex-col leading-tight';
	const title = document.createElement('span');
	title.className = 'truncate font-medium';
	title.textContent = row.title;
	const summary = document.createElement('span');
	summary.className = 'text-muted-foreground truncate text-xs';
	summary.textContent = row.summary ?? 'No summary: open the row for the full description';
	text.append(title, summary);
	wrap.appendChild(text);
	return wrap;
}

/** "Becomes" cell: the destination content type's icon (same as the Activity Type column) and its name. */
export function destinationCellRenderer(params: { data?: ImportRow }): HTMLElement | string {
	const row = params.data;
	if (!row) return '';
	const wrap = document.createElement('div');
	wrap.className = 'flex h-full items-center gap-2';
	const icon = typeCellRenderer({ data: { contentType: row.destinationType } });
	if (typeof icon !== 'string') {
		icon.className = 'flex items-center';
		wrap.appendChild(icon);
	}
	const label = document.createElement('span');
	label.textContent = contentTypeLabel(row.destinationType.toLowerCase());
	wrap.appendChild(label);
	return wrap;
}

function statusCellRenderer(params: { data?: ImportRow }): HTMLElement | string {
	const row = params.data;
	if (!row) return '';
	const span = document.createElement('span');
	span.textContent = importStatusLabel(row);
	const tone =
		row.importStatus === 'FAILED' && !row.inLibrary
			? 'text-destructive'
			: row.inLibrary || row.importStatus === 'IMPORTED'
				? 'text-rating-positive font-medium'
				: 'text-muted-foreground';
	span.className = tone;
	if (row.importError) span.title = row.importError;
	return span;
}

const textFilter = { filter: 'agTextColumnFilter', floatingFilter: true, filterParams: { buttons: ['reset'] } };
const numberFilter = {
	filter: 'agNumberColumnFilter',
	floatingFilter: true,
	filterParams: { buttons: ['reset'] },
	type: 'rightAligned',
	cellClass: 'tabular-nums',
};

/**
 * Column definitions for the sheet. `now` fixes "today" for age-based columns.
 * Every column's width is also its minWidth (as on the Plan grid): the grid
 * would otherwise squeeze 20 columns into the container, and a spreadsheet
 * should scroll sideways instead.
 */
export function buildImportColumnDefs(now: Date): ColDef<ImportRow>[] {
	return columnDefs(now).map((d) => (d.width ? { ...d, minWidth: d.width } : d));
}

function columnDefs(now: Date): ColDef<ImportRow>[] {
	return [
		{
			colId: 'select',
			headerName: '',
			width: 44,
			pinned: 'left',
			checkboxSelection: true,
			headerCheckboxSelection: true,
			// The header box picks every row that passes the current filters, not just the visible ones.
			headerCheckboxSelectionFilteredOnly: true,
			sortable: false,
			resizable: false,
			suppressHeaderMenuButton: true,
		},
		{
			colId: 'title',
			field: 'title',
			headerName: 'Title',
			pinned: 'left',
			width: 360,
			cellRenderer: titleCellRenderer,
			tooltipValueGetter: (p) => p.data?.summary ?? p.data?.title ?? '',
			// Search the summary too, so a word from the description's first line finds the row.
			getQuickFilterText: (p) => `${p.data?.title ?? ''} ${p.data?.summary ?? ''} ${p.data?.sourceTitle ?? ''}`,
			...textFilter,
		},
		{
			colId: 'destination',
			field: 'destinationType',
			headerName: 'Becomes',
			headerTooltip: 'The Perspectize content type this row is imported as',
			width: 150,
			cellRenderer: destinationCellRenderer,
			valueFormatter: (p: ValueFormatterParams<ImportRow>) => contentTypeLabel(String(p.value ?? '').toLowerCase()),
			filterValueGetter: (p) => contentTypeLabel((p.data?.destinationType ?? '').toLowerCase()),
			...textFilter,
		},
		{
			colId: 'kind',
			field: 'kind',
			headerName: 'Kind',
			width: 96,
			valueFormatter: (p: ValueFormatterParams<ImportRow>) => KIND_LABELS[p.value as ImportItemKind] ?? '',
			filterValueGetter: (p) => (p.data ? KIND_LABELS[p.data.kind] : ''),
			...textFilter,
		},
		{ colId: 'source', field: 'sourceTitle', headerName: 'Source', width: 170, ...textFilter },
		{
			colId: 'published',
			field: 'publishedAt',
			headerName: 'Published',
			width: 140,
			sort: 'desc',
			valueFormatter: (p: ValueFormatterParams<ImportRow>) => formatPublished(p.value ?? null),
			filter: 'agDateColumnFilter',
			floatingFilter: true,
			filterParams: isoDateFilterParams,
		},
		{
			colId: 'length',
			field: 'durationSeconds',
			headerName: 'Length',
			headerTooltip: 'Running time. Filter in seconds.',
			width: 100,
			valueFormatter: (p: ValueFormatterParams<ImportRow>) =>
				p.value === null || p.value === undefined ? EMPTY_VALUE : formatDurationSeconds(p.value),
			...numberFilter,
		},
		{
			colId: 'rating',
			field: 'rating',
			headerName: 'Rating',
			headerTooltip: 'Out of 10, from the source named in the tooltip',
			width: 100,
			valueFormatter: (p: ValueFormatterParams<ImportRow>) => (p.data ? formatRating(p.data) : ''),
			tooltipValueGetter: (p) => (p.data ? ratingTooltip(p.data) : ''),
			cellClassRules: { 'text-muted-foreground': (p) => !!p.data && isLowSampleRating(p.data) },
			...numberFilter,
		},
		{
			colId: 'starring',
			headerName: 'Starring',
			headerTooltip: 'Top-billed cast',
			width: 240,
			valueGetter: (p) => (p.data ? listOrEmpty(p.data.topCast) : ''),
			tooltipValueGetter: (p) => (p.data ? p.data.topCast.join(', ') : ''),
			...textFilter,
		},
		{
			colId: 'genres',
			headerName: 'Genres',
			width: 200,
			valueGetter: (p) => (p.data ? listOrEmpty(p.data.genres) : ''),
			tooltipValueGetter: (p) => (p.data ? p.data.genres.join(', ') : ''),
			...textFilter,
		},
		{
			colId: 'views',
			field: 'viewCount',
			headerName: 'Views',
			width: 96,
			valueFormatter: (p: ValueFormatterParams<ImportRow>) => formatCount(p.value ?? null),
			tooltipValueGetter: (p) => formatCountExact(p.data?.viewCount ?? null),
			...numberFilter,
		},
		{
			colId: 'likes',
			field: 'likeCount',
			headerName: 'Likes',
			width: 92,
			valueFormatter: (p: ValueFormatterParams<ImportRow>) => (p.data ? formatLikes(p.data) : ''),
			tooltipValueGetter: (p) =>
				p.data && p.data.likeCount === null && p.data.destinationType === 'YOUTUBE_VIDEO'
					? 'The channel hides likes on this video'
					: formatCountExact(p.data?.likeCount ?? null),
			...numberFilter,
		},
		{
			colId: 'likeRate',
			headerName: 'Like rate',
			headerTooltip: 'Likes ÷ views: reception, adjusted for reach. Filter as a decimal (0.03 = 3%).',
			width: 104,
			valueGetter: (p) => (p.data ? likeRate(p.data) : null),
			valueFormatter: (p: ValueFormatterParams<ImportRow>) => formatRate(p.value ?? null),
			...numberFilter,
		},
		{
			colId: 'comments',
			field: 'commentCount',
			headerName: 'Comments',
			width: 108,
			valueFormatter: (p: ValueFormatterParams<ImportRow>) => formatCount(p.value ?? null),
			tooltipValueGetter: (p) => formatCountExact(p.data?.commentCount ?? null),
			...numberFilter,
		},
		{
			colId: 'viewsPerDay',
			headerName: 'Views/day',
			headerTooltip: 'Views ÷ days since publishing: momentum, so new uploads are not judged on raw views',
			width: 108,
			valueGetter: (p) => (p.data ? viewsPerDay(p.data, now) : null),
			valueFormatter: (p: ValueFormatterParams<ImportRow>) =>
				p.value === null || p.value === undefined ? EMPTY_VALUE : formatCount(Math.round(p.value)),
			...numberFilter,
		},
		{
			colId: 'status',
			headerName: 'Status',
			width: 140,
			valueGetter: (p) => (p.data ? importStatusLabel(p.data) : ''),
			cellRenderer: statusCellRenderer,
			...textFilter,
		},
		{
			colId: 'ratingCount',
			field: 'ratingCount',
			headerName: 'Ratings',
			headerTooltip: 'How many ratings (or, for Metacritic, critic reviews) the score rests on',
			width: 96,
			valueFormatter: (p: ValueFormatterParams<ImportRow>) => formatCount(p.value ?? null),
			...numberFilter,
		},
		{ colId: 'chapters', field: 'chapterCount', headerName: 'Chapters', width: 100, ...numberFilter },
		{
			colId: 'captions',
			headerName: 'Captions',
			width: 100,
			valueGetter: (p) => (!p.data || p.data.hasCaptions === null ? EMPTY_VALUE : p.data.hasCaptions ? 'Yes' : 'No'),
			...textFilter,
		},
		{
			colId: 'recency',
			field: 'position',
			headerName: 'Recency',
			headerTooltip: 'Position in the source listing; 1 is first (newest for channels)',
			width: 96,
			valueGetter: (p) => (p.data ? p.data.position + 1 : null),
			...numberFilter,
		},
		{ colId: 'externalId', field: 'externalId', headerName: 'Source ID', width: 130, ...textFilter },
		{
			colId: 'statsFetchedAt',
			field: 'statsFetchedAt',
			headerName: 'Stats as of',
			width: 120,
			valueFormatter: (p: ValueFormatterParams<ImportRow>) => formatPublished(p.value ?? null),
		},
	];
}
