import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import AddToPlanDialog from '#lib/components/plan/AddToPlanDialog.svelte';
import type { TodoActionItem, UserTodoListItem } from '#lib/queries/userTodos/index.js';
import { preloadLazy } from '../helpers/warmUp';

const mocks = vi.hoisted(() => ({
	createMutateAsync: vi.fn(),
	listsUserId: vi.fn<() => number | null>(() => null),
	onClose: vi.fn(),
}));

vi.mock('#lib/components/CommentsEditor.svelte', async () => {
	const mod = await import('../helpers/FakeCommentsEditor.svelte');
	return { default: mod.default };
});

const ACTIONS: TodoActionItem[] = [
	{ id: '1', key: 'acquire', label: 'Acquire', description: '', typicalSequence: 1, isPreset: true },
	{ id: '2', key: 'consume', label: 'Consume', description: '', typicalSequence: 2, isPreset: true },
];

vi.mock('#lib/queries/userTodos/useTodoActions.js', () => ({
	useTodoActions: vi.fn(() => ({ data: { todoActions: ACTIONS }, isPending: false })),
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

vi.mock('#lib/queries/userTodos/useUserTodoLists.js', () => ({
	useUserTodoLists: vi.fn((userId: () => number | null) => {
		mocks.listsUserId.mockImplementation(userId);
		return { data: { userTodoLists: LISTS }, isPending: false };
	}),
}));

vi.mock('#lib/queries/userTodos/useCreateUserTodo.js', () => ({
	useCreateUserTodo: vi.fn(() => ({ mutateAsync: mocks.createMutateAsync, isPending: false })),
}));

vi.mock('#lib/queries/userTodos/useUpdateUserTodo.js', () => ({
	useUpdateUserTodo: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock('#lib/queries/userTodos/useCreateTodoAction.js', () => ({
	useCreateTodoAction: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock('svelte-sonner', () => ({
	toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

const CONTENT = { id: 9, name: 'A great video' };

function renderDialog() {
	return render(AddToPlanDialog, { props: { content: CONTENT, userId: 7, onClose: mocks.onClose } });
}

function submit() {
	fireEvent.submit(document.querySelector('form') as HTMLFormElement);
}

// The component renders this through {#await import(...)}: load it up front so a
// findBy* waits on the UI, not on Vite's first transform of the module (#728).
preloadLazy(() => import('#lib/components/plan/TodoDialog.svelte'));

describe('AddToPlanDialog', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.createMutateAsync.mockReset().mockResolvedValue({ id: '11' });
	});

	it('opens the todo dialog in create mode with the content and the consume action', async () => {
		renderDialog();

		expect(await screen.findByRole('heading', { name: 'Add Todo' })).toBeInTheDocument();
		expect(await screen.findByTestId('todo-content-name')).toHaveTextContent('A great video');
		expect(document.querySelector('#todo-action')).toHaveValue('Consume');
	});

	it('creates the todo for that content with the consume action', async () => {
		renderDialog();
		await screen.findByTestId('todo-content-name');

		submit();

		await waitFor(() => expect(mocks.createMutateAsync).toHaveBeenCalledTimes(1));
		expect(mocks.createMutateAsync).toHaveBeenCalledWith(
			expect.objectContaining({ contentId: 9, actionId: 2, status: 'NOT_STARTED' }),
		);
		await waitFor(() => expect(mocks.onClose).toHaveBeenCalled());
	});

	it('offers the user lists, for the signed-in user', async () => {
		renderDialog();
		await screen.findByTestId('todo-content-name');

		expect(mocks.listsUserId()).toBe(7);
		expect(screen.getByRole('option', { name: 'Reading' })).toBeInTheDocument();
	});

	it('closes without saving when cancelled', async () => {
		renderDialog();
		await screen.findByTestId('todo-content-name');

		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		await waitFor(() => expect(mocks.onClose).toHaveBeenCalledTimes(1));
		expect(mocks.createMutateAsync).not.toHaveBeenCalled();
	});
});
