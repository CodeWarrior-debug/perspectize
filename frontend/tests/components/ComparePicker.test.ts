import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import TestWrapper from '../helpers/TestWrapper.svelte';

const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));

vi.mock('$lib/queries/client', () => ({
	graphqlRequest: mockRequest,
}));

const { gotoMock } = vi.hoisted(() => ({ gotoMock: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: gotoMock }));

import ComparePicker from '$lib/components/ComparePicker.svelte';

function renderPicker() {
	return render(TestWrapper, {
		props: {
			queryClient: new QueryClient({
				defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
			}),
			component: ComparePicker,
		},
	});
}

const items = [
	{
		id: '11',
		name: 'Two Perspective Video',
		contentType: 'YOUTUBE_VIDEO',
		channelTitle: 'Chan',
		url: null,
		perspectiveCount: 2,
	},
];

describe('ComparePicker', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequest.mockResolvedValue({ content: { items } });
	});

	it('asks the server for content with 2+ perspectives and lists what comes back', async () => {
		renderPicker();

		await waitFor(() => {
			expect(screen.getByText('Two Perspective Video')).toBeInTheDocument();
		});
		expect(screen.getAllByTestId('picker-result')).toHaveLength(1);
		// The filter must ride the request so it applies before the page limit,
		// not after the 40 newest rows are already picked.
		expect(mockRequest.mock.calls[0][1]).toMatchObject({ filter: { minPerspectiveCount: 2 } });
	});

	it('keeps the 2+ perspectives filter when searching', async () => {
		renderPicker();
		await waitFor(() => expect(screen.getByTestId('picker-result')).toBeInTheDocument());

		await fireEvent.input(screen.getByPlaceholderText(/search content/i), { target: { value: 'two' } });

		await waitFor(() =>
			expect(mockRequest).toHaveBeenLastCalledWith(
				expect.anything(),
				expect.objectContaining({ filter: { search: 'two', minPerspectiveCount: 2 } }),
			),
		);
	});

	it('navigates to the comparison on click', async () => {
		renderPicker();

		await waitFor(() => expect(screen.getByTestId('picker-result')).toBeInTheDocument());
		await fireEvent.click(screen.getByTestId('picker-result'));

		expect(gotoMock).toHaveBeenCalledWith('/compare?contentId=11');
	});

	it('shows an empty state and a way back to Activity when nothing qualifies', async () => {
		mockRequest.mockResolvedValue({ content: { items: [] } });
		renderPicker();

		await waitFor(() => expect(screen.getByTestId('picker-empty')).toBeInTheDocument());
		expect(screen.getByRole('link', { name: 'Go to Activity' })).toHaveAttribute('href', '/');
	});

	it('shows an error state when the query fails', async () => {
		mockRequest.mockRejectedValue(new Error('network error'));
		renderPicker();

		await waitFor(() => {
			expect(screen.getByText("Couldn't load content. Please try again.")).toBeInTheDocument();
		});
	});
});
