import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { QueryClient } from '@tanstack/svelte-query';
import AddContentPopover from '$lib/components/AddContentPopover.svelte';
import TestWrapper from '../helpers/TestWrapper.svelte';

// Uses the REAL useAddMovie hook (real createMutation) so the popover's effects see a genuinely
// reactive mutation object. Only the network layer, toast and navigation are mocked.
const mocks = vi.hoisted(() => ({
	graphqlRequest: vi.fn(),
}));

vi.mock('$lib/queries/client', () => ({
	graphqlRequest: mocks.graphqlRequest,
	graphqlClient: { request: mocks.graphqlRequest },
}));
vi.mock('svelte-sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

const URL_OK = 'https://www.themoviedb.org/movie/949';
const PLACEHOLDER = /paste a link or type a reference/i;

function renderPopover() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
	return render(TestWrapper, { props: { queryClient, component: AddContentPopover } });
}

async function openForm() {
	await fireEvent.click(screen.getByRole('button', { name: /add content/i }));
	await tick();
	return screen.getByPlaceholderText(PLACEHOLDER) as HTMLInputElement;
}

async function submit(input: HTMLInputElement, value: string) {
	await fireEvent.input(input, { target: { value } });
	await tick();
	await fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
}

describe('AddContentPopover with the real useAddMovie mutation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	it('closes the popover after the mutation succeeds', async () => {
		let resolveRequest!: (v: unknown) => void;
		mocks.graphqlRequest.mockReturnValue(new Promise((r) => (resolveRequest = r)));
		renderPopover();
		const input = await openForm();
		await submit(input, URL_OK);

		// In flight: the form must keep what the user typed (the open-effect must not re-run and wipe it).
		await waitFor(() => expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeDisabled());
		expect(screen.getByPlaceholderText(PLACEHOLDER)).toHaveValue(URL_OK);

		resolveRequest({ createContentFromMovie: { id: '1', name: 'Heat' } });
		await waitFor(() => expect(screen.queryByPlaceholderText(PLACEHOLDER)).not.toBeInTheDocument());
		expect(mocks.graphqlRequest).toHaveBeenCalledTimes(1);
		expect(mocks.graphqlRequest.mock.calls[0][1]).toEqual({ input: { url: URL_OK } });
	});

	it('stays open and shows the inline error when the request is rejected', async () => {
		mocks.graphqlRequest.mockRejectedValue(new Error('boom'));
		renderPopover();
		const input = await openForm();
		await submit(input, URL_OK);

		expect(await screen.findByText(/could not add this movie/i)).toBeInTheDocument();
		expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeEnabled();
		expect(screen.getByPlaceholderText(PLACEHOLDER)).toHaveValue(URL_OK);
	});

	it('shows the exact server message and stays open for a CONTENT_NOT_ALLOWED rejection', async () => {
		const message = 'While Perspectize does not intend to act as censor, adding NSFW content is not enabled.';
		mocks.graphqlRequest.mockRejectedValue(
			Object.assign(new Error(message), {
				response: { errors: [{ message, extensions: { code: 'CONTENT_NOT_ALLOWED' } }] },
			}),
		);
		renderPopover();
		const input = await openForm();
		await submit(input, URL_OK);

		expect(await screen.findByText(message)).toBeInTheDocument();
		expect(screen.queryByText(/could not add this movie/i)).not.toBeInTheDocument();
		expect(screen.getByPlaceholderText(PLACEHOLDER)).toHaveValue(URL_OK);
	});

	it('reopens after a success with an empty input and no stale state', async () => {
		mocks.graphqlRequest.mockResolvedValue({ createContentFromMovie: { id: '1', name: 'Heat' } });
		renderPopover();
		const input = await openForm();
		await submit(input, URL_OK);
		await waitFor(() => expect(screen.queryByPlaceholderText(PLACEHOLDER)).not.toBeInTheDocument());

		const reopened = await openForm();
		expect(reopened).toHaveValue('');
		expect(screen.queryByText(/could not add/i)).not.toBeInTheDocument();
		// Still open: the stale success state must not close it again.
		await tick();
		await tick();
		expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /^add$/i })).toBeDisabled();
	});

	it('reopening after an error clears the error message', async () => {
		mocks.graphqlRequest.mockRejectedValue(new Error('boom'));
		renderPopover();
		const input = await openForm();
		await submit(input, URL_OK);
		await screen.findByText(/could not add this movie/i);

		await fireEvent.click(screen.getByText('Cancel'));
		await tick();
		const reopened = await openForm();
		expect(reopened).toHaveValue('');
		await waitFor(() => expect(screen.queryByText(/could not add/i)).not.toBeInTheDocument());
	});
});
