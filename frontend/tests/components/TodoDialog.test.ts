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

vi.mock('$lib/components/CommentsEditor.svelte', async () => {
	const mod = await import('../helpers/FakeCommentsEditor.svelte');
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

vi.mock('$lib/queries/content/useContentPicker', () => ({
	useContentPicker: vi.fn(() => ({
		data: {
			content: {
				items: [{ id: '9', name: 'A great video', contentType: 'YOUTUBE_VIDEO', channelTitle: null }],
			},
		},
		isPending: false,
	})),
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

	describe('default action (Add to plan)', () => {
		it('preselects the default action and shows its label, with no pick needed', async () => {
			render(TodoDialog, {
				props: { open: true, lists: LISTS, newContent: { id: 9, name: 'A great video' }, defaultActionId: 2 },
			});
			expect(field('#todo-action')).toHaveValue('Consume');

			submit();
			await waitFor(() => expect(mocks.createMutateAsync).toHaveBeenCalledTimes(1));
			expect(mocks.createMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ contentId: 9, actionId: 2 }));
		});

		it('lets a pick override the default action', async () => {
			render(TodoDialog, {
				props: { open: true, lists: LISTS, newContent: { id: 9, name: 'A great video' }, defaultActionId: 2 },
			});
			await pickAction('Acquire');
			submit();
			await waitFor(() => expect(mocks.createMutateAsync).toHaveBeenCalledTimes(1));
			expect(mocks.createMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ actionId: 1 }));
		});

		it('still asks for an action when no default has arrived yet', async () => {
			render(TodoDialog, {
				props: { open: true, lists: LISTS, newContent: { id: 9, name: 'A great video' }, defaultActionId: null },
			});
			submit();
			expect(await screen.findByRole('alert')).toHaveTextContent('Choose an action.');
			expect(mocks.createMutateAsync).not.toHaveBeenCalled();
		});
	});

	describe('title', () => {
		it('says Add Todo when creating and Edit Todo when editing', () => {
			const { unmount } = render(TodoDialog, { props: { open: true, lists: LISTS } });
			expect(screen.getByRole('heading', { name: 'Add Todo' })).toBeInTheDocument();
			unmount();

			render(TodoDialog, { props: { open: true, lists: LISTS, todo: todo() } });
			expect(screen.getByRole('heading', { name: 'Edit Todo' })).toBeInTheDocument();
		});
	});

	describe('password managers', () => {
		it('labels the todo title "Title", never "Name" (LastPass treats a Name label as an identity form and ignores data-lpignore)', () => {
			render(TodoDialog, { props: { open: true, lists: LISTS } });
			expect(screen.getByLabelText('Title')).toBe(field('#todo-name'));
			expect(screen.queryByLabelText('Name')).toBeNull();
		});

		it('are asked not to offer to fill the todo Name (a title, not a person), even while it is locked', () => {
			render(TodoDialog, { props: { open: true, lists: LISTS } });
			const name = field('#todo-name');
			expect(name).toBeDisabled();
			expect(name).toHaveAttribute('data-lpignore', 'true');
			expect(name).toHaveAttribute('data-1p-ignore', 'true');
			expect(name).toHaveAttribute('data-bwignore', 'true');
		});
	});

	describe('layout', () => {
		it('pins Save and Cancel outside the scrolling body, so they show in the first view on a small phone', () => {
			render(TodoDialog, { props: { open: true, lists: LISTS } });
			const body = screen.getByTestId('todo-form-body');
			const footer = screen.getByTestId('todo-form-footer');

			expect(body.className).toContain('overflow-y-auto');
			expect(footer).toContainElement(screen.getByRole('button', { name: 'Save' }));
			expect(footer).toContainElement(screen.getByRole('button', { name: 'Cancel' }));
			expect(body).not.toContainElement(screen.getByRole('button', { name: 'Save' }));
		});

		it('keeps a validation error in the pinned footer, not scrolled out of sight', async () => {
			render(TodoDialog, { props: { open: true, lists: LISTS } });
			submit();
			expect(screen.getByTestId('todo-form-footer')).toContainElement(await screen.findByRole('alert'));
		});
	});

	describe('item picker (create mode, no content given)', () => {
		it('puts the item picker and action before the name, and greys the name out', () => {
			render(TodoDialog, { props: { open: true, lists: LISTS } });
			const picker = screen.getByRole('button', { name: 'Not in Perspectize' });
			const action = field('#todo-action');
			const name = field('#todo-name');

			expect(picker.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
			expect(action.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
			expect(name).toBeDisabled();
			expect(document.querySelector('[data-testid="todo-content-name"]')).toBeNull();
		});

		it('creates a todo for the picked item, showing its title in the greyed name', async () => {
			render(TodoDialog, { props: { open: true, lists: LISTS } });
			fireEvent.click(screen.getByRole('option', { name: /A great video/ }));

			expect(await screen.findByTestId('todo-item-picked')).toHaveTextContent('A great video');
			expect(field('#todo-name')).toBeDisabled();
			expect(field('#todo-name')).toHaveValue('A great video');

			await pickAction('Consume');
			submit();

			await waitFor(() => expect(mocks.createMutateAsync).toHaveBeenCalledTimes(1));
			const input = mocks.createMutateAsync.mock.calls[0][0];
			expect(input).toMatchObject({ contentId: 9, actionId: 2 });
			expect(input).not.toHaveProperty('name');
		});

		it('Change drops the picked item and returns to the search, with an empty name', async () => {
			render(TodoDialog, { props: { open: true, lists: LISTS } });
			fireEvent.click(screen.getByRole('option', { name: /A great video/ }));
			fireEvent.click(await screen.findByRole('button', { name: 'Change' }));

			expect(await screen.findByRole('option', { name: /A great video/ })).toBeInTheDocument();
			expect(screen.queryByTestId('todo-item-picked')).toBeNull();
			expect(field('#todo-name')).toHaveValue('');
			expect(field('#todo-name')).toBeDisabled();
		});

		it('Not in Perspectize unlocks the name, and the todo is created with that name only', async () => {
			render(TodoDialog, { props: { open: true, lists: LISTS } });
			fireEvent.click(screen.getByRole('button', { name: 'Not in Perspectize' }));

			await waitFor(() => expect(field('#todo-name')).toBeEnabled());
			expect(screen.queryAllByRole('option', { name: /A great video/ })).toHaveLength(0);

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

		it('Search instead goes back to the picker and locks the name again', async () => {
			render(TodoDialog, { props: { open: true, lists: LISTS } });
			fireEvent.click(screen.getByRole('button', { name: 'Not in Perspectize' }));
			fireEvent.click(await screen.findByRole('button', { name: 'Search instead' }));

			expect(await screen.findByRole('option', { name: /A great video/ })).toBeInTheDocument();
			expect(field('#todo-name')).toBeDisabled();
		});

		it('blocks saving when no item is picked and the name was never unlocked', async () => {
			render(TodoDialog, { props: { open: true, lists: LISTS } });
			await pickAction('Consume');
			submit();
			expect(await screen.findByRole('alert')).toHaveTextContent(
				'Pick an item, or choose Not in Perspectize and name it.',
			);
			expect(mocks.createMutateAsync).not.toHaveBeenCalled();
		});

		it('blocks saving a free-text todo whose name is blank', async () => {
			render(TodoDialog, { props: { open: true, lists: LISTS } });
			fireEvent.click(screen.getByRole('button', { name: 'Not in Perspectize' }));
			await pickAction('Consume');
			submit();
			expect(await screen.findByRole('alert')).toHaveTextContent(
				'Pick an item, or choose Not in Perspectize and name it.',
			);
			expect(mocks.createMutateAsync).not.toHaveBeenCalled();
		});

		it('does not show the picker when content was handed in (Add to plan)', () => {
			render(TodoDialog, {
				props: { open: true, lists: LISTS, newContent: { id: 9, name: 'A great video' }, defaultActionId: 2 },
			});
			expect(screen.queryByRole('button', { name: 'Not in Perspectize' })).toBeNull();
			expect(field('[data-testid="todo-content-name"]')).toHaveTextContent('A great video');
			expect(document.querySelector('#todo-name')).toBeNull();
		});

		it('edits a name-only todo with an editable name and no picker', () => {
			render(TodoDialog, { props: { open: true, lists: LISTS, todo: todo() } });
			expect(field('#todo-name')).toBeEnabled();
			expect(field('#todo-name')).toHaveValue('Read the paper');
			expect(screen.queryByRole('button', { name: 'Not in Perspectize' })).toBeNull();
		});
	});

	describe('comments', () => {
		it('keeps the editor collapsed behind Add comments on a new todo', () => {
			render(TodoDialog, { props: { open: true, lists: LISTS } });
			expect(screen.getByRole('button', { name: 'Add comments' })).toBeInTheDocument();
			expect(screen.queryByLabelText('Comment')).toBeNull();
		});

		it('opens a basic-toolbar editor when Add comments is clicked, and sends what was typed', async () => {
			render(TodoDialog, { props: { open: true, lists: LISTS } });
			fireEvent.click(screen.getByRole('button', { name: 'Add comments' }));

			const editor = await screen.findByLabelText('Comment');
			expect(editor).toHaveAttribute('data-toolbar', 'basic');
			expect(screen.queryByRole('button', { name: 'Add comments' })).toBeNull();

			fireEvent.click(screen.getByRole('button', { name: 'Not in Perspectize' }));
			await pickAction('Consume');
			fireEvent.input(field('#todo-name'), { target: { value: 'Read the paper' } });
			fireEvent.input(editor, { target: { value: '<p>start with chapter 2</p>' } });
			submit();

			await waitFor(() => expect(mocks.createMutateAsync).toHaveBeenCalledTimes(1));
			expect(mocks.createMutateAsync).toHaveBeenCalledWith(
				expect.objectContaining({ comments: '<p>start with chapter 2</p>' }),
			);
		});

		it('shows the editor already open when the todo being edited has comments', () => {
			render(TodoDialog, { props: { open: true, lists: LISTS, todo: todo({ comments: '<p>chapter 2</p>' }) } });
			expect(screen.getByLabelText('Comment')).toHaveValue('<p>chapter 2</p>');
			expect(screen.queryByRole('button', { name: 'Add comments' })).toBeNull();
		});

		it('keeps it collapsed when editing a todo that has none', () => {
			render(TodoDialog, { props: { open: true, lists: LISTS, todo: todo({ comments: null }) } });
			expect(screen.getByRole('button', { name: 'Add comments' })).toBeInTheDocument();
		});
	});

	describe('content modes', () => {
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
