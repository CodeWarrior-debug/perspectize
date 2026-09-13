import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockMutate, mockInvalidateQueries, mockSetQueriesData, mockToastSuccess, mockToastError, mockToastWarning } =
	vi.hoisted(() => ({
		mockMutate: vi.fn(),
		mockInvalidateQueries: vi.fn(),
		mockSetQueriesData: vi.fn(),
		mockToastSuccess: vi.fn(),
		mockToastError: vi.fn(),
		mockToastWarning: vi.fn(),
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
		warning: mockToastWarning,
	},
}));

vi.mock('$lib/queries/client', () => ({
	graphqlRequest: vi.fn(),
}));

describe('useAddVideo hook', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		capturedMutationOptions = undefined;
		const { useAddVideo } = await import('$lib/queries/content/useAddVideo');
		useAddVideo();
	});

	describe('onSuccess cache update callback', () => {
		it('inserts new item at top of existing cache data', () => {
			const newItem = { name: 'New Video', id: '1' };
			// Make setQueriesData invoke the updater callback
			mockSetQueriesData.mockImplementation((_filter: any, updater: Function) => {
				const oldData = {
					content: {
						items: [{ name: 'Old Video', id: '0' }],
						totalCount: 1,
					},
				};
				const result = updater(oldData);
				expect(result.content.items[0]).toBe(newItem);
				expect(result.content.items[1]).toEqual({ name: 'Old Video', id: '0' });
				expect(result.content.totalCount).toBe(2);
			});

			capturedMutationOptions.onSuccess({
				createContentFromYouTube: { content: newItem, alreadyExisted: false },
			});
			expect(mockSetQueriesData).toHaveBeenCalled();
		});

		it('returns undefined when cache has no existing data', () => {
			mockSetQueriesData.mockImplementation((_filter: any, updater: Function) => {
				const result = updater(undefined);
				expect(result).toBeUndefined();
			});

			capturedMutationOptions.onSuccess({
				createContentFromYouTube: { content: { name: 'Video' }, alreadyExisted: false },
			});
			expect(mockSetQueriesData).toHaveBeenCalled();
		});

		it('handles missing totalCount in old data', () => {
			mockSetQueriesData.mockImplementation((_filter: any, updater: Function) => {
				const oldData = {
					content: {
						items: [],
						// totalCount is undefined
					},
				};
				const result = updater(oldData);
				expect(result.content.totalCount).toBe(1);
			});

			capturedMutationOptions.onSuccess({
				createContentFromYouTube: { content: { name: 'Video' }, alreadyExisted: false },
			});
		});

		it('shows success toast with video name for new videos', () => {
			mockSetQueriesData.mockImplementation(() => {});
			capturedMutationOptions.onSuccess({
				createContentFromYouTube: { content: { name: 'Amazing Video', id: '1' }, alreadyExisted: false },
			});
			expect(mockToastSuccess).toHaveBeenCalledWith('Added: Amazing Video');
			expect(mockToastWarning).not.toHaveBeenCalled();
		});

		it('shows warning toast for duplicate videos (VIDEO-05)', () => {
			capturedMutationOptions.onSuccess({
				createContentFromYouTube: { content: { name: 'Existing Video', id: '1' }, alreadyExisted: true },
			});
			expect(mockToastWarning).toHaveBeenCalledWith('This video has already been added');
			expect(mockToastSuccess).not.toHaveBeenCalled();
		});

		it('falls back to a full refetch when the response has no content item', () => {
			capturedMutationOptions.onSuccess({
				createContentFromYouTube: { content: null, alreadyExisted: false },
			});
			expect(mockSetQueriesData).not.toHaveBeenCalled();
			expect(mockInvalidateQueries).toHaveBeenCalledWith(
				expect.not.objectContaining({ refetchType: 'none' }),
			);
		});

		it('does not insert duplicate into cache', () => {
			capturedMutationOptions.onSuccess({
				createContentFromYouTube: { content: { name: 'Existing Video', id: '1' }, alreadyExisted: true },
			});
			// setQueriesData should NOT be called for duplicates (no cache insert)
			expect(mockSetQueriesData).not.toHaveBeenCalled();
			// But invalidateQueries should still be called for eventual consistency
			expect(mockInvalidateQueries).toHaveBeenCalled();
		});
	});

	describe('onError network error branches', () => {
		it('shows server unreachable message for "load failed" errors', () => {
			capturedMutationOptions.onError(new Error('load failed'));
			expect(mockToastError).toHaveBeenCalledWith('Cannot reach the server. Check your connection and try again.');
		});

		it('shows server unreachable message for "failed to fetch" errors', () => {
			capturedMutationOptions.onError(new Error('Failed to fetch'));
			expect(mockToastError).toHaveBeenCalledWith('Cannot reach the server. Check your connection and try again.');
		});

		it('shows "video not found" message', () => {
			capturedMutationOptions.onError(new Error('video not found: xyz'));
			expect(mockToastError).toHaveBeenCalledWith('Invalid YouTube URL or video not found');
		});

		it('shows "invalid youtube url" message', () => {
			capturedMutationOptions.onError(new Error('Invalid YouTube URL'));
			expect(mockToastError).toHaveBeenCalledWith('Invalid YouTube URL or video not found');
		});

		it('shows a sign-in prompt for "access denied" errors', () => {
			capturedMutationOptions.onError(new Error('access denied'));
			expect(mockToastError).toHaveBeenCalledWith('Please sign in to add a video');
		});

		it('shows a sign-in prompt for "authentication required" errors', () => {
			capturedMutationOptions.onError(new Error('Authentication required'));
			expect(mockToastError).toHaveBeenCalledWith('Please sign in to add a video');
		});

		it('shows a generic failure message for an unrecognized error', () => {
			capturedMutationOptions.onError(new Error('something else entirely'));
			expect(mockToastError).toHaveBeenCalledWith('Failed to add video. Please try again.');
		});

		it('logs the raw error to the console', () => {
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const err = new Error('boom');
			capturedMutationOptions.onError(err);
			expect(consoleSpy).toHaveBeenCalledWith('[AddVideo] mutation failed:', err);
			consoleSpy.mockRestore();
		});
	});
});
