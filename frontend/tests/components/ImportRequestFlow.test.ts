import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ImportRequestForm from '$lib/components/imports/ImportRequestForm.svelte';
import ImportJobActions from '$lib/components/imports/ImportJobActions.svelte';
import ImportProgressBar from '$lib/components/imports/ImportProgressBar.svelte';
import type { ImportJobSummary, ImportProgress } from '$lib/queries/imports';

const mocks = vi.hoisted(() => ({
	create: vi.fn(),
	review: vi.fn(),
	close: vi.fn(),
	progress: null as ImportProgress | null,
	toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('svelte-sonner', () => ({ toast: mocks.toast }));
vi.mock('$lib/queries/imports/useImportJobMutations', () => ({
	useCreateImportJob: () => ({ mutateAsync: mocks.create, isPending: false }),
	useReviewImportJob: () => ({ mutateAsync: mocks.review, isPending: false }),
	useCloseImportJob: () => ({ mutateAsync: mocks.close, isPending: false }),
}));
vi.mock('$lib/queries/imports/useImportProgress.svelte', () => ({
	useImportProgress: () => ({
		get current() {
			return mocks.progress;
		},
	}),
}));

function job(overrides: Partial<ImportJobSummary> = {}): ImportJobSummary {
	return {
		id: '7',
		name: 'Gaither',
		requestStatus: 'REQUESTED',
		requestedBy: { id: '2', username: 'ben' },
		reviewNote: null,
		reviewedAt: null,
		closedAt: null,
		createdAt: '2026-10-29T12:00:00Z',
		updatedAt: '2026-10-29T12:00:00Z',
		sources: [],
		...overrides,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.progress = null;
});

describe('ImportRequestForm', () => {
	it('sends each source, with "Both" credits as no role, and says a request waits for an admin', async () => {
		mocks.create.mockResolvedValue({ createImportJob: job() });
		const onCreated = vi.fn();
		render(ImportRequestForm, { props: { isAdmin: false, onCreated } });
		expect(screen.getByText(/An admin reviews each request/)).toBeInTheDocument();

		await fireEvent.input(screen.getByLabelText('Name'), { target: { value: ' Gaither ' } });
		await fireEvent.input(screen.getByLabelText('Source 1'), { target: { value: '@GaitherMusic' } });
		await fireEvent.click(screen.getByRole('button', { name: /Add a source/ }));
		await fireEvent.change(screen.getByLabelText('Source 2 type'), { target: { value: 'TMDB_PERSON' } });
		await fireEvent.input(screen.getByLabelText('Source 2'), { target: { value: 'Bill Gaither' } });
		await fireEvent.change(screen.getByLabelText('Source 2 credits'), { target: { value: 'BOTH' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Send request' }));

		expect(mocks.create).toHaveBeenCalledWith({
			name: 'Gaither',
			sources: [
				{ sourceType: 'YOUTUBE_CHANNEL', ref: '@GaitherMusic', role: null },
				{ sourceType: 'TMDB_PERSON', ref: 'Bill Gaither', role: null },
			],
		});
		await vi.waitFor(() => expect(onCreated).toHaveBeenCalled());
		expect(mocks.toast.success.mock.calls[0][0]).toContain('waits for an admin');
	});

	it("shows the server's reason inline when a request is refused", async () => {
		mocks.create.mockRejectedValue({
			response: { errors: [{ message: 'invalid input: you already have 3 requests waiting for an admin' }] },
		});
		render(ImportRequestForm, { props: { isAdmin: false } });
		await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'x' } });
		await fireEvent.input(screen.getByLabelText('Source 1'), { target: { value: '@x' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
		expect(await screen.findByTestId('import-request-error')).toHaveTextContent(
			'You already have 3 requests waiting for an admin',
		);
	});

	it('an admin starts the import directly, and Submit waits for a name and every source', async () => {
		render(ImportRequestForm, { props: { isAdmin: true } });
		expect(screen.getByText(/starts listing as soon as you send it/)).toBeInTheDocument();
		const start = screen.getByRole('button', { name: 'Start import' });
		expect(start).toBeDisabled();
		await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Nolan' } });
		expect(start).toBeDisabled();
		await fireEvent.input(screen.getByLabelText('Source 1'), { target: { value: '@x' } });
		expect(start).toBeEnabled();
	});
});

describe('ImportJobActions', () => {
	it('renders nothing for a non-admin', () => {
		render(ImportJobActions, { props: { job: job(), isAdmin: false } });
		expect(screen.queryByTestId('import-job-actions')).toBeNull();
	});

	it('approves a request, and a decline needs a reason', async () => {
		mocks.review.mockResolvedValue({});
		render(ImportJobActions, { props: { job: job(), isAdmin: true } });
		await fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
		expect(mocks.review).toHaveBeenCalledWith({ jobId: '7', approve: true });

		await fireEvent.click(screen.getByRole('button', { name: 'Decline…' }));
		const confirm = screen.getByRole('button', { name: 'Decline request' });
		expect(confirm).toBeDisabled();
		await fireEvent.input(screen.getByLabelText('Reason for declining'), { target: { value: 'Already imported' } });
		await fireEvent.click(confirm);
		expect(mocks.review).toHaveBeenLastCalledWith({ jobId: '7', approve: false, note: 'Already imported' });
	});

	it('closes an approved import after a confirm, and reopens a closed one', async () => {
		mocks.close.mockResolvedValue({});
		const { unmount } = render(ImportJobActions, { props: { job: job({ requestStatus: 'APPROVED' }), isAdmin: true } });
		await fireEvent.click(screen.getByRole('button', { name: 'Close import…' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Close import' }));
		expect(mocks.close).toHaveBeenCalledWith({ jobId: '7', closed: true });
		unmount();

		render(ImportJobActions, {
			props: { job: job({ requestStatus: 'APPROVED', closedAt: '2026-10-30T00:00:00Z' }), isAdmin: true },
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
		expect(mocks.close).toHaveBeenLastCalledWith({ jobId: '7', closed: false });
	});
});

describe('ImportProgressBar', () => {
	const p = (o: Partial<ImportProgress>): ImportProgress => ({
		jobId: '7',
		total: 1000,
		done: 0,
		imported: 0,
		skipped: 0,
		failed: 0,
		running: true,
		updatedAt: '2026-10-30T00:00:00Z',
		...o,
	});

	it('is hidden until an import runs', () => {
		render(ImportProgressBar, { props: { jobId: '7' } });
		expect(screen.queryByTestId('import-progress')).toBeNull();
	});

	it('shows the live count and an accessible bar while running', () => {
		mocks.progress = p({ done: 340, imported: 330, skipped: 8, failed: 2 });
		render(ImportProgressBar, { props: { jobId: '7' } });
		expect(screen.getByTestId('import-progress-label')).toHaveTextContent(
			'Importing 340 of 1,000 · 330 added · 8 already in library · 2 failed',
		);
		const bar = screen.getByRole('progressbar');
		expect(bar).toHaveAttribute('aria-valuenow', '340');
		expect(bar).toHaveAttribute('aria-valuemax', '1000');
		expect(screen.getByText('34%')).toBeInTheDocument();
	});

	it('keeps the outcome after a run until dismissed', async () => {
		mocks.progress = p({ total: 4, done: 4, imported: 4, running: false });
		render(ImportProgressBar, { props: { jobId: '7' } });
		expect(screen.getByTestId('import-progress-label')).toHaveTextContent('Imported 4 of 4');
		await fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
		expect(screen.queryByTestId('import-progress')).toBeNull();
	});
});
