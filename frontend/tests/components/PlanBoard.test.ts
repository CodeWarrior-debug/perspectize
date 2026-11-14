import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import PlanBoard from '$lib/components/plan/PlanBoard.svelte';
import type { UserTodoItem, UserTodoListItem, UserTodosArgs } from '$lib/queries/userTodos';

const mocks = vi.hoisted(() => ({
	/** The args getter PlanBoard handed to useUserTodos; re-read after each selection. */
	todosArgs: null as null | (() => UserTodosArgs),
	/** The props PlanTable handed to the grid (its callbacks are driven by the tests). */
	gridProps: null as null | { gridOptions: Record<string, (...a: unknown[]) => void> },
	/** The content id PlanBoard asked useContentDetails for. */
	detailsId: null as null | (() => string | null),
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

vi.mock('$lib/queries/content/useContentDetails', () => ({
	useContentDetails: vi.fn((id: () => string | null) => {
		mocks.detailsId = id;
		return {
			get data() {
				const current = id();
				return current
					? {
							contentByID: {
								id: current,
								name: 'A great video',
								url: null,
								channelTitle: null,
								contentType: 'YOUTUBE_VIDEO',
								viewCount: null,
								likeCount: null,
								length: null,
								lengthUnits: null,
								publishedAt: null,
								updatedAt: '2026-10-01T00:00:00Z',
								description: null,
								tags: null,
							},
						}
					: undefined;
			},
			isPending: false,
		};
	}),
}));

// The details modal's own hooks (it loads lazily from "View content").
vi.mock('$lib/auth/useAuthState', () => ({
	useAuthState: () => ({ isLoaded: true, userId: null }),
}));
vi.mock('$lib/queries/content/useContentAggregates', () => ({
	useContentAggregates: vi.fn(() => ({ data: undefined, isLoading: false })),
}));
vi.mock('$lib/queries/content/useUpdateSourceData', () => ({
	useUpdateSourceData: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));
vi.mock('$lib/queries/bible/useSetPassageDisplayTitle', () => ({
	useSetPassageDisplayTitle: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
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

	it('opens on "All My Todos", the picker default', () => {
		const picker = screen.getByLabelText('Show') as HTMLSelectElement;
		expect(picker.selectedOptions[0]).toHaveTextContent('All My Todos');
		expect(picker.value).toBe('all');
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

function todoRow(overrides: Partial<UserTodoItem> = {}): UserTodoItem {
	return {
		id: '5',
		user: { id: String(USER_ID), username: 'ada' },
		content: { id: '9', name: 'A great video' },
		name: null,
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

/** A grid cell click, as AG Grid reports it to PlanTable. */
function clickCell(colId: string, todo: UserTodoItem) {
	if (!mocks.gridProps) throw new Error('grid not mounted');
	mocks.gridProps.gridOptions.onCellClicked({ data: todo, colDef: { colId } });
}

describe("PlanBoard: a cell click opens Edit Todo on that cell's field", () => {
	it('a Status cell focuses Status', async () => {
		render(PlanBoard, { props: { userId: USER_ID } });
		clickCell('status', todoRow());

		expect(await screen.findByRole('heading', { name: 'Edit Todo' })).toBeInTheDocument();
		await waitFor(() => expect(document.activeElement).toBe(document.querySelector('#todo-status')));
	});

	it('a Due cell focuses Due', async () => {
		render(PlanBoard, { props: { userId: USER_ID } });
		clickCell('dueDate', todoRow());

		await waitFor(() => expect(document.activeElement).toBe(document.querySelector('#todo-due')));
	});
});

describe('PlanBoard: View content', () => {
	it('closes Edit Todo and opens the content details on the same page', async () => {
		render(PlanBoard, { props: { userId: USER_ID } });
		clickCell('action', todoRow());
		fireEvent.click(await screen.findByRole('button', { name: 'View content' }));

		await waitFor(() => expect(screen.queryByRole('heading', { name: 'Edit Todo' })).not.toBeInTheDocument());
		expect(mocks.detailsId?.()).toBe('9');
		expect(await screen.findByText('A great video')).toBeInTheDocument();
	});
});
