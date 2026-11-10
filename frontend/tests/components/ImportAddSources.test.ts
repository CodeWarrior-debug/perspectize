import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ImportAddSources from '$lib/components/imports/ImportAddSources.svelte';
import type { ImportJobSummary, ImportSource } from '$lib/queries/imports';

const mocks = vi.hoisted(() => ({
	add: vi.fn(),
	toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('svelte-sonner', () => ({ toast: mocks.toast }));
vi.mock('$lib/queries/imports/useImportJobMutations', () => ({
	useAddImportJobSources: () => ({ mutateAsync: mocks.add, isPending: false }),
}));

function source(id: number): ImportSource {
	return { id: String(id), sourceType: 'YOUTUBE_CHANNEL', sourceRef: `@s${id}`, status: 'READY' } as ImportSource;
}

function job(overrides: Partial<ImportJobSummary> = {}): ImportJobSummary {
	return {
		id: '7',
		name: 'Sermons',
		requestStatus: 'REQUESTED',
		requestedBy: { id: '2', username: 'ben' },
		reviewNote: null,
		reviewedAt: null,
		closedAt: null,
		description: '<p>Sermons</p>',
		createdAt: '2026-10-29T12:00:00Z',
		updatedAt: '2026-10-29T12:00:00Z',
		sources: [],
		...overrides,
	};
}

const requester = { meId: '2', isAdmin: false };
const admin = { meId: '1', isAdmin: true };

beforeEach(() => vi.clearAllMocks());

describe('ImportAddSources', () => {
	it('shows nothing to anyone who may not add: another user, or the requester once approved', () => {
		const { unmount } = render(ImportAddSources, { props: { job: job(), meId: '3', isAdmin: false } });
		expect(screen.queryByRole('button', { name: 'Add sources' })).not.toBeInTheDocument();
		unmount();
		render(ImportAddSources, { props: { job: job({ requestStatus: 'APPROVED' }), ...requester } });
		expect(screen.queryByRole('button', { name: 'Add sources' })).not.toBeInTheDocument();
	});

	it('shows nothing on a closed import, a declined one, or one already at the cap', () => {
		const full = Array.from({ length: 10 }, (_, i) => source(i));
		const { unmount } = render(ImportAddSources, {
			props: { job: job({ closedAt: '2026-10-30T00:00:00Z' }), ...admin },
		});
		expect(screen.queryByRole('button', { name: 'Add sources' })).not.toBeInTheDocument();
		unmount();
		const { unmount: unmount2 } = render(ImportAddSources, {
			props: { job: job({ requestStatus: 'DECLINED' }), ...admin },
		});
		expect(screen.queryByRole('button', { name: 'Add sources' })).not.toBeInTheDocument();
		unmount2();
		render(ImportAddSources, { props: { job: job({ sources: full }), ...admin } });
		expect(screen.queryByRole('button', { name: 'Add sources' })).not.toBeInTheDocument();
	});

	it('the requester opens the form on a waiting request, which says the sources wait for approval', async () => {
		render(ImportAddSources, { props: { job: job({ sources: [source(1)] }), ...requester } });
		expect(screen.queryByTestId('import-add-sources')).not.toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Add sources' }));
		expect(screen.getByTestId('import-add-sources')).toHaveTextContent(/wait with the request until an admin approves/);
		expect(screen.getByTestId('import-add-sources')).toHaveTextContent('room for 9 more');
	});

	it('an admin adds to an approved import, which says listing starts at once; Add waits for a filled row', async () => {
		mocks.add.mockResolvedValue({ addImportJobSources: { id: '7', requestStatus: 'APPROVED' } });
		render(ImportAddSources, { props: { job: job({ requestStatus: 'APPROVED' }), ...admin } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add sources' }));
		expect(screen.getByTestId('import-add-sources')).toHaveTextContent(/start listing as soon as you add them/);

		const submit = screen.getAllByRole('button', { name: 'Add sources' }).at(-1)!;
		expect(submit).toBeDisabled();
		await fireEvent.input(screen.getByLabelText('Source 1'), { target: { value: ' @GaitherMusic ' } });
		expect(submit).toBeEnabled();
		await fireEvent.click(submit);

		expect(mocks.add).toHaveBeenCalledWith({
			jobId: '7',
			sources: [{ sourceType: 'YOUTUBE_CHANNEL', ref: '@GaitherMusic', role: null }],
		});
		await vi.waitFor(() => expect(mocks.toast.success).toHaveBeenCalled());
		expect(mocks.toast.success.mock.calls[0][0]).toContain('Listing has started');
		expect(screen.queryByTestId('import-add-sources')).not.toBeInTheDocument();
	});

	it("keeps the form open and shows the server's reason when the add is refused", async () => {
		mocks.add.mockRejectedValue({
			response: { errors: [{ message: 'invalid input: an import takes at most 10 sources (it has 9)' }] },
		});
		render(ImportAddSources, { props: { job: job(), ...requester } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add sources' }));
		await fireEvent.input(screen.getByLabelText('Source 1'), { target: { value: '@x' } });
		await fireEvent.click(screen.getAllByRole('button', { name: 'Add sources' }).at(-1)!);
		expect(await screen.findByTestId('import-add-sources-error')).toHaveTextContent(
			'An import takes at most 10 sources',
		);
		expect(screen.getByTestId('import-add-sources')).toBeInTheDocument();
		expect(mocks.toast.success).not.toHaveBeenCalled();
	});

	it('Cancel closes the form and forgets what was typed', async () => {
		render(ImportAddSources, { props: { job: job(), ...requester } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add sources' }));
		await fireEvent.input(screen.getByLabelText('Source 1'), { target: { value: '@typed' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Add sources' }));
		expect(screen.getByLabelText('Source 1')).toHaveValue('');
	});

	it('limits the rows to the room left under the cap', async () => {
		const nine = Array.from({ length: 9 }, (_, i) => source(i));
		render(ImportAddSources, { props: { job: job({ sources: nine }), ...admin } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add sources' }));
		expect(screen.queryByRole('button', { name: /Add a source/ })).not.toBeInTheDocument();
	});
});
