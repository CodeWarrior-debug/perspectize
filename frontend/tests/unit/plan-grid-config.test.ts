import { describe, it, expect } from 'vitest';
import {
	PLAN_COLUMNS,
	PLAN_COL_IDS,
	buildPlanColumnDefs,
	planColumnsForTier,
	planCommentsPreview,
	planContentLabel,
	planDateLabel,
	planListLabel,
	planPercentLabel,
	planPriorityLabel,
	planPrivacyLabel,
	planStatusLabel,
	serverSortFor,
	PLAN_EMPTY,
} from '$lib/utils/plan-grid-config';
import type { UserTodoItem, UserTodoSortBy } from '$lib/queries/userTodos';

const SERVER_SORTS: UserTodoSortBy[] = ['PRIORITY', 'DUE_DATE', 'CREATED_AT', 'UPDATED_AT', 'LIST_POSITION'];

function todo(overrides: Partial<UserTodoItem> = {}): UserTodoItem {
	return {
		id: '1',
		user: { id: '7', username: 'ada' },
		content: null,
		name: 'Read the paper',
		action: { id: '2', key: 'consume', label: 'Consume', description: '', typicalSequence: 2, isPreset: true },
		priority: null,
		status: 'NOT_STARTED',
		percentComplete: 0,
		startDate: null,
		endDate: null,
		dueDate: null,
		comments: null,
		privacy: 'PUBLIC',
		list: null,
		listPosition: null,
		createdAt: '2026-10-01T00:00:00Z',
		updatedAt: '2026-10-01T00:00:00Z',
		...overrides,
	};
}

describe('PLAN_COLUMNS metadata', () => {
	it('has one entry per column with unique colIds and a header label', () => {
		const ids = PLAN_COLUMNS.map((c) => c.colId);
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids).toEqual(PLAN_COL_IDS);
		for (const c of PLAN_COLUMNS) expect(c.label.length).toBeGreaterThan(0);
	});

	it('maps the server-sortable headers to the API sort keys', () => {
		expect(serverSortFor('priority')).toBe('PRIORITY');
		expect(serverSortFor('dueDate')).toBe('DUE_DATE');
		expect(serverSortFor('list')).toBe('LIST_POSITION');
	});

	it('only gives a server sort to a sortable column, using a key the API supports', () => {
		for (const c of PLAN_COLUMNS) {
			if (c.serverSort !== undefined) {
				expect(c.sortable).toBe(true);
				expect(SERVER_SORTS).toContain(c.serverSort);
			}
			if (!c.sortable) expect(c.serverSort).toBeUndefined();
		}
	});

	it('returns null for a column with no server sort', () => {
		expect(serverSortFor('status')).toBeNull();
		expect(serverSortFor('nope')).toBeNull();
	});

	it('gives every column a positive minimum width', () => {
		for (const c of PLAN_COLUMNS) expect(c.minWidth).toBeGreaterThan(0);
	});
});

describe('planColumnsForTier', () => {
	it('shows the essentials on xs and adds columns as the tier widens', () => {
		expect(planColumnsForTier('xs')).toEqual(['content', 'action', 'priority']);
		expect(planColumnsForTier('sm')).toEqual(['content', 'action', 'priority', 'status', 'addPerspective']);
		expect(planColumnsForTier('md')).toContain('percentComplete');
		expect(planColumnsForTier('md')).toContain('dueDate');
		expect(planColumnsForTier('md')).not.toContain('startDate');
	});

	it('shows every column at lg', () => {
		expect(planColumnsForTier('lg')).toEqual(PLAN_COL_IDS);
	});
});

