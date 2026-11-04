import type { ColDef, IDateFilterParams, ValueFormatterParams } from '@ag-grid-community/core';
import type { ImportDestinationType, ImportFactValue, ImportItem, ImportSource } from '$lib/queries/imports';
import { EMPTY_VALUE, formatCount, formatCountExact, formatDurationSeconds, typeCellRenderer } from './formatting';
import { contentTypeLabel } from './grid-config';

/**
 * Import staging sheet: pure column, filter and selection logic, kept out of
 * ImportSheet.svelte so it can be unit tested (AG Grid doesn't render in jsdom).
 *
 * Every row shows enough to decide without leaving the page (ADDING_CONTENT_TYPE.md,
 * Decision 8). The decision facts are generic: one column per facts key that any
 * row has, titled from the key (viewCount → "View count") and formatted by the
 * key's suffix and the value's type, so a new content type's facts show up with
 * no change here. A missing key is unknown and shows the empty marker, never 0.
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

/** Facts the Title cell shows (under the title, and as its image), so they get no column of their own. */
const TITLE_CELL_FACTS: ReadonlySet<string> = new Set(['summary', 'thumbnailUrl']);

/** Facts every content type has, shown first; the rest follow alphabetically. */
const LEADING_FACTS: readonly string[] = ['kind', 'publishedAt', 'durationSeconds'];

