import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import TodoDialog from '$lib/components/plan/TodoDialog.svelte';
import { todayIso } from '$lib/utils/plan-todo-helpers';
import type { TodoActionItem, UserTodoItem, UserTodoListItem } from '$lib/queries/userTodos';

const mocks = vi.hoisted(() => ({
	createMutateAsync: vi.fn(),
	updateMutateAsync: vi.fn(),
	toastWithAction: vi.fn(),
	toastError: vi.fn(),
}));

vi.mock('$lib/components/PerspectiveEditor.svelte', async () => {
	const mod = await import('../helpers/FakePerspectiveEditor.svelte');
	return { default: mod.default };
});

vi.mock('$lib/queries/userTodos/useCreateUserTodo', () => ({
	useCreateUserTodo: vi.fn(() => ({ mutateAsync: mocks.createMutateAsync, isPending: false })),
}));

vi.mock('$lib/queries/userTodos/useUpdateUserTodo', () => ({
	useUpdateUserTodo: vi.fn(() => ({ mutateAsync: mocks.updateMutateAsync, isPending: false })),
}));

vi.mock('$lib/queries/userTodos/useTodoActions', () => ({
	useTodoActions: vi.fn(() => ({
		data: {
			todoActions: [
				{ id: '1', key: 'acquire', label: 'Acquire', description: '', typicalSequence: 1, isPreset: true },
				{ id: '2', key: 'consume', label: 'Consume', description: '', typicalSequence: 2, isPreset: true },
			] satisfies TodoActionItem[],
		},
		isPending: false,
	})),
}));