describe('formatters', () => {
	it('labels statuses and falls back to a dash', () => {
		expect(planStatusLabel('NOT_STARTED')).toBe('Not started');
		expect(planStatusLabel('IN_PROGRESS')).toBe('In progress');
		expect(planStatusLabel('DONE')).toBe('Done');
		expect(planStatusLabel('DROPPED')).toBe('Dropped');
		expect(planStatusLabel(null)).toBe(PLAN_EMPTY);
	});

	it('formats percent and clamps it to 0-100', () => {
		expect(planPercentLabel(40)).toBe('40%');
		expect(planPercentLabel(0)).toBe('0%');
		expect(planPercentLabel(150)).toBe('100%');
		expect(planPercentLabel(-5)).toBe('0%');
		expect(planPercentLabel(null)).toBe(PLAN_EMPTY);
	});

	it('shows priority on the 0-10 rating display scale', () => {
		expect(planPriorityLabel(9234)).toBe('9.234');
		expect(planPriorityLabel(0)).toBe('0.000');
		expect(planPriorityLabel(null)).toBe(PLAN_EMPTY);
	});

	it('shows a YYYY-MM-DD date as a calendar day, not shifted by timezone', () => {
		expect(planDateLabel('2026-10-10')).toBe('Oct 10, 2026');
		expect(planDateLabel('2026-01-01')).toBe('Jan 1, 2026');
		expect(planDateLabel(null)).toBe(PLAN_EMPTY);
		expect(planDateLabel('not a date')).toBe(PLAN_EMPTY);
	});

	it('shows the list name with its position', () => {
		expect(planListLabel({ name: 'Reading' }, 3)).toBe('Reading · 3');
		expect(planListLabel({ name: 'Reading' }, null)).toBe('Reading');
		expect(planListLabel(null, null)).toBe(PLAN_EMPTY);
	});

	it('labels both privacy values', () => {
		expect(planPrivacyLabel('PUBLIC')).toBe('Public');
		expect(planPrivacyLabel('PRIVATE')).toBe('Private');
		expect(planPrivacyLabel(null)).toBe(PLAN_EMPTY);
	});

	it('names a row by its content, then its free-text name, then a placeholder', () => {
		expect(planContentLabel(todo({ content: { id: '9', name: 'Some video' }, name: null }))).toBe('Some video');
		expect(planContentLabel(todo({ name: 'An idea' }))).toBe('An idea');
		expect(planContentLabel(todo({ name: null }))).toBe('Untitled');
	});

	it('previews comments as plain text, cut at the limit', () => {
		expect(planCommentsPreview('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
		expect(planCommentsPreview('<p>a&nbsp;&nbsp;b</p>')).toBe('a b');
		expect(planCommentsPreview(null)).toBe('');
		const long = `<p>${'word '.repeat(30)}</p>`;
		const preview = planCommentsPreview(long, 20);
		expect(preview.endsWith('…')).toBe(true);
		expect(preview.length).toBe(20);
	});
});

describe('buildPlanColumnDefs', () => {
	it('builds one column definition per column, in header order', () => {
		const defs = buildPlanColumnDefs(false);
		expect(defs.map((d) => d.colId)).toEqual(PLAN_COL_IDS);
		expect(defs.map((d) => d.headerName)).toEqual(PLAN_COLUMNS.map((c) => c.label));
	});

	it('hides, by default, the columns that a tier does not show', () => {
		const xs = buildPlanColumnDefs(false, 'xs');
		expect(xs.find((d) => d.colId === 'content')?.hide).toBe(false);
		expect(xs.find((d) => d.colId === 'status')?.hide).toBe(true);
		const lg = buildPlanColumnDefs(false, 'lg');
		expect(lg.every((d) => d.hide === false)).toBe(true);
	});

	it('enables row drag on the content column only in list mode', () => {
		const rowDrag = (listMode: boolean) => {
			const content = buildPlanColumnDefs(listMode).find((d) => d.colId === 'content');
			return (content?.rowDrag as () => boolean)();
		};
		expect(rowDrag(false)).toBe(false);
		expect(rowDrag(true)).toBe(true);
	});

	it('shows the Add perspective value only for rows with content', () => {
		const add = buildPlanColumnDefs(false).find((d) => d.colId === 'addPerspective');
		const getter = add?.valueGetter as unknown as (p: { data: UserTodoItem }) => string;
		expect(getter({ data: todo({ content: { id: '9', name: 'Video' } }) })).toBe('Add');
		expect(getter({ data: todo() })).toBe(PLAN_EMPTY);
	});

	it('explains the disabled Add perspective cell in its tooltip', () => {
		const add = buildPlanColumnDefs(false).find((d) => d.colId === 'addPerspective');
		const tooltip = add?.tooltipValueGetter as unknown as (p: { data: UserTodoItem }) => string | undefined;
		expect(tooltip({ data: todo() })).toBe('Link this to content first');
		expect(tooltip({ data: todo({ content: { id: '9', name: 'Video' } }) })).toBe('Add a perspective on this content');
	});
});
