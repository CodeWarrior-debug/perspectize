import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import ImportDescription from '$lib/components/imports/ImportDescription.svelte';
import type { ImportJobSummary } from '$lib/queries/imports';

const mocks = vi.hoisted(() => ({
	me: null as { id: string } | null,
	update: vi.fn(),
	toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('svelte-sonner', () => ({ toast: mocks.toast }));
vi.mock('$lib/components/CommentsEditor.svelte', async () => {
	const mod = await import('../helpers/FakeCommentsEditor.svelte');
	return { default: mod.default };
});
vi.mock('$lib/queries/users/useMe.svelte', () => ({
	useMe: () => ({
		get me() {
			return mocks.me;
		},
	}),
}));
vi.mock('$lib/queries/imports/useImportJobMutations', () => ({
	useUpdateImportJobDescription: () => ({ mutateAsync: mocks.update, isPending: false }),
}));

/** Ben (id 2) made the request. */
function job(overrides: Partial<ImportJobSummary> = {}): ImportJobSummary {
	return {
		id: '7',
		name: 'Peterson',
		requestStatus: 'APPROVED',
		requestedBy: { id: '2', username: 'ben' },
		reviewNote: null,
		reviewedAt: null,
		closedAt: null,
		description: null,
		createdAt: '2026-10-29T12:00:00Z',
		updatedAt: '2026-10-29T12:00:00Z',
		sources: [],
		...overrides,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.me = { id: '2' };
});

describe('ImportDescription: who sees what', () => {
	it('the requester reads the description and gets an Edit control', () => {
		render(ImportDescription, { props: { job: job({ description: '<p>Peterson channels</p>' }) } });
		expect(screen.getByText('Peterson channels')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Edit description' })).toBeInTheDocument();
	});

	it('an admin who did not make the request reads the text but gets no Edit control', () => {
		mocks.me = { id: '9' };
		render(ImportDescription, { props: { job: job({ description: '<p>Peterson channels</p>' }) } });
		expect(screen.getByText('Peterson channels')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Edit description' })).toBeNull();
	});

	it('a closed import hides Edit, even from the requester, and keeps the text', () => {
		render(ImportDescription, {
			props: { job: job({ description: '<p>Peterson channels</p>', closedAt: '2026-11-01T00:00:00Z' }) },
		});
		expect(screen.getByText('Peterson channels')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Edit description' })).toBeNull();
	});

	it('the requester with no description is offered Add a description', () => {
		render(ImportDescription, { props: { job: job({ description: null }) } });
		expect(screen.getByRole('button', { name: 'Add a description' })).toBeInTheDocument();
	});

	it('anyone else with no description sees nothing extra at all', () => {
		mocks.me = { id: '9' };
		const { container } = render(ImportDescription, { props: { job: job({ description: null }) } });
		expect(container.children).toHaveLength(0);
		expect(container.textContent?.trim()).toBe('');
	});

	it('a closed import with no description offers nothing, even to the requester', () => {
		const { container } = render(ImportDescription, {
			props: { job: job({ description: null, closedAt: '2026-11-01T00:00:00Z' }) },
		});
		expect(container.children).toHaveLength(0);
		expect(container.textContent?.trim()).toBe('');
	});

	it('<p></p> is no description: the requester is offered Add, and nobody sees an empty block', () => {
		render(ImportDescription, { props: { job: job({ description: '<p></p>' }) } });
		expect(screen.getByRole('button', { name: 'Add a description' })).toBeInTheDocument();
		expect(screen.queryByTestId('import-description-text')).toBeNull();
	});
});

describe('ImportDescription: rendering', () => {
	it('renders the description sanitized: no script and no event handler reach the page', () => {
		const pwned = vi.fn();
		(window as unknown as { __pwned: () => void }).__pwned = pwned;
		const html =
			'<p>Hi there</p><script>window.__pwned()</script><p onclick="window.__pwned()">Click me</p><img src="x" onerror="window.__pwned()">';
		const { container } = render(ImportDescription, { props: { job: job({ description: html }) } });
		expect(container.querySelector('script')).toBeNull();
		expect(container.querySelector('[onclick]')).toBeNull();
		expect(container.querySelector('[onerror]')).toBeNull();
		expect(screen.getByText('Hi there')).toBeInTheDocument();
		expect(screen.getByText('Click me')).toBeInTheDocument();
		fireEvent.click(screen.getByText('Click me'));
		expect(pwned).not.toHaveBeenCalled();
		delete (window as unknown as { __pwned?: () => void }).__pwned;
	});

	it('a long description collapses, and Show all expands it', async () => {
		render(ImportDescription, { props: { job: job({ description: `<p>${'a'.repeat(650)}</p>` }) } });
		const text = screen.getByTestId('import-description-text');
		expect(text.className).toContain('overflow-hidden');
		await fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
		expect(text.className).not.toContain('overflow-hidden');
		expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument();
	});

	it('a short description has no Show all control', () => {
		render(ImportDescription, { props: { job: job({ description: '<p>Short</p>' }) } });
		expect(screen.queryByRole('button', { name: 'Show all' })).toBeNull();
	});
});

describe('ImportDescription: editing', () => {
	it('Edit opens the editor with the current text, and Save is disabled once the text is blank', async () => {
		render(ImportDescription, { props: { job: job({ description: '<p>Peterson channels</p>' }) } });
		await fireEvent.click(screen.getByRole('button', { name: 'Edit description' }));
		const editor = screen.getByLabelText('Comment');
		expect(editor).toHaveValue('<p>Peterson channels</p>');
		const save = screen.getByRole('button', { name: 'Save description' });
		expect(save).toBeEnabled();
		await fireEvent.input(editor, { target: { value: '<p>&nbsp;</p>' } });
		expect(save).toBeDisabled();
		expect(mocks.update).not.toHaveBeenCalled();
	});

	it('Add a description saves the first text', async () => {
		mocks.update.mockResolvedValue({});
		render(ImportDescription, { props: { job: job({ description: null }) } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add a description' }));
		const save = screen.getByRole('button', { name: 'Save description' });
		expect(save).toBeDisabled();
		await fireEvent.input(screen.getByLabelText('Comment'), { target: { value: '<p>Lectures only</p>' } });
		await fireEvent.click(save);
		expect(mocks.update).toHaveBeenCalledWith({ jobId: '7', description: '<p>Lectures only</p>' });
	});

	it('Save sends the new text, shows a toast, and closes the editor', async () => {
		mocks.update.mockResolvedValue({});
		render(ImportDescription, { props: { job: job({ description: '<p>Old</p>' }) } });
		await fireEvent.click(screen.getByRole('button', { name: 'Edit description' }));
		await fireEvent.input(screen.getByLabelText('Comment'), { target: { value: '<p>New text</p>' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save description' }));
		expect(mocks.update).toHaveBeenCalledWith({ jobId: '7', description: '<p>New text</p>' });
		await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith('Description saved.'));
		expect(screen.queryByLabelText('Comment')).toBeNull();
	});

	it('a server refusal shows its message inline and keeps the editor open', async () => {
		mocks.update.mockRejectedValue({
			response: { errors: [{ message: 'access denied: only the requester can change this description' }] },
		});
		render(ImportDescription, { props: { job: job({ description: '<p>Old</p>' }) } });
		await fireEvent.click(screen.getByRole('button', { name: 'Edit description' }));
		await fireEvent.input(screen.getByLabelText('Comment'), { target: { value: '<p>New</p>' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save description' }));
		expect(await screen.findByRole('alert')).toHaveTextContent('Only the requester can change this description');
		expect(screen.getByLabelText('Comment')).toBeInTheDocument();
		expect(mocks.toast.success).not.toHaveBeenCalled();
	});
});
