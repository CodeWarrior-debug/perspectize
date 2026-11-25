/**
 * Client-side sorting and filtering of Library rows, for the places with no AG Grid instance to
 * delegate to: the mobile card list and "Loaded" mode. Reads each column's `sort.client` and
 * `filter.client` value, so it agrees with the grid's own ordering and matching.
 */
import type { ContentItem } from '#lib/queries/content/index.js';
import { libraryColumn, LIBRARY_COLUMNS } from './index';
import type { RowValue } from './definition';

/** One column's URL filter entry, as urlParamsToFilter produces it: the AG Grid filter model shape. */
export interface AGFilterEntry {
	filterType: 'text' | 'number' | 'date' | 'set';
	type?: string;
	/** Set filters only: matches when the row value is any of these. */
	values?: string[];
	filter?: number | string;
	filterTo?: number;
	dateFrom?: string;
	dateTo?: string;
}

/**
 * Compare two rows by a priority-ordered multi-column sort. Nulls sort last regardless of direction.
 * Columns without a client value (or unknown colIds) are skipped, the same policy the server path uses.
 */
export function compareContentBySorts(
	a: ContentItem,
	b: ContentItem,
	sorts: { col: string; dir: 'asc' | 'desc' }[],
): number {
	for (const { col, dir } of sorts) {
		const getValue = libraryColumn(col)?.sort;
		if (!getValue || !getValue.client) continue;
		const va = getValue.client(a);
		const vb = getValue.client(b);
		if (va == null && vb == null) continue;
		if (va == null) return 1;
		if (vb == null) return -1;
		if (va === vb) continue;
		const cmp = va < vb ? -1 : 1;
		return dir === 'asc' ? cmp : -cmp;
	}
	return 0;
}

function matchesTextFilter(value: string | null, entry: AGFilterEntry): boolean {
	const needle = String(entry.filter ?? '').toLowerCase();
	switch (entry.type) {
		case 'contains':
			return value != null && value.includes(needle);
		case 'notContains':
			return value == null || !value.includes(needle);
		case 'equals':
			return value === needle;
		case 'notEqual':
			return value !== needle;
		case 'startsWith':
			return value != null && value.startsWith(needle);
		case 'endsWith':
			return value != null && value.endsWith(needle);
		case 'blank':
			return value == null || value === '';
		case 'notBlank':
			return value != null && value !== '';
		default:
			return true;
	}
}

function matchesNumberFilter(value: number | null, entry: AGFilterEntry): boolean {
	if (value == null) return false;
	const target = Number(entry.filter);
	switch (entry.type) {
		case 'equals':
			return value === target;
		case 'notEqual':
			return value !== target;
		case 'greaterThan':
			return value > target;
		case 'greaterThanOrEqual':
			return value >= target;
		case 'lessThan':
			return value < target;
		case 'lessThanOrEqual':
			return value <= target;
		case 'inRange':
			return value >= target && value <= (entry.filterTo ?? target);
		default:
			return true;
	}
}

function matchesDateFilter(value: string | null, entry: AGFilterEntry): boolean {
	if (!value) return false;
	const t = new Date(value).getTime();
	const from = entry.dateFrom ? new Date(entry.dateFrom).getTime() : undefined;
	const to = entry.dateTo ? new Date(entry.dateTo).getTime() : undefined;
	switch (entry.type) {
		case 'equals':
			return from !== undefined && t === from;
		case 'greaterThan':
			return from !== undefined && t > from;
		case 'greaterThanOrEqual':
			return from !== undefined && t >= from;
		case 'lessThan':
			return to !== undefined && t < to;
		case 'lessThanOrEqual':
			return to !== undefined && t <= to;
		case 'inRange':
			return from !== undefined && to !== undefined && t >= from && t <= to;
		default:
			return true;
	}
}

/**
 * Apply an AG-Grid-shaped filter model (urlParamsToFilter's output) to a plain row array. A column
 * with no client value (a server-only filter such as the Roles checkboxes) matches every row.
 */
export function filterContentRows(rows: ContentItem[], filterModel: Record<string, unknown>): ContentItem[] {
	const entries = Object.entries(filterModel) as [string, AGFilterEntry][];
	if (entries.length === 0) return rows;

	const getters = new Map<string, (row: ContentItem) => RowValue>(
		LIBRARY_COLUMNS.filter((c) => c.filter?.client).map((c) => [c.colId, c.filter!.client!]),
	);

	return rows.filter((row) =>
		entries.every(([colId, entry]) => {
			const getValue = getters.get(colId);
			if (!getValue) return true;
			const value = getValue(row);
			if (entry.filterType === 'set') return value != null && (entry.values ?? []).includes(String(value));
			if (entry.filterType === 'number') return matchesNumberFilter(value as number | null, entry);
			if (entry.filterType === 'date') return matchesDateFilter(value as string | null, entry);
			return matchesTextFilter(typeof value === 'string' ? value : value == null ? null : String(value), entry);
		}),
	);
}
