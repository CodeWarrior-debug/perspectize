/**
 * Plan grid column metadata: the single source of truth for the Plan table's
 * columns (labels, sort keys, widths and responsive tiers), plus the pure
 * formatters the cells use. Mirrors `grid-config.ts`'s `COLUMNS` pattern for
 * the Activity grid. Nothing here touches the DOM.
 */
import type { ColDef, ValueFormatterParams, ValueGetterParams } from '@ag-grid-community/core';
import type { TodoPrivacy, UserTodoItem, UserTodoSortBy, UserTodoStatus } from '$lib/queries/userTodos';
import type { ResponsiveTier } from './grid-config';
import { ratingToDisplay } from './ratings';
import { addPerspectiveDisabledReason } from './plan-todo-helpers';

export type PlanColId =
	| 'content'
	| 'action'
	| 'priority'
	| 'status'
	| 'percentComplete'
	| 'startDate'
	| 'endDate'
	| 'dueDate'
	| 'list'
	| 'privacy'
	| 'comments'
	| 'addPerspective';

export interface PlanColumnMeta {
	colId: PlanColId;
	/** Header text. */
	label: string;
	/** Fixed width, or the floor for a flex column. */
	minWidth: number;
	/** `flex` for the columns that absorb spare width; omitted for fixed-width columns. */
	flex?: number;
	/** The tier from which the column shows (xs = every tier). */
	minTier: ResponsiveTier;
	/** Whether the header is clickable. Client-only sorts are not offered. */
	sortable: boolean;
	/** The API sort key a server sort sends; present only when the API supports it. */
	serverSort?: UserTodoSortBy;
}

/** Column order = header order. Widths sum to ~1.5k px at lg, so the grid scrolls sideways on small screens. */
export const PLAN_COLUMNS: readonly PlanColumnMeta[] = [
	{ colId: 'content', label: 'Content', minWidth: 200, flex: 2, minTier: 'xs', sortable: false },
	{ colId: 'action', label: 'Action', minWidth: 100, minTier: 'xs', sortable: false },
	{
		colId: 'priority',
		label: 'Priority',
		minWidth: 84,
		minTier: 'xs',
		sortable: true,
		serverSort: 'PRIORITY',
	},
	{ colId: 'status', label: 'Status', minWidth: 110, minTier: 'sm', sortable: false },
	{ colId: 'percentComplete', label: '% Complete', minWidth: 100, minTier: 'md', sortable: false },
	{ colId: 'startDate', label: 'Start', minWidth: 100, minTier: 'lg', sortable: false },
	{ colId: 'endDate', label: 'End', minWidth: 100, minTier: 'lg', sortable: false },
	{ colId: 'dueDate', label: 'Due', minWidth: 100, minTier: 'md', sortable: true, serverSort: 'DUE_DATE' },
	{
		colId: 'list',
		label: 'List',
		minWidth: 140,
		minTier: 'md',
		sortable: true,
		serverSort: 'LIST_POSITION',
	},
	{ colId: 'privacy', label: 'Privacy', minWidth: 90, minTier: 'lg', sortable: false },
	{ colId: 'comments', label: 'Comments', minWidth: 160, flex: 1, minTier: 'lg', sortable: false },
	{ colId: 'addPerspective', label: 'Perspective', minWidth: 120, minTier: 'sm', sortable: false },
];

const TIER_RANK: Record<ResponsiveTier, number> = { xs: 0, sm: 1, md: 2, lg: 3 };

/** The columns that show at a tier, in header order. */
export function planColumnsForTier(tier: ResponsiveTier): PlanColId[] {
	return PLAN_COLUMNS.filter((c) => TIER_RANK[c.minTier] <= TIER_RANK[tier]).map((c) => c.colId);
}

/** Every Plan colId, for toggling visibility at a tier change. */
export const PLAN_COL_IDS: readonly PlanColId[] = PLAN_COLUMNS.map((c) => c.colId);

