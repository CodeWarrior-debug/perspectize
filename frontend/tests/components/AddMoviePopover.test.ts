import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import AddMoviePopover from '$lib/components/AddMoviePopover.svelte';

const mocks = vi.hoisted(() => ({
	mutate: vi.fn(),
	reset: vi.fn(),
	// Reactive flags (filled in by the mock factory) so a test can flip them mid-render.
	flags: null as null | Map<string, boolean>,
}));

vi.mock('$lib/queries/content/useAddMovie', async () => {
	const { SvelteMap } = await import('svelte/reactivity');
	mocks.flags = new SvelteMap<string, boolean>();
	const flag = (k: string) => mocks.flags!.get(k) ?? false;
	return {
		useAddMovie: () => ({
			mutate: mocks.mutate,
			reset: mocks.reset,
			get isPending() {
				return flag('isPending');
			},
			get isSuccess() {
				return flag('isSuccess');
			},
			get isError() {
				return flag('isError');
			},
		}),
	};
});

const ATTRIBUTION = 'This product uses the TMDB API but is not endorsed or certified by TMDB.';

async function openForm() {
	render(AddMoviePopover);
	await fireEvent.click(screen.getByRole('button', { name: /add movie/i }));
	await tick();
	return screen.getByLabelText(/tmdb or imdb link/i) as HTMLInputElement;
}

function addButton() {
	return screen.getByRole('button', { name: /^add$|adding/i });
}

describe('AddMoviePopover', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.flags!.clear();
	});

	it('idle: shows an empty input, a disabled Add button, no messages, and the TMDB attribution', async () => {
		const input = await openForm();
		expect(input).toHaveValue('');
		expect(addButton()).toBeDisabled();
		expect(screen.queryByText(/valid tmdb or imdb/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/could not add/i)).not.toBeInTheDocument();
		expect(screen.getByText(ATTRIBUTION)).toBeInTheDocument();
	});

	it('invalid: shows a validation message, keeps Add disabled and never submits', async () => {
		const input = await openForm();
		await fireEvent.input(input, { target: { value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } });
		await tick();
		expect(screen.getByText(/valid tmdb or imdb/i)).toBeInTheDocument();
		expect(addButton()).toBeDisabled();
		await fireEvent.submit(input.closest('form')!);
		expect(mocks.mutate).not.toHaveBeenCalled();
	});

	it('valid: enables Add, hides the message and submits the trimmed value', async () => {
		const input = await openForm();
		await fireEvent.input(input, { target: { value: '  https://www.themoviedb.org/movie/603  ' } });
		await tick();
		expect(screen.queryByText(/valid tmdb or imdb/i)).not.toBeInTheDocument();
		expect(addButton()).toBeEnabled();
		await fireEvent.click(addButton());
		expect(mocks.mutate).toHaveBeenCalledWith('https://www.themoviedb.org/movie/603');
	});

	it('accepts a bare IMDb id', async () => {
		const input = await openForm();
		await fireEvent.input(input, { target: { value: 'tt0133093' } });
		await tick();
		expect(addButton()).toBeEnabled();
	});

	it('pending: disables the input and the buttons and shows the pending label', async () => {
		mocks.flags!.set('isPending', true);
		const input = await openForm();
		expect(input).toBeDisabled();
		expect(screen.getByRole('button', { name: /adding/i })).toBeDisabled();
		expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
	});

	it('error: shows an inline failure message while keeping the input editable', async () => {
		mocks.flags!.set('isError', true);
		const input = await openForm();
		expect(screen.getByText(/could not add this movie/i)).toBeInTheDocument();
		expect(input).toBeEnabled();
	});

	it('success: closes the form', async () => {
		render(AddMoviePopover);
		await fireEvent.click(screen.getByRole('button', { name: /add movie/i }));
		await tick();
		expect(screen.getByLabelText(/tmdb or imdb link/i)).toBeInTheDocument();
		mocks.flags!.set('isSuccess', true);
		await tick();
		await tick();
		expect(screen.queryByLabelText(/tmdb or imdb link/i)).not.toBeInTheDocument();
	});

	it('reopening clears the previous input and resets the mutation state', async () => {
		const input = await openForm();
		await fireEvent.input(input, { target: { value: 'tt0133093' } });
		await fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
		await tick();
		await fireEvent.click(screen.getByRole('button', { name: /add movie/i }));
		await tick();
		expect(screen.getByLabelText(/tmdb or imdb link/i)).toHaveValue('');
		expect(mocks.reset).toHaveBeenCalled();
	});
});
