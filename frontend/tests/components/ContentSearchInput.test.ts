import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ContentSearchInput from '$lib/components/ContentSearchInput.svelte';
import ContentSearchInputHost from './fixtures/ContentSearchInputHost.svelte';

// Note: ContentSearchInput exposes `debouncedQuery` as a $bindable prop (per the task
// brief). Programmatic render() here can't observe two-way bound prop writes
// without a dedicated host wrapper component, so most of this file sticks to
// DOM-observable behavior — the debounce-timing test below uses
// ./fixtures/ContentSearchInputHost.svelte (a component that actually owns the bound
// state) to observe the write.
describe('ContentSearchInput', () => {
	it('renders with the expected placeholder text', () => {
		render(ContentSearchInput);
		expect(screen.getByPlaceholderText('Search Content Sources...')).toBeInTheDocument();
	});

	it('reflects typed input in the field', async () => {
		render(ContentSearchInput, { props: { value: '' } });
		const input = screen.getByPlaceholderText('Search Content Sources...') as HTMLInputElement;

		await fireEvent.input(input, { target: { value: 'svelte' } });

		expect(input.value).toBe('svelte');
	});

	it('does not show a clear button when there is no input', () => {
		render(ContentSearchInput, { props: { value: '' } });
		expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
	});

	it('shows a clear button once there is input', () => {
		render(ContentSearchInput, { props: { value: 'svelte' } });
		expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument();
	});

	it('clears the input value when the clear button is clicked', async () => {
		render(ContentSearchInput, { props: { value: 'svelte' } });
		const input = screen.getByPlaceholderText('Search Content Sources...') as HTMLInputElement;

		await fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));

		expect(input.value).toBe('');
		expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
	});

	it('autofocuses the input on mount', () => {
		render(ContentSearchInput);
		const input = screen.getByPlaceholderText('Search Content Sources...');
		expect(document.activeElement).toBe(input);
	});

	describe('debouncing', () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('does not propagate to debouncedQuery before the 300ms delay elapses', async () => {
			render(ContentSearchInputHost);
			const input = screen.getByPlaceholderText('Search Content Sources...');

			await fireEvent.input(input, { target: { value: 'svelte' } });
			await vi.advanceTimersByTimeAsync(299);

			expect(screen.getByTestId('debounced-query')).toHaveTextContent('');
		});

		it('propagates to debouncedQuery 300ms after typing stops', async () => {
			render(ContentSearchInputHost);
			const input = screen.getByPlaceholderText('Search Content Sources...');

			await fireEvent.input(input, { target: { value: 'svelte' } });
			await vi.advanceTimersByTimeAsync(300);

			expect(screen.getByTestId('debounced-query')).toHaveTextContent('svelte');
		});

		it('resets the debounce timer on each keystroke, so only the final value propagates', async () => {
			render(ContentSearchInputHost);
			const input = screen.getByPlaceholderText('Search Content Sources...');

			await fireEvent.input(input, { target: { value: 's' } });
			await vi.advanceTimersByTimeAsync(200);
			await fireEvent.input(input, { target: { value: 'sv' } });
			await vi.advanceTimersByTimeAsync(200);
			await fireEvent.input(input, { target: { value: 'svelte' } });

			// 200ms after the last keystroke: still within the 300ms window, so no propagation yet.
			await vi.advanceTimersByTimeAsync(200);
			expect(screen.getByTestId('debounced-query')).toHaveTextContent('');

			// The remaining 100ms completes the 300ms window from the final keystroke.
			await vi.advanceTimersByTimeAsync(100);
			expect(screen.getByTestId('debounced-query')).toHaveTextContent('svelte');
		});
	});
});