/** The API sort for a sortable column, or null when the column has no server sort. */
export function serverSortFor(colId: string): UserTodoSortBy | null {
	return PLAN_COLUMNS.find((c) => c.colId === colId)?.serverSort ?? null;
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/** Shown for any empty value. */
export const PLAN_EMPTY = '—';

const STATUS_LABELS: Record<UserTodoStatus, string> = {
	NOT_STARTED: 'Not started',
	IN_PROGRESS: 'In progress',
	DONE: 'Done',
	DROPPED: 'Dropped',
};

export function planStatusLabel(status: UserTodoStatus | null | undefined): string {
	return status ? (STATUS_LABELS[status] ?? PLAN_EMPTY) : PLAN_EMPTY;
}

export function planPercentLabel(percent: number | null | undefined): string {
	if (percent === null || percent === undefined || !Number.isFinite(percent)) return PLAN_EMPTY;
	return `${Math.min(100, Math.max(0, Math.round(percent)))}%`;
}

/** Priority is stored on the 0-10000 rating scale; display it with the shared rating helper. */
export function planPriorityLabel(priority: number | null | undefined): string {
	if (priority === null || priority === undefined) return PLAN_EMPTY;
	return ratingToDisplay(priority);
}

/**
 * A YYYY-MM-DD date (as the API sends it) shown as e.g. "Oct 10, 2026". Parsed
 * as a calendar date, not via `new Date(iso)`, which reads it as UTC midnight
 * and shows the previous day west of UTC.
 */
export function planDateLabel(iso: string | null | undefined): string {
	if (!iso) return PLAN_EMPTY;
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
	if (!match) return PLAN_EMPTY;
	const [, y, m, d] = match;
	const date = new Date(Number(y), Number(m) - 1, Number(d));
	if (Number.isNaN(date.getTime())) return PLAN_EMPTY;
	return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function planListLabel(list: { name: string } | null, position: number | null): string {
	if (!list) return PLAN_EMPTY;
	return position === null ? list.name : `${list.name} · ${position}`;
}

export function planPrivacyLabel(privacy: TodoPrivacy | null | undefined): string {
	if (!privacy) return PLAN_EMPTY;
	return privacy === 'PRIVATE' ? 'Private' : 'Public';
}

/** The content's name, else the free-text name, else a placeholder. */
export function planContentLabel(todo: Pick<UserTodoItem, 'content' | 'name'>): string {
	return todo.content?.name || todo.name || 'Untitled';
}

/** Plain-text preview of the rich-text comments: tags stripped, whitespace collapsed, cut at `max` characters. */
export function planCommentsPreview(html: string | null | undefined, max = 80): string {
	if (!html) return '';
	const text = html
		.replace(/<[^>]*>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (text.length <= max) return text;
	return `${text.slice(0, max - 1).trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// AG Grid column definitions
// ---------------------------------------------------------------------------

/** Cell value for the "Add perspective" column; the action is opened by the grid's cell-click handler. */
export const ADD_PERSPECTIVE_LABEL = 'Add';

/**
 * Column definitions for the Plan grid. `listMode` turns on drag-to-reorder
 * on the Content column (rows are then in list order). `tier` sets the initial
 * `hide` flags; the grid's responsive effect keeps them in step afterwards.
 */
export function buildPlanColumnDefs(listMode: boolean, tier: ResponsiveTier = 'lg'): ColDef<UserTodoItem>[] {
	const shown = new Set(planColumnsForTier(tier));
	const metaFor = (colId: PlanColId): PlanColumnMeta => {
		const meta = PLAN_COLUMNS.find((c) => c.colId === colId);
		if (!meta) throw new Error(`Unknown plan column ${colId}`);
		return meta;
	};

	const sizing = (colId: PlanColId): Partial<ColDef<UserTodoItem>> => {
		const meta = metaFor(colId);
		return meta.flex !== undefined
			? { flex: meta.flex, minWidth: meta.minWidth }
			: { width: meta.minWidth, minWidth: meta.minWidth };
	};

	const common = (colId: PlanColId): ColDef<UserTodoItem> => {
		const meta = metaFor(colId);
		return {
			colId,
			headerName: meta.label,
			sortable: meta.sortable,
			hide: !shown.has(colId),
			...sizing(colId),
		};
	};

	return [
		{
			...common('content'),
			valueGetter: (p: ValueGetterParams<UserTodoItem>) => (p.data ? planContentLabel(p.data) : ''),
			rowDrag: () => listMode,
		},
		{
			...common('action'),
			valueGetter: (p: ValueGetterParams<UserTodoItem>) => p.data?.action.label ?? '',
		},
		{
			...common('priority'),
			valueGetter: (p: ValueGetterParams<UserTodoItem>) => p.data?.priority ?? null,
			valueFormatter: (p: ValueFormatterParams<UserTodoItem, number | null>) => planPriorityLabel(p.value),
		},
		{
			...common('status'),
			valueGetter: (p: ValueGetterParams<UserTodoItem>) => p.data?.status ?? null,
			valueFormatter: (p: ValueFormatterParams<UserTodoItem, UserTodoStatus | null>) => planStatusLabel(p.value),
		},
		{
			...common('percentComplete'),
			valueGetter: (p: ValueGetterParams<UserTodoItem>) => p.data?.percentComplete ?? null,
			valueFormatter: (p: ValueFormatterParams<UserTodoItem, number | null>) => planPercentLabel(p.value),
		},
		{
			...common('startDate'),
			valueGetter: (p: ValueGetterParams<UserTodoItem>) => p.data?.startDate ?? null,
			valueFormatter: (p: ValueFormatterParams<UserTodoItem, string | null>) => planDateLabel(p.value),
		},
		{
			...common('endDate'),
			valueGetter: (p: ValueGetterParams<UserTodoItem>) => p.data?.endDate ?? null,
			valueFormatter: (p: ValueFormatterParams<UserTodoItem, string | null>) => planDateLabel(p.value),
		},
		{
			...common('dueDate'),
			valueGetter: (p: ValueGetterParams<UserTodoItem>) => p.data?.dueDate ?? null,
			valueFormatter: (p: ValueFormatterParams<UserTodoItem, string | null>) => planDateLabel(p.value),
		},
		{
			...common('list'),
			valueGetter: (p: ValueGetterParams<UserTodoItem>) =>
				p.data ? planListLabel(p.data.list, p.data.listPosition) : '',
		},
		{
			...common('privacy'),
			valueGetter: (p: ValueGetterParams<UserTodoItem>) => p.data?.privacy ?? null,
			valueFormatter: (p: ValueFormatterParams<UserTodoItem, TodoPrivacy | null>) => planPrivacyLabel(p.value),
		},
		{
			...common('comments'),
			valueGetter: (p: ValueGetterParams<UserTodoItem>) => planCommentsPreview(p.data?.comments),
		},
		{
			...common('addPerspective'),
			valueGetter: (p: ValueGetterParams<UserTodoItem>) =>
				p.data && addPerspectiveDisabledReason(p.data) === null ? ADD_PERSPECTIVE_LABEL : PLAN_EMPTY,
			tooltipValueGetter: (p) =>
				p.data ? (addPerspectiveDisabledReason(p.data) ?? 'Add a perspective on this content') : undefined,
		},
	];
}
