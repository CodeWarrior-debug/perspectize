import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { QueryClient } from '@tanstack/svelte-query';
import AddMoviePopover from '$lib/components/AddMoviePopover.svelte';
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

function renderPopover() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
	return render(TestWrapper, { props: { queryClient, component: AddMoviePopover } });
}

async function openForm() {
	await fireEvent.click(screen.getByRole('button', { name: /add movie/i }));
	await tick();
	return screen.getByLabelText(/tmdb or imdb link/i) as HTMLInputElement;
}

async function submit(input: HTMLInputElement, value: string) {
	await fireEvent.input(input, { target: { value } });
	await tick();
	await fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
}

describe('AddMoviePopover with the real useAddMovie mutation', () => {
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
		await waitFor(() => expect(screen.getByLabelText(/tmdb or imdb link/i)).toBeDisabled());
		expect(screen.getByLabelText(/tmdb or imdb link/i)).toHaveValue(URL_OK);

		resolveRequest({ createContentFromMovie: { id: '1', name: 'Heat' } });
		await waitFor(() => expect(screen.queryByLabelText(/tmdb or imdb link/i)).not.toBeInTheDocument());
		expect(mocks.graphqlRequest).toHaveBeenCalledTimes(1);
		expect(mocks.graphqlRequest.mock.calls[0][1]).toEqual({ input: { url: URL_OK } });
	});

	it('stays open and shows the inline error when the request is rejected', async () => {
		mocks.graphqlRequest.mockRejectedValue(new Error('boom'));
		renderPopover();
		const input = await openForm();
		await submit(input, URL_OK);

		expect(await screen.findByText(/could not add this movie/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/tmdb or imdb link/i)).toBeEnabled();
		expect(screen.getByLabelText(/tmdb or imdb link/i)).toHaveValue(URL_OK);
	});

	it('reopens after a success with an empty input and no stale state', async () => {
		mocks.graphqlRequest.mockResolvedValue({ createContentFromMovie: { id: '1', name: 'Heat' } });
		renderPopover();
		const input = await openForm();
		await submit(input, URL_OK);
		await waitFor(() => expect(screen.queryByLabelText(/tmdb or imdb link/i)).not.toBeInTheDocument());

		const reopened = await openForm();
		expect(reopened).toHaveValue('');
		expect(screen.queryByText(/could not add/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/valid tmdb or imdb/i)).not.toBeInTheDocument();
		// Still open: the stale success state must not close it again.
		await tick();
		await tick();
		expect(screen.getByLabelText(/tmdb or imdb link/i)).toBeInTheDocument();
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
