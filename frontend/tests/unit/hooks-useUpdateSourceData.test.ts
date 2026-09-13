import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockMutate, mockInvalidateQueries, mockSetQueriesData, mockToastSuccess, mockToastError } = vi.hoisted(() => ({
	mockMutate: vi.fn(),
	mockInvalidateQueries: vi.fn(),
	mockSetQueriesData: vi.fn(),
	mockToastSuccess: vi.fn(),
	mockToastError: vi.fn(),
}));

let capturedMutationOptions: any;

vi.mock('@tanstack/svelte-query', () => ({
	createMutation: vi.fn((optionsFn: () => any) => {
		capturedMutationOptions = optionsFn();
		return {
			mutate: mockMutate,
			isPending: false,
		};
	}),
	useQueryClient: vi.fn(() => ({
		invalidateQueries: mockInvalidateQueries,
		setQueriesData: mockSetQueriesData,
	})),
}));

vi.mock('svelte-sonner', () => ({
	toast: {
		success: mockToastSuccess,
		error: mockToastError,
	},
}));

const mockGraphqlRequest = vi.fn();
vi.mock('$lib/queries/client', () => ({
	graphqlRequest: mockGraphqlRequest,
}));

describe('useUpdateSourceData hook', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		capturedMutationOptions = undefined;
		const { useUpdateSourceData } = await import('$lib/queries/hooks/useUpdateSourceData');
		useUpdateSourceData();
	});

	describe('mutationFn', () => {
		it('calls graphqlRequest with the contentId coerced to a number', async () => {
			mockGraphqlRequest.mockResolvedValue({ updateContentSourceData: { id: '42', name: 'Video' } });

			await capturedMutationOptions.mutationFn('42');

			expect(mockGraphqlRequest).toHaveBeenCalledWith(expect.anything(), { contentId: 42 });
		});
	});

	describe('onSuccess cache update callback', () => {
		it('replaces only the matching item in cached list data', () => {
			const updated = { id: '1', name: 'Refreshed Title' };
			mockSetQueriesData.mockImplementation((_filter: any, updater: Function) => {
				const oldData = {
					content: {
						items: [
							{ id: '1', name: 'Old Title' },
							{ id: '2', name: 'Untouched' },
						],
						totalCount: 2,
					},
				};
				const result = updater(oldData);
				expect(result.content.items[0]).toBe(updated);
				expect(result.content.items[1]).toEqual({ id: '2', name: 'Untouched' });
			});

			capturedMutationOptions.onSuccess({ updateContentSourceData: updated });
			expect(mockSetQueriesData).toHaveBeenCalled();
			expect(mockInvalidateQueries).toHaveBeenCalled();
		});

		it('returns undefined when cache has no existing data', () => {
			mockSetQueriesData.mockImplementation((_filter: any, updater: Function) => {
				const result = updater(undefined);
				expect(result).toBeUndefined();
			});

			capturedMutationOptions.onSuccess({ updateContentSourceData: { id: '1', name: 'Video' } });
		});

		it('shows a success toast with the video name', () => {
			mockSetQueriesData.mockImplementation(() => {});
			capturedMutationOptions.onSuccess({ updateContentSourceData: { id: '1', name: 'Refreshed Title' } });
			expect(mockToastSuccess).toHaveBeenCalledWith('Updated: Refreshed Title');
		});

		it('does nothing when the response has no updated item', () => {
			capturedMutationOptions.onSuccess({ updateContentSourceData: null });
			expect(mockSetQueriesData).not.toHaveBeenCalled();
			expect(mockToastSuccess).not.toHaveBeenCalled();
		});
	});

	describe('onError branches', () => {
		it('shows "not found" message for content-not-found errors', () => {
			capturedMutationOptions.onError(new Error('content not found'));
			expect(mockToastError).toHaveBeenCalledWith('This video could not be found');
		});

		it('shows server unreachable message for "load failed" errors', () => {
			capturedMutationOptions.onError(new Error('load failed'));
			expect(mockToastError).toHaveBeenCalledWith('Cannot reach the server. Check your connection and try again.');
		});

		it('shows sign-in message for authentication errors', () => {
			capturedMutationOptions.onError(new Error('access denied: authentication required'));
			expect(mockToastError).toHaveBeenCalledWith('Please sign in to update source data');
		});

		it('shows generic fallback message for unrecognized errors', () => {
			capturedMutationOptions.onError(new Error('something unexpected'));
			expect(mockToastError).toHaveBeenCalledWith('Failed to update source data. Please try again.');
		});
	});
});