vi.mock('$lib/queries/userTodos/useCreateTodoAction', () => ({
	useCreateTodoAction: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock('$lib/utils/toast', () => ({
	toastWithAction: mocks.toastWithAction,
}));

vi.mock('svelte-sonner', () => ({
	toast: { error: mocks.toastError, success: vi.fn(), info: vi.fn() },
}));

function todo(overrides: Partial<UserTodoItem> = {}): UserTodoItem {
	return {
		id: '5',
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

/** The dialog renders in a portal, so query the document rather than the render container. */
function field(selector: string): HTMLElement {
	const el = document.querySelector<HTMLElement>(selector);
	if (!el) throw new Error(`no element for ${selector}`);
	return el;
}

async function pickAction(label: string) {
	const input = field('#todo-action');
	fireEvent.focus(input);
	fireEvent.click(await screen.findByRole('option', { name: label }));
}

function submit() {
	fireEvent.submit(document.querySelector('form') as HTMLFormElement);
}

/** The follow-up message and its Yes handler from the most recent prompt. */
function lastPrompt() {
	const call = mocks.toastWithAction.mock.calls.at(-1);
	if (!call) throw new Error('no prompt raised');
	return { message: call[0] as string, action: call[1] as { label: string; onClick: () => void } };
}

describe('TodoDialog', () => {
	beforeEach(() => {
		mocks.createMutateAsync.mockReset().mockResolvedValue({ id: '11' });
		mocks.updateMutateAsync.mockReset().mockResolvedValue({ id: '5' });
		mocks.toastWithAction.mockReset();
		mocks.toastError.mockReset();
	});

	describe('name-only and content modes', () => {
		it('asks for a name when the todo has no content, and creates it with that name', async () => {
			render(TodoDialog, { props: { open: true, lists: LISTS } });
			expect(field('#todo-name')).toBeInTheDocument();
			expect(document.querySelector('[data-testid="todo-content-name"]')).toBeNull();

			await pickAction('Consume');
			fireEvent.input(field('#todo-name'), { target: { value: '  Read the paper ' } });
			submit();

			await waitFor(() => expect(mocks.createMutateAsync).toHaveBeenCalledTimes(1));
			expect(mocks.createMutateAsync).toHaveBeenCalledWith({
				actionId: 2,
				name: 'Read the paper',
				status: 'NOT_STARTED',
				percentComplete: 0,
				privacy: 'PUBLIC',
			});
			expect(mocks.updateMutateAsync).not.toHaveBeenCalled();
		});

		it('blocks saving a new todo that has neither content nor a name', async () => {
			render(TodoDialog, { props: { open: true, lists: LISTS } });
			await pickAction('Consume');
			submit();
			expect(await screen.findByRole('alert')).toHaveTextContent('Name the todo, or link it to content.');
			expect(mocks.createMutateAsync).not.toHaveBeenCalled();
		});

		it('shows the content read-only, with no name field, when the todo has content', () => {
			render(TodoDialog, {
				props: {
					open: true,
					lists: LISTS,
					todo: todo({ content: { id: '9', name: 'A great video' }, name: null }),
				},
			});
			expect(field('[data-testid="todo-content-name"]')).toHaveTextContent('A great video');
			expect(document.querySelector('#todo-name')).toBeNull();
		});

		it('saves an edit with every editable field, sending null for cleared ones', async () => {
			render(TodoDialog, {
				props: {
					open: true,
					lists: LISTS,
					todo: todo({
						content: { id: '9', name: 'A great video' },
						name: null,
						priority: 5000,
						list: { id: '3', name: 'Reading' },
						listPosition: 1,
					}),
				},
			});
			fireEvent.change(field('#todo-list'), { target: { value: '' } });
			submit();

			await waitFor(() => expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(1));
			expect(mocks.updateMutateAsync).toHaveBeenCalledWith({
				id: 5,
				actionId: 2,
				priority: 5000,
				status: 'NOT_STARTED',
				percentComplete: 0,
				startDate: null,
				endDate: null,
				dueDate: null,
				comments: null,
				privacy: 'PUBLIC',
				listId: null,
			});
			expect(mocks.updateMutateAsync.mock.calls[0][0]).not.toHaveProperty('name');
			expect(mocks.createMutateAsync).not.toHaveBeenCalled();
		});
	});

	describe('Done <-> 100% prompts', () => {
		it('asks to mark 100% when status is set to Done below 100, and sends nothing without Yes', () => {
			render(TodoDialog, {
				props: {
					open: true,
					lists: LISTS,
					todo: todo({ content: { id: '9', name: 'Video' }, name: null, percentComplete: 40, status: 'IN_PROGRESS' }),
				},
			});
			fireEvent.change(field('#todo-status'), { target: { value: 'DONE' } });

			expect(mocks.toastWithAction).toHaveBeenCalledTimes(1);
			expect(lastPrompt().message).toBe('Mark 100% complete too?');
			expect(lastPrompt().action.label).toBe('Yes');
			expect(mocks.updateMutateAsync).not.toHaveBeenCalled();
		});

		it('sets percent to 100 and the end date (when empty) only after Yes', async () => {
			render(TodoDialog, {
				props: {
					open: true,
					lists: LISTS,
					todo: todo({ content: { id: '9', name: 'Video' }, name: null, percentComplete: 40, status: 'IN_PROGRESS' }),
				},
			});
			fireEvent.change(field('#todo-status'), { target: { value: 'DONE' } });
			lastPrompt().action.onClick();

			expect(mocks.updateMutateAsync).toHaveBeenCalledWith({
				id: 5,
				percentComplete: 100,
				endDate: todayIso(),
			});
			await waitFor(() => expect((field('#todo-percent') as HTMLInputElement).value).toBe('100'));
		});

		it('asks to mark Done when percent is set to 100 and status is not Done', () => {
			render(TodoDialog, {
				props: {
					open: true,
					lists: LISTS,
					todo: todo({ content: { id: '9', name: 'Video' }, name: null, percentComplete: 40, status: 'IN_PROGRESS' }),
				},
			});
			fireEvent.change(field('#todo-percent'), { target: { value: '100' } });

			expect(lastPrompt().message).toBe('Mark as done too?');
			expect(mocks.updateMutateAsync).not.toHaveBeenCalled();
		});

		it('Yes on the Done prompt sends status DONE with the end date', () => {
			render(TodoDialog, {
				props: {
					open: true,
					lists: LISTS,
					todo: todo({ content: { id: '9', name: 'Video' }, name: null, percentComplete: 100, status: 'IN_PROGRESS' }),
				},
			});
			fireEvent.change(field('#todo-percent'), { target: { value: '100' } });
			lastPrompt().action.onClick();

			expect(mocks.updateMutateAsync).toHaveBeenCalledWith({ id: 5, status: 'DONE', endDate: todayIso() });
		});

		it('raises no prompt when the other field already agrees', () => {
			render(TodoDialog, {
				props: {
					open: true,
					lists: LISTS,
					todo: todo({ content: { id: '9', name: 'Video' }, name: null, percentComplete: 100, status: 'IN_PROGRESS' }),
				},
			});
			fireEvent.change(field('#todo-status'), { target: { value: 'DONE' } });
			expect(mocks.toastWithAction).not.toHaveBeenCalled();
		});

		it('in create mode, Yes only changes the form, so nothing is sent until Save', async () => {
			render(TodoDialog, { props: { open: true, lists: LISTS } });
			fireEvent.change(field('#todo-status'), { target: { value: 'DONE' } });
			lastPrompt().action.onClick();

			await waitFor(() => expect((field('#todo-percent') as HTMLInputElement).value).toBe('100'));
			expect(mocks.updateMutateAsync).not.toHaveBeenCalled();
			expect(mocks.createMutateAsync).not.toHaveBeenCalled();
		});
	});
});
