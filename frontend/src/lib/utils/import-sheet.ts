import type { ColDef, IDateFilterParams, ValueFormatterParams, ValueGetterParams } from '@ag-grid-community/core';
import type { ImportDestinationType, ImportFacts, ImportItem, ImportSource } from '$lib/queries/imports';
import { EMPTY_VALUE, formatCount, formatCountExact, formatDurationSeconds, typeCellRenderer } from './formatting';
import { contentTypeLabel } from './grid-config';

/**
 * Import staging sheet: pure column, filter and selection logic, kept out of
 * ImportSheet.svelte so it can be unit tested (AG Grid doesn't render in jsdom).
 *
 * Every row shows enough to decide without leaving the page (ADDING_CONTENT_TYPE.md,
 * Decision 8). The decision data is one facts object per row whose snake_case
 * keys are shared across content types (backend domain.ImportFacts). The sheet
 * makes a column of every key present in any row, labels it by prettifying
 * the key, and formats it by the key's suffix (_seconds, _count, _usd, _at).
 * A key no row has never becomes a column, so a filmography has no view
 * columns and a channel no box office, without a table of which type has what.
 */

/** A row's row-data shape: the item plus its source's title, for the Source column and search. */
export interface ImportRow extends ImportItem {
	sourceTitle: string;
}

export function toImportRows(items: readonly ImportItem[], sources: readonly ImportSource[]): ImportRow[] {
	const titles = new Map(sources.map((s) => [s.id, s.title ?? s.sourceRef]));
	return items.map((it) => ({ ...it, sourceTitle: titles.get(it.sourceId) ?? '' }));
}

// ---------------------------------------------------------------------------
// Facts
// ---------------------------------------------------------------------------

function num(f: ImportFacts, key: string): number | null {
	const v = f[key];
	return typeof v === 'number' ? v : null;
}

function str(f: ImportFacts, key: string): string | null {
	const v = f[key];
	return typeof v === 'string' && v !== '' ? v : null;
}

/** Facts shown somewhere other than their own column. */
const NOT_COLUMNS = new Set([
	'summary', // under the title
	'thumbnail_url', // beside the title
	'likes_hidden', // qualifies like_count
	'rating_source', // in the rating tooltip
]);

/** Columns lead with these, in this order; any other key follows, alphabetically. */
const KEY_ORDER = [
	'kind',
	'published_at',
	'duration_seconds',
	'rating',
	'top_cast',
	'genres',
	'box_office_usd',
	'view_count',
	'like_count',
	'like_rate',
	'comment_count',
	'views_per_day',
];

/** Shown under All columns only: secondary to the decision. */
export const SECONDARY_KEYS: ReadonlySet<string> = new Set([
	'rating_count',
	'review_count',
	'popularity',
	'budget_usd',
	'chapter_count',
	'has_captions',
]);

/**
 * A column label from a fact key, with no table of names: snake_case becomes
 * words, and the suffix becomes the unit ("box_office_usd" → "Box office (USD)",
 * "view_count" → "Views", "duration_seconds" → "Duration", "published_at" →
 * "Published", "has_captions" → "Captions").
 */
export function prettifyFactKey(key: string): string {
	let words = key;
	let unit = '';
	if (words.endsWith('_usd')) {
		words = words.slice(0, -4);
		unit = ' (USD)';
	} else if (words.endsWith('_seconds')) {
		words = words.slice(0, -8);
	} else if (words.endsWith('_at')) {
		words = words.slice(0, -3);
	} else if (words.endsWith('_count')) {
		words = `${words.slice(0, -6)}s`;
	}
	if (words.startsWith('has_')) words = words.slice(4);
	const text = words.replace(/_/g, ' ');
	return text.charAt(0).toUpperCase() + text.slice(1) + unit;
}

/** Ratings resting on fewer votes than this are shown muted (Decision 8: low-sample figures). */
export const LOW_SAMPLE_RATING_COUNT = 50;

/**
 * Per-source overrides of LOW_SAMPLE_RATING_COUNT. A critic aggregate rests on a few
 * dozen reviews at most, so 50 would mute nearly every film it scores.
 */
const LOW_SAMPLE_BY_SOURCE: Record<string, number> = { Metacritic: 10 };

/** What the count under a rating counts: critic reviews for Metacritic, user ratings otherwise. */
export function ratingCountNoun(source: string | null): string {
	return source === 'Metacritic' ? 'critic reviews' : 'ratings';
}