/** "viewCount" → "View count", "thumbnailUrl" → "Thumbnail URL". */
export function prettifyKey(key: string): string {
	const words = key
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.split(' ')
		.map((w) => (/^(url|id|usd)$/i.test(w) ? w.toUpperCase() : w.toLowerCase()));
	const text = words.join(' ');
	return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The facts keys present in any row, as sheet columns: the shared ones first, then A–Z. */
export function factKeys(rows: readonly Pick<ImportItem, 'facts'>[]): string[] {
	const keys = new Set<string>();
	for (const r of rows) for (const k of Object.keys(r.facts ?? {})) if (!TITLE_CELL_FACTS.has(k)) keys.add(k);
	const lead = LEADING_FACTS.filter((k) => keys.has(k));
	const rest = [...keys].filter((k) => !LEADING_FACTS.includes(k)).sort();
	return [...lead, ...rest];
}

/** A fact as text, or null when the row doesn't have it. */
export function factText(row: Pick<ImportItem, 'facts'>, key: string): string | null {
	const v = row.facts?.[key];
	return typeof v === 'string' ? v : null;
}

/** A fact as a number, or null when the row doesn't have it. */
export function factNumber(row: Pick<ImportItem, 'facts'>, key: string): number | null {
	const v = row.facts?.[key];
	return typeof v === 'number' ? v : null;
}

/** Facts whose values are enum constants (VIDEO, SHORT), shown in sentence case; other text (TMDB) is as sent. */
const ENUM_FACTS: ReadonlySet<string> = new Set(['kind']);

const isDateKey = (key: string) => key.endsWith('At');
const isSecondsKey = (key: string) => key.endsWith('Seconds');

/**
 * A fact for display: lists joined, yes/no, *Seconds as a duration, *At as a date,
 * whole numbers compact (1.2 M), fractions to one decimal, enum values in
 * sentence case. Missing is the empty marker.
 */
export function formatFact(key: string, value: ImportFactValue | null | undefined): string {
	if (value === null || value === undefined) return EMPTY_VALUE;
	if (Array.isArray(value)) return value.length ? value.join(', ') : EMPTY_VALUE;
	if (typeof value === 'boolean') return value ? 'Yes' : 'No';
	if (typeof value === 'number') {
		if (isSecondsKey(key)) return formatDurationSeconds(value);
		return Number.isInteger(value) ? formatCount(value) : value.toFixed(1);
	}
	if (isDateKey(key)) return formatDate(value);
	if (ENUM_FACTS.has(key)) return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');
	return value;
}

/** The exact figure behind a compact one, for a tooltip ("1,234,567"); '' for anything else. */
export function factTooltip(key: string, value: ImportFactValue | null | undefined): string {
	if (typeof value === 'number' && Number.isInteger(value) && !isSecondsKey(key)) return formatCountExact(value);
	if (Array.isArray(value)) return value.join(', ');
	return '';
}

function formatDate(iso: string | null): string {
	if (!iso) return EMPTY_VALUE;
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return EMPTY_VALUE;
	return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

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
		totalSeconds += factNumber(r, 'durationSeconds') ?? 0;
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

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

/** What each source can't supply, said once above the sheet instead of in a column of blanks. */
const UNAVAILABLE: Record<ImportDestinationType, string> = {
	YOUTUBE_VIDEO: 'YouTube no longer shares dislike counts, and videos carry no rating.',
	MOVIE: "TMDB doesn't publish views, likes or comments for films.",
};

/** The destination types present in a sheet's rows. */
export function sheetTypes(rows: readonly Pick<ImportItem, 'destinationType'>[]): Set<ImportDestinationType> {
	return new Set(rows.map((r) => r.destinationType));
}

/** One line for the sheet: what its sources don't supply. A column shows only when some row has that fact. */
export function unavailableNote(types: ReadonlySet<ImportDestinationType>): string {
	return (Object.keys(UNAVAILABLE) as ImportDestinationType[])
		.filter((t) => types.has(t))
		.map((t) => UNAVAILABLE[t])
		.join(' ');
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
	const thumbnail = factText(row, 'thumbnailUrl');
	if (thumbnail) {
		const img = document.createElement('img');
		img.src = thumbnail;
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
	summary.textContent = factText(row, 'summary') ?? 'No summary: open the row for the full description';
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

/** The first value any row has for a key, which decides the column's filter. */
function sampleValue(rows: readonly ImportRow[], key: string): ImportFactValue | undefined {
	for (const r of rows) {
		const v = r.facts?.[key];
		if (v !== undefined && v !== null) return v;
	}
	return undefined;
}

/** A facts key's column: header from the key, filter from its values, cell text from formatFact. */
export function factColumnDef(key: string, rows: readonly ImportRow[]): ColDef<ImportRow> {
	const sample = sampleValue(rows, key);
	const header = prettifyKey(key);
	const base: ColDef<ImportRow> = {
		colId: `fact:${key}`,
		headerName: header,
		width: Math.max(96, Math.min(240, header.length * 9 + 40)),
		valueGetter: (p) => p.data?.facts?.[key] ?? null,
		valueFormatter: (p: ValueFormatterParams<ImportRow>) => formatFact(key, p.value),
		tooltipValueGetter: (p) => factTooltip(key, p.data?.facts?.[key]),
	};
	if (typeof sample === 'number') return { ...base, ...numberFilter };
	if (typeof sample === 'string' && isDateKey(key)) {
		return { ...base, filter: 'agDateColumnFilter', floatingFilter: true, filterParams: isoDateFilterParams };
	}
	if (Array.isArray(sample)) {
		return { ...base, width: 220, filterValueGetter: (p) => formatFact(key, p.data?.facts?.[key]), ...textFilter };
	}
	return { ...base, filterValueGetter: (p) => formatFact(key, p.data?.facts?.[key]), ...textFilter };
}

/**
 * Column definitions for the sheet: fixed columns around one column per facts
 * key in `rows`. With one source the Source column would repeat it on every
 * row, so it's left out. Every column's width is also its minWidth (as on the
 * Plan grid): a spreadsheet should scroll sideways, not squeeze.
 */
export function buildImportColumnDefs(rows: readonly ImportRow[], sourceCount = 2): ColDef<ImportRow>[] {
	const keys = factKeys(rows);
	const facts = keys.map((k) => factColumnDef(k, rows));
	const published = facts.find((c) => c.colId === 'fact:publishedAt');
	if (published) published.sort = 'desc';
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
			tooltipValueGetter: (p) => (p.data ? (factText(p.data, 'summary') ?? p.data.title) : ''),
			// Search the summary too, so a word from the description's first line finds the row.
			getQuickFilterText: (p) =>
				`${p.data?.title ?? ''} ${p.data ? (factText(p.data, 'summary') ?? '') : ''} ${p.data?.sourceTitle ?? ''}`,
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
	];
	if (sourceCount > 1)
		defs.push({ colId: 'source', field: 'sourceTitle', headerName: 'Source', width: 170, ...textFilter });
	defs.push(...facts, {
		colId: 'status',
		headerName: 'Status',
		width: 140,
		valueGetter: (p) => (p.data ? importStatusLabel(p.data) : ''),
		cellRenderer: statusCellRenderer,
		...textFilter,
	});
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
