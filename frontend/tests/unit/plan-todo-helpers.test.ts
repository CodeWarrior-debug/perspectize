import { describe, it, expect } from 'vitest';
import {
	actionAddText,
	actionMatchesQuery,
	addPerspectiveDisabledReason,
	buildCreateInput,
	buildUpdateInput,
	clampPercent,
	completionFollowUp,
	normalizeComments,
	percentPrompt,
	rowsForSelection,
	sortTodoActions,
	statusPrompt,
	todayIso,
	type TodoFormValues,
} from '$lib/utils/plan-todo-helpers';
import type { TodoActionItem, UserTodoItem } from '$lib/queries/userTodos';

function action(id: string, label: string, typicalSequence: number | null, description = ''): TodoActionItem {
	return { id, key: label.toLowerCase(), label, description, typicalSequence, isPreset: typicalSequence !== null };
}

function todo(overrides: Partial<UserTodoItem> = {}): UserTodoItem {
	return {
		id: '1',
		user: { id: '7', username: 'ada' },
		content: null,
		name: 'Read the paper',
		action: action('2', 'Consume', 2),
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

function form(overrides: Partial<TodoFormValues> = {}): TodoFormValues {
	return {
		contentId: null,
		name: '',
		actionId: 2,
		priority: null,
		status: 'NOT_STARTED',
		percentComplete: 0,
		startDate: '',
		endDate: '',
		dueDate: '',
		comments: '',
		privacy: 'PUBLIC',
		listId: null,
		...overrides,
	};
}

describe('sortTodoActions', () => {
	it('orders presets by typical sequence, then user actions by label', () => {
		const sorted = sortTodoActions([
			action('90', 'Zebra', null),
			action('3', 'Process', 3),
			action('91', 'Apple', null),
			action('1', 'Acquire', 1),
			action('2', 'Consume', 2),
		]);
		expect(sorted.map((a) => a.label)).toEqual(['Acquire', 'Consume', 'Process', 'Apple', 'Zebra']);
	});

	it('does not mutate its input', () => {
		const input = [action('2', 'Consume', 2), action('1', 'Acquire', 1)];
		sortTodoActions(input);
		expect(input[0].label).toBe('Consume');
	});
});

describe('actionMatchesQuery and actionAddText', () => {
	it('matches labels case-insensitively and matches everything for an empty query', () => {
		const consume = action('2', 'Consume', 2);
		expect(actionMatchesQuery(consume, 'CON')).toBe(true);
		expect(actionMatchesQuery(consume, 'share')).toBe(false);
		expect(actionMatchesQuery(consume, '   ')).toBe(true);
	});

	it('offers to add trimmed text that names no existing action', () => {
		const actions = [action('2', 'Consume', 2)];
		expect(actionAddText('  Skim  ', actions)).toBe('Skim');
		expect(actionAddText('consume', actions)).toBeNull();
		expect(actionAddText('   ', actions)).toBeNull();
	});
});

describe('completion prompts', () => {
	it('asks for 100% when status becomes DONE below 100', () => {
		expect(statusPrompt('DONE', 40)).toBe('MARK_100');
		expect(statusPrompt('DONE', 100)).toBeNull();
		expect(statusPrompt('IN_PROGRESS', 40)).toBeNull();
	});

	it('asks for DONE when percent becomes 100 and status is not DONE', () => {
		expect(percentPrompt(100, 'IN_PROGRESS')).toBe('MARK_DONE');
		expect(percentPrompt(100, 'DONE')).toBeNull();
		expect(percentPrompt(60, 'IN_PROGRESS')).toBeNull();
	});

	it('pairs MARK_100 with percent 100 and fills an empty end date with today', () => {
		expect(completionFollowUp('MARK_100', { endDate: null, today: '2026-10-10' })).toEqual({
			percentComplete: 100,
			endDate: '2026-10-10',
		});
		expect(completionFollowUp('MARK_100', { endDate: '2026-09-01', today: '2026-10-10' })).toEqual({
			percentComplete: 100,
			endDate: '2026-09-01',
		});
	});

	it('pairs MARK_DONE with status DONE and fills an empty end date with today', () => {
		expect(completionFollowUp('MARK_DONE', { endDate: null, today: '2026-10-10' })).toEqual({
			status: 'DONE',
			endDate: '2026-10-10',
		});
	});
});

describe('rowsForSelection', () => {
	const listed = todo({ id: '1', list: { id: '5', name: 'Reading' }, listPosition: 1 });
	const loose = todo({ id: '2', list: null });

	it('keeps every row for All and passes a list through', () => {
		expect(rowsForSelection([listed, loose], { kind: 'all' })).toHaveLength(2);
		expect(rowsForSelection([listed, loose], { kind: 'list', id: 5 })).toHaveLength(2);
	});

	it('keeps only unlisted rows for Unlisted', () => {
		expect(rowsForSelection([listed, loose], { kind: 'unlisted' }).map((r) => r.id)).toEqual(['2']);
	});
});

describe('addPerspectiveDisabledReason', () => {
	it('blocks name-only rows with the explanation', () => {
		expect(addPerspectiveDisabledReason(todo({ content: null }))).toBe('Link this to content first');
	});

	it('allows rows linked to content', () => {
		expect(addPerspectiveDisabledReason(todo({ content: { id: '9', name: 'Video' } }))).toBeNull();
	});
});

describe('clampPercent and normalizeComments', () => {
	it('clamps and rounds percent to 0-100', () => {
		expect(clampPercent(150)).toBe(100);
		expect(clampPercent(-3)).toBe(0);
		expect(clampPercent(42.6)).toBe(43);
		expect(clampPercent(Number.NaN)).toBe(0);
	});

	it('treats empty editor output as no comments', () => {
		expect(normalizeComments('<p></p>')).toBeNull();
		expect(normalizeComments('')).toBeNull();
		expect(normalizeComments('<p>Notes</p>')).toBe('<p>Notes</p>');
	});
});

describe('buildCreateInput', () => {
	it('sends only the fields that have a value', () => {
		expect(buildCreateInput(form({ name: '  Read the paper  ' }))).toEqual({
			actionId: 2,
			name: 'Read the paper',
			status: 'NOT_STARTED',
			percentComplete: 0,
			privacy: 'PUBLIC',
		});
	});

	it('sends the content id and no name when the todo is linked to content', () => {
		const input = buildCreateInput(form({ contentId: 9, name: 'ignored' }));
		expect(input.contentId).toBe(9);
		expect(input).not.toHaveProperty('name');
	});

	it('includes priority, dates, comments and list when set', () => {
		const input = buildCreateInput(
			form({
				name: 'x',
				priority: 9234,
				startDate: '2026-10-01',
				dueDate: '2026-10-20',
				comments: '<p>Hi</p>',
				listId: 5,
			}),
		);
		expect(input).toMatchObject({
			priority: 9234,
			startDate: '2026-10-01',
			dueDate: '2026-10-20',
			comments: '<p>Hi</p>',
			listId: 5,
		});
		expect(input).not.toHaveProperty('endDate');
	});

	it('refuses to build without an action', () => {
		expect(() => buildCreateInput(form({ actionId: null }))).toThrow('An action is required');
	});
});

describe('buildUpdateInput', () => {
	it('sends null to clear cleared fields and omits name when the todo has content', () => {
		const input = buildUpdateInput(
			5,
			form({ startDate: '', endDate: '', dueDate: '', name: 'ignored', listId: null, priority: null }),
			true,
		);
		expect(input).toEqual({
			id: 5,
			actionId: 2,
			priority: null,
			status: 'NOT_STARTED',
			percentComplete: 0,
			startDate: null,
			endDate: null,
			dueDate: null,
			comments: null,
			privacy: 'PUBLIC',
			listId: null,
		});
	});

	it('sends the trimmed name for a name-only todo', () => {
		expect(buildUpdateInput(5, form({ name: '  New name ' }), false).name).toBe('New name');
		expect(buildUpdateInput(5, form({ name: '   ' }), false).name).toBeNull();
	});
});

describe('todayIso', () => {
	it('formats the local calendar day as YYYY-MM-DD', () => {
		expect(todayIso(new Date(2026, 9, 10, 23, 30))).toBe('2026-10-10');
		expect(todayIso(new Date(2026, 0, 3, 0, 5))).toBe('2026-01-03');
	});
});
