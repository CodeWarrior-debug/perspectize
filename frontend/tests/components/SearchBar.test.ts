import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import SearchBar from '$lib/components/discover/SearchBar.svelte';
import SearchBarHost from './fixtures/SearchBarHost.svelte';

const PLACEHOLDER = 'Search YouTube, or paste a video link';

describe('SearchBar', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('renders the search box and a disabled search button when empty', () => {
		render(SearchBar);
		expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /Search on YouTube/ })).toBeDisabled();
	});

	it('opens youtube.com results in a new tab on submit, and never calls fetch', async () => {
		const open = vi.spyOn(window, 'open').mockReturnValue(null);
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		render(SearchBar, { props: { value: 'lo-fi jazz' } });

		await fireEvent.click(screen.getByRole('button', { name: /Search on YouTube/ }));

		expect(open).toHaveBeenCalledWith(
			'https://www.youtube.com/results?search_query=lo-fi%20jazz',
			'_blank',
			'noopener,noreferrer',
		);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('submits on Enter from the input', async () => {
		const open = vi.spyOn(window, 'open').mockReturnValue(null);
		render(SearchBar, { props: { value: 'svelte' } });

		await fireEvent.submit(screen.getByRole('search'));

		expect(open).toHaveBeenCalledTimes(1);
	});

	it('does nothing on submit when the box only holds whitespace', async () => {
		const open = vi.spyOn(window, 'open').mockReturnValue(null);
		render(SearchBar, { props: { value: '   ' } });

		await fireEvent.submit(screen.getByRole('search'));

		expect(open).not.toHaveBeenCalled();
	});

	it('turns into "Add to Perspectize" for a pasted YouTube link and adds it instead of searching', async () => {
		const open = vi.spyOn(window, 'open').mockReturnValue(null);
		const onAddUrl = vi.fn();
		render(SearchBarHost, { props: { onAddUrl } });
		const input = screen.getByPlaceholderText(PLACEHOLDER);

		await fireEvent.input(input, { target: { value: ' https://www.youtube.com/watch?v=dQw4w9WgXcQ ' } });
		const add = screen.getByRole('button', { name: /Add to Perspectize/ });
		await fireEvent.click(add);

		expect(onAddUrl).toHaveBeenCalledWith('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
		expect(open).not.toHaveBeenCalled();
	});

	it('disables the add button while an add is in flight', () => {
		render(SearchBar, { props: { value: 'https://youtu.be/dQw4w9WgXcQ', isAdding: true } });
		expect(screen.getByRole('button', { name: /Adding/ })).toBeDisabled();
	});

	it('clears the bound value from the clear button', async () => {
		render(SearchBarHost);
		const input = screen.getByPlaceholderText(PLACEHOLDER);
		await fireEvent.input(input, { target: { value: 'svelte' } });
		expect(screen.getByTestId('bound-value')).toHaveTextContent('svelte');

		await fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));

		expect(screen.getByTestId('bound-value')).toHaveTextContent('');
	});
});