export function isLowSampleRating(f: ImportFacts): boolean {
	const rating = num(f, 'rating');
	const count = num(f, 'rating_count');
	if (rating === null || count === null) return false;
	const source = str(f, 'rating_source');
	return count < ((source && LOW_SAMPLE_BY_SOURCE[source]) || LOW_SAMPLE_RATING_COUNT);
}

/** "TMDB: 8.4 / 10 from 38,000 ratings" for the rating tooltip and panel. */
export function ratingTooltip(f: ImportFacts): string {
	const rating = num(f, 'rating');
	if (rating === null) return '';
	const source = str(f, 'rating_source');
	const count = num(f, 'rating_count');
	const counted = count === null ? '' : ` from ${formatCountExact(count)} ${ratingCountNoun(source)}`;
	const low = isLowSampleRating(f) ? ` (few ${ratingCountNoun(source)}, treat with care)` : '';
	return `${source ?? 'Rating'}: ${rating.toFixed(1)} / 10${counted}${low}`;
}

const DAY_MS = 86_400_000;

/** Days since publishing, at least 1, or null when the date is unknown. */
export function ageDays(f: ImportFacts, now: Date): number | null {
	const iso = str(f, 'published_at');
	if (!iso) return null;
	const t = Date.parse(iso);
	if (Number.isNaN(t)) return null;
	return Math.max(1, (now.getTime() - t) / DAY_MS);
}

/** Likes ÷ views, or null when either is unknown (hidden likes are unknown, not 0). */
export function likeRate(f: ImportFacts): number | null {
	const likes = num(f, 'like_count');
	const views = num(f, 'view_count');
	return likes === null || !views ? null : likes / views;
}

/** Comments ÷ views, or null when either is unknown. */
export function commentRate(f: ImportFacts): number | null {
	const comments = num(f, 'comment_count');
	const views = num(f, 'view_count');
	return comments === null || !views ? null : comments / views;
}

/** Views per day since publishing: momentum, so a new upload isn't judged on raw views. */
export function viewsPerDay(f: ImportFacts, now: Date): number | null {
	const days = ageDays(f, now);
	const views = num(f, 'view_count');
	return days === null || views === null ? null : views / days;
}

export function formatRate(rate: number | null, digits = 1): string {
	return rate === null ? EMPTY_VALUE : `${(rate * 100).toFixed(digits)}%`;
}

/** "$836.8M" / "$6,000": money, in USD. */
export function formatUsd(n: number | null): string {
	if (n === null) return EMPTY_VALUE;
	if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
	if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
	return `$${formatCountExact(n)}`;
}

/** A short list as "a, b, c", or the empty marker. */
export function listOrEmpty(values: readonly string[]): string {
	return values.length ? values.join(', ') : EMPTY_VALUE;
}

