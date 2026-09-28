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
		id: '10',
		name: 'One Perspective Video',
		contentType: 'YOUTUBE',
		channelTitle: 'Chan',
		url: null,
		perspectiveCount: 1,
	},
	{
		id: '11',
		name: 'Two Perspective Video',
		contentType: 'YOUTUBE',
		channelTitle: 'Chan',
		url: null,
		perspectiveCount: 2,
	},
	{ id: '12', name: 'No Perspectives', contentType: 'YOUTUBE', channelTitle: 'Chan', url: null, perspectiveCount: 0 },
];

describe('ComparePicker', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequest.mockResolvedValue({ content: { items } });
	});

	it('only shows content with 2+ perspectives', async () => {
		renderPicker();

		await waitFor(() => {
			expect(screen.getByText('Two Perspective Video')).toBeInTheDocument();
		});
		expect(screen.queryByText('One Perspective Video')).not.toBeInTheDocument();
		expect(screen.queryByText('No Perspectives')).not.toBeInTheDocument();
		expect(screen.getAllByTestId('picker-result')).toHaveLength(1);
	});

	it('navigates to the comparison on click', async () => {
		renderPicker();

		await waitFor(() => expect(screen.getByTestId('picker-result')).toBeInTheDocument());
		await fireEvent.click(screen.getByTestId('picker-result'));

		expect(gotoMock).toHaveBeenCalledWith('/compare?contentId=11');
	});

	it('shows an empty state and a way back to Activity when nothing qualifies', async () => {
		mockRequest.mockResolvedValue({ content: { items: [items[0], items[2]] } });
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
