import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PlanBoard from '$lib/components/plan/PlanBoard.svelte';
import type { UserTodoListItem, UserTodosArgs } from '$lib/queries/userTodos';

const mocks = vi.hoisted(() => ({
	/** The args getter PlanBoard handed to useUserTodos; re-read after each selection. */
	todosArgs: null as null | (() => UserTodosArgs),
	/** The props PlanTable handed to the grid (its callbacks are driven by the tests). */
	gridProps: null as null | { gridOptions: Record<string, (...a: unknown[]) => void> },
}));

vi.mock('ag-grid-svelte5', () => ({
	default: vi.fn((_anchor: unknown, props: typeof mocks.gridProps) => {
		mocks.gridProps = props;
	}),
}));

vi.mock('$lib/components/CommentsEditor.svelte', async () => {
	const mod = await import('../helpers/FakeCommentsEditor.svelte');
	return { default: mod.default };
});

vi.mock('svelte-sonner', () => ({
	toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

vi.mock('$lib/queries/userTodos/useUserTodos', () => ({
	useUserTodos: vi.fn((args: () => UserTodosArgs) => {
		mocks.todosArgs = args;
		return {
			data: { userTodos: { items: [], pageInfo: { hasNextPage: false }, totalCount: 0 } },
			isPending: false,
			isError: false,
		};
	}),
}));

const LISTS: UserTodoListItem[] = [
	{
		id: '3',
		user: { id: '7', username: 'ada' },
		name: 'Reading',
		description: null,
		privacy: 'PUBLIC',
		createdAt: '2026-10-01T00:00:00Z',
		updatedAt: '2026-10-01T00:00:00Z',
	},
];

vi.mock('$lib/queries/userTodos/useUserTodoLists', () => ({
	useUserTodoLists: vi.fn(() => ({ data: { userTodoLists: LISTS }, isPending: false })),
}));

vi.mock('$lib/queries/userTodos/useReorderUserTodoList', () => ({
	useReorderUserTodoList: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('$lib/queries/perspectives/useMyPerspectives', () => ({
	useMyPerspectives: vi.fn(() => ({ data: undefined })),
}));

vi.mock('$lib/queries/userTodos/useCreateUserTodoList', () => ({
	useCreateUserTodoList: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock('$lib/queries/userTodos/useUpdateUserTodoList', () => ({
	useUpdateUserTodoList: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock('$lib/queries/userTodos/useDeleteUserTodoList', () => ({
	useDeleteUserTodoList: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock('$lib/queries/userTodos/useCreateUserTodo', () => ({
	useCreateUserTodo: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock('$lib/queries/userTodos/useUpdateUserTodo', () => ({
	useUpdateUserTodo: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock('$lib/queries/userTodos/useTodoActions', () => ({
	useTodoActions: vi.fn(() => ({ data: { todoActions: [] }, isPending: false })),
}));

vi.mock('$lib/queries/userTodos/useCreateTodoAction', () => ({
	useCreateTodoAction: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock('$lib/queries/content/useContentPicker', () => ({
	useContentPicker: vi.fn(() => ({ data: { content: { items: [] } }, isPending: false })),
}));

const USER_ID = 7;

/** The variables PlanBoard would send right now, for the current selection. */
function currentArgs(): UserTodosArgs {
	if (!mocks.todosArgs) throw new Error('useUserTodos was not called');
	return mocks.todosArgs();
}

function choose(value: string) {
	fireEvent.change(screen.getByLabelText('Show'), { target: { value } });
}

describe('PlanBoard: the Unlisted and single-list views are filtered by the server', () => {
	beforeEach(() => {
		mocks.todosArgs = null;
		render(PlanBoard, { props: { userId: USER_ID } });
	});

	it('starts with every todo of the signed-in user, in no list order', () => {
		expect(currentArgs().filter).toEqual({ userId: USER_ID });
		expect(currentArgs().sortBy).toBe('CREATED_AT');
	});

	it('Unlisted sends unlisted: true for the owner, not a client-side filter', () => {
		choose('unlisted');

		expect(currentArgs().filter).toEqual({ userId: USER_ID, unlisted: true });
		expect(currentArgs().filter).not.toHaveProperty('listId');
	});

	it('one list sends that listId and orders by list position', () => {
		choose('list:3');

		expect(currentArgs().filter).toEqual({ userId: USER_ID, listId: 3 });
		expect(currentArgs().filter).not.toHaveProperty('unlisted');
		expect(currentArgs().sortBy).toBe('LIST_POSITION');
		expect(currentArgs().sortOrder).toBe('ASC');
	});

	describe('a header sort', () => {
		function sortBy(colId: string, sort: 'asc' | 'desc') {
			mocks.gridProps?.gridOptions.onSortChanged({
				api: { getColumnState: () => [{ colId, sort, sortIndex: 0 }] },
			});
		}

		it('is sent to the server', () => {
			sortBy('priority', 'desc');
			expect(currentArgs().sortBy).toBe('PRIORITY');
			expect(currentArgs().sortOrder).toBe('DESC');
		});

		it('survives moving between All and Unlisted, which share one grid', () => {
			sortBy('priority', 'desc');
			choose('unlisted');
			expect(currentArgs().sortBy).toBe('PRIORITY');
		});

		it('is dropped when the grid is rebuilt for a list, so the next All view matches its blank header', () => {
			sortBy('priority', 'desc');
			choose('list:3');
			expect(currentArgs().sortBy).toBe('LIST_POSITION');

			choose('all');
			expect(currentArgs().sortBy).toBe('CREATED_AT');
		});
	});

	it('switching back to All drops both filters', () => {
		choose('list:3');
		choose('unlisted');
		choose('all');

		expect(currentArgs().filter).toEqual({ userId: USER_ID });
	});
});

describe('PlanBoard: Add Todo', () => {
	it('opens the Add Todo dialog with the item picker', async () => {
		mocks.todosArgs = null;
		render(PlanBoard, { props: { userId: USER_ID } });

		fireEvent.click(screen.getByRole('button', { name: 'Add Todo' }));

		expect(await screen.findByRole('heading', { name: 'Add Todo' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Not in Perspectize' })).toBeInTheDocument();
	});
});