function formatDate(iso: string | null): string {
	if (!iso) return EMPTY_VALUE;
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return EMPTY_VALUE;
	return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** How a fact's value sorts and filters: the number, the date, or text. */
export type FactKind = 'number' | 'date' | 'text';

export function factKind(key: string): FactKind {
	if (key.endsWith('_at')) return 'date';
	if (
		key.endsWith('_count') ||
		key.endsWith('_seconds') ||
		key.endsWith('_usd') ||
		['rating', 'popularity', 'like_rate', 'views_per_day'].includes(key)
	)
		return 'number';
	return 'text';
}

/**
 * A fact's cell text, chosen by its key: durations, counts, money, dates,
 * a 0-10 rating, yes/no, lists. Missing is the empty marker, and a video whose
 * channel hides likes says "hidden" rather than showing a blank like a 0.
 */
export function formatFact(key: string, f: ImportFacts): string {
	if (key === 'like_count' && f.likes_hidden === true && num(f, 'like_count') === null) return 'hidden';
	const v = f[key];
	if (v === undefined || v === null || v === '') return EMPTY_VALUE;
	if (Array.isArray(v)) return listOrEmpty(v.map(String));
	if (typeof v === 'boolean') return v ? 'Yes' : 'No';
	if (typeof v === 'number') {
		if (key === 'rating') return `${v.toFixed(1)} / 10`;
		if (key.endsWith('_seconds')) return formatDurationSeconds(v);
		if (key.endsWith('_usd')) return formatUsd(v);
		if (key.endsWith('_count')) return formatCount(v);
		return Number.isInteger(v) ? formatCountExact(v) : v.toFixed(1);
	}
	if (typeof v === 'string') {
		if (key.endsWith('_at')) return formatDate(v);
		return v.charAt(0).toUpperCase() + v.slice(1);
	}
	return String(v);
}

/** A fact's tooltip: the exact figure behind a rounded one, or the rating's source and count. */
export function factTooltip(key: string, f: ImportFacts): string {
	if (key === 'rating') return ratingTooltip(f);
	if (key === 'like_count' && f.likes_hidden === true) return 'The channel hides likes on this video';
	if (key === 'box_office_usd' && num(f, 'budget_usd') !== null) {
		return `${formatUsd(num(f, 'box_office_usd'))} worldwide on a ${formatUsd(num(f, 'budget_usd'))} budget`;
	}
	const v = num(f, key);
	if (v !== null && (key.endsWith('_count') || key.endsWith('_usd'))) return formatCountExact(v);
	const list = f[key];
	if (Array.isArray(list)) return list.join(', ');
	return '';
}

/**
 * Derived columns, computed in the sheet when the facts they need exist:
 * reception and momentum adjusted for reach.
 */
const DERIVED: Record<string, { needs: string[]; value: (f: ImportFacts, now: Date) => number | null; tip: string }> = {
	like_rate: {
		needs: ['like_count', 'view_count'],
		value: (f) => likeRate(f),
		tip: 'Likes ÷ views: reception, adjusted for reach. Filter as a decimal (0.03 = 3%).',
	},
	views_per_day: {
		needs: ['view_count', 'published_at'],
		value: (f, now) => viewsPerDay(f, now),
		tip: 'Views ÷ days since publishing: momentum, so new uploads are not judged on raw views',
	},
};

/** The fact keys that become columns for these rows, in column order (derived ones included). */
export function factColumnKeys(rows: readonly Pick<ImportItem, 'facts'>[]): string[] {
	const present = new Set<string>();
	for (const r of rows) {
		for (const k of Object.keys(r.facts)) if (!NOT_COLUMNS.has(k)) present.add(k);
		// Hidden likes have no like_count key, but the Likes column is where "hidden" is said.
		if (r.facts.likes_hidden === true) present.add('like_count');
	}
	for (const [k, d] of Object.entries(DERIVED)) if (d.needs.every((n) => present.has(n))) present.add(k);
	const rank = (k: string) => {
		const i = KEY_ORDER.indexOf(k);
		return i === -1 ? KEY_ORDER.length : i;
	};
	return [...present].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

// ---------------------------------------------------------------------------
// Rows: status, selection, filters
// ---------------------------------------------------------------------------

/** A non-admin imports at most this many rows at once ("select up to 1,000 at a time"). */
export const SELECTION_LIMIT = 1000;

/** An admin's limit: a whole channel listing. */
export const ADMIN_SELECTION_LIMIT = 5000;

export function selectionLimit(isAdmin: boolean): number {
	return isAdmin ? ADMIN_SELECTION_LIMIT : SELECTION_LIMIT;
}

/** The row's state in words: library first, then the import outcome, then "won't import". */
export function importStatusLabel(item: Pick<ImportItem, 'inLibrary' | 'importStatus' | 'excluded'>): string {
	switch (item.importStatus) {
		case 'QUEUED':
			return 'Importing…';
		case 'IMPORTED':
			return 'Imported';
		case 'SKIPPED':
			return 'Already in library';
		case 'FAILED':
			if (item.inLibrary) return 'In library';
			return item.excluded ? "Won't import" : 'Failed';
	}
	if (item.inLibrary) return 'In library';
	return item.excluded ? "Won't import" : 'Not imported';
}

/**
 * A row can be ticked when it isn't in the library and isn't queued or done
 * (failed rows can be retried). Rows marked "don't import" can be ticked too,
 * so the mark can be cleared; they just aren't imported.
 */
export function isSelectable(item: Pick<ImportItem, 'inLibrary' | 'importStatus'>): boolean {
	if (item.inLibrary) return false;
	return item.importStatus === null || item.importStatus === 'FAILED';
}

/** A ticked row that Import would actually import. */
export function isImportable(item: Pick<ImportItem, 'inLibrary' | 'importStatus' | 'excluded'>): boolean {
	return isSelectable(item) && !item.excluded;
}

/** all · Not imported (still to decide) · In library · Won't import (marked "don't import"). */
export type LibraryFilter = 'all' | 'new' | 'lib' | 'excluded';

/** The toolbar's filters, applied outside AG Grid's column filters. */
export interface SheetFilter {
	/** Source id, or '' for every source. */
	sourceId: string;
	library: LibraryFilter;
}

export function passesSheetFilter(row: ImportRow, f: SheetFilter): boolean {
	if (f.sourceId && row.sourceId !== f.sourceId) return false;
	if (f.library === 'new') return isImportable(row);
	if (f.library === 'lib') return row.inLibrary;
	if (f.library === 'excluded') return row.excluded && !row.inLibrary;
	return true;
}

export interface SelectionSummary {
	count: number;
	/** Ticked rows Import would import (not marked "don't import"). */
	importable: number;
	/** Ticked rows marked "don't import". */
	excluded: number;
	totalSeconds: number;
	bySource: { title: string; count: number }[];
	byDestination: { label: string; count: number }[];
}

export function selectionSummary(rows: readonly ImportRow[]): SelectionSummary {
	const bySource = new Map<string, number>();
	const byDest = new Map<string, number>();
	let totalSeconds = 0;
	let importable = 0;
	let excluded = 0;
	for (const r of rows) {
		if (r.excluded) excluded++;
		else importable++;
		bySource.set(r.sourceTitle, (bySource.get(r.sourceTitle) ?? 0) + 1);
		const label = contentTypeLabel(r.destinationType.toLowerCase());
		byDest.set(label, (byDest.get(label) ?? 0) + 1);
		totalSeconds += num(r.facts, 'duration_seconds') ?? 0;
	}
	return {
		count: rows.length,
		importable,
		excluded,
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

/** What each source can't supply, said once above the sheet (the columns simply aren't there). */
const UNAVAILABLE: Record<ImportDestinationType, string> = {
	YOUTUBE_VIDEO: 'YouTube no longer shares dislike counts, and videos carry no rating.',
	MOVIE: "TMDB doesn't publish views, likes or comments for films.",
};

export function sheetTypes(rows: readonly Pick<ImportItem, 'destinationType'>[]): Set<ImportDestinationType> {
	return new Set(rows.map((r) => r.destinationType));
}

export function unavailableNote(types: ReadonlySet<ImportDestinationType>): string {
	return (Object.keys(UNAVAILABLE) as ImportDestinationType[])
		.filter((t) => types.has(t))
		.map((t) => UNAVAILABLE[t])
		.join(' ');
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

export type ColumnSet = 'decide' | 'all';

/** Columns that aren't facts: shown under All columns only. */
const BOOKKEEPING_COLUMNS = ['recency', 'externalId', 'statsFetchedAt'];

/**
 * Which of the sheet's columns to show and hide. Decide leaves out the
 * secondary facts and the bookkeeping columns; one source hides the Source
 * column, which would only repeat it.
 */
export function columnsForSet(
	set: ColumnSet,
	colIds: readonly string[],
	sourceCount = 2,
): { shown: string[]; hidden: string[] } {
	const hide = (id: string) =>
		(id === 'source' && sourceCount < 2) ||
		(set === 'decide' && (SECONDARY_KEYS.has(id.replace(/^fact:/, '')) || BOOKKEEPING_COLUMNS.includes(id)));
	return { shown: colIds.filter((id) => !hide(id)), hidden: colIds.filter(hide) };
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

/** Title cell: thumbnail, title, and the one-line summary under it. */
export function titleCellRenderer(params: { data?: ImportRow }): HTMLElement | string {
	const row = params.data;
	if (!row) return '';
	const wrap = document.createElement('div');
	wrap.className = 'flex h-full items-center gap-2';
	const thumb = str(row.facts, 'thumbnail_url');
	if (thumb) {
		const img = document.createElement('img');
		img.src = thumb;
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
	summary.textContent = str(row.facts, 'summary') ?? 'No summary: open the row for the full description';
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

/** A width that fits the label and a typical value. */
function factWidth(key: string): number {
	if (key === 'top_cast') return 240;
	if (key === 'genres') return 200;
	if (factKind(key) === 'date') return 140;
	return Math.max(96, prettifyFactKey(key).length * 9 + 40);
}

/** One fact's column: label from the key, value, text and filter by the key's kind. */
function factColumn(key: string, now: Date): ColDef<ImportRow> {
	const derived = DERIVED[key];
	const kind = factKind(key);
	const raw = (p: ValueGetterParams<ImportRow>) => {
		if (!p.data) return null;
		if (derived) return derived.value(p.data.facts, now);
		const v = p.data.facts[key];
		if (Array.isArray(v)) return v.join(', ');
		return v ?? null;
	};
	const label = derived ? (key === 'like_rate' ? 'Like rate' : 'Views/day') : prettifyFactKey(key);
	return {
		colId: `fact:${key}`,
		headerName: label,
		headerTooltip: derived?.tip,
		width: factWidth(key),
		valueGetter: raw,
		valueFormatter: (p: ValueFormatterParams<ImportRow>) => {
			if (!p.data) return '';
			if (key === 'like_rate') return formatRate(p.value ?? null);
			if (key === 'views_per_day') return p.value == null ? EMPTY_VALUE : formatCount(Math.round(p.value));
			return formatFact(key, p.data.facts);
		},
		tooltipValueGetter: (p) => (p.data && !derived ? factTooltip(key, p.data.facts) : ''),
		cellClassRules:
			key === 'rating' ? { 'text-muted-foreground': (p) => !!p.data && isLowSampleRating(p.data.facts) } : undefined,
		...(kind === 'number'
			? numberFilter
			: kind === 'date'
				? { filter: 'agDateColumnFilter', floatingFilter: true, filterParams: isoDateFilterParams }
				: textFilter),
		...(key === 'published_at' ? { sort: 'desc' as const } : {}),
	};
}

/**
 * Column definitions for these rows: the fixed columns, then one per fact key
 * present (see factColumnKeys), then status and the bookkeeping columns.
 * `now` fixes "today" for age-based columns. Every column's width is also its
 * minWidth (as on the Plan grid): a spreadsheet should scroll sideways rather
 * than squeeze its columns.
 */
export function buildImportColumnDefs(rows: readonly ImportRow[], now: Date): ColDef<ImportRow>[] {
	const defs: ColDef<ImportRow>[] = [
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
			tooltipValueGetter: (p) => str(p.data?.facts ?? {}, 'summary') ?? p.data?.title ?? '',
			// Search the summary too, so a word from the description's first line finds the row.
			getQuickFilterText: (p) =>
				`${p.data?.title ?? ''} ${str(p.data?.facts ?? {}, 'summary') ?? ''} ${p.data?.sourceTitle ?? ''}`,
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
		{ colId: 'source', field: 'sourceTitle', headerName: 'Source', width: 170, ...textFilter },
		...factColumnKeys(rows).map((k) => factColumn(k, now)),
		{
			colId: 'status',
			headerName: 'Status',
			width: 140,
			valueGetter: (p) => (p.data ? importStatusLabel(p.data) : ''),
			cellRenderer: statusCellRenderer,
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
			valueFormatter: (p: ValueFormatterParams<ImportRow>) => formatDate(p.value ?? null),
		},
	];
	return defs.map((d) => (d.width ? { ...d, minWidth: d.width } : d));
}

/**
 * The server's reason, for a toast or an inline error: the first GraphQL
 * error's message (graphql-request's ClientError) without the sentinel prefix
 * ("invalid input: ", "access denied: "), capitalised.
 */
export function importErrorMessage(err: unknown, fallback = 'Something went wrong. Try again.'): string {
	const first = (err as { response?: { errors?: { message?: string }[] } } | null | undefined)?.response?.errors?.[0];
	let msg = first?.message ?? (err instanceof Error ? err.message : '');
	msg = msg.replace(/^(invalid input|access denied|resource not found): /, '').trim();
	return msg ? msg.charAt(0).toUpperCase() + msg.slice(1) : fallback;
}

/** "Importing 340 of 1,000" / "Imported 985 of 1,000 · 12 already in library · 3 failed". */
export function progressLabel(p: {
	total: number;
	done: number;
	imported: number;
	skipped: number;
	failed: number;
	running: boolean;
}): string {
	const head = p.running
		? `Importing ${formatCountExact(p.done)} of ${formatCountExact(p.total)}`
		: `Imported ${formatCountExact(p.imported)} of ${formatCountExact(p.total)}`;
	const parts = [head];
	if (p.running && p.imported) parts.push(`${formatCountExact(p.imported)} added`);
	if (p.skipped) parts.push(`${formatCountExact(p.skipped)} already in library`);
	if (p.failed) parts.push(`${formatCountExact(p.failed)} failed`);
	return parts.join(' · ');
}
