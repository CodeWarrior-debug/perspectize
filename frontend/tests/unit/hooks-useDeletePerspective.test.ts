import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
	mockInvalidateQueries,
	mockSetQueriesData,
	mockGetQueriesData,
	mockCancelQueries,
	mockSetQueryData,
	mockToastSuccess,
	mockToastError,
} = vi.hoisted(() => ({
	mockInvalidateQueries: vi.fn(),
	mockSetQueriesData: vi.fn(),
	mockGetQueriesData: vi.fn(() => [] as unknown[]),
	mockCancelQueries: vi.fn(() => Promise.resolve()),
	mockSetQueryData: vi.fn(),
	mockToastSuccess: vi.fn(),
	mockToastError: vi.fn(),
}));

let capturedMutationOptions: any;

vi.mock('@tanstack/svelte-query', () => ({
	createMutation: vi.fn((optionsFn: () => any) => {
		capturedMutationOptions = optionsFn();
		return { mutate: vi.fn(), isPending: false };
	}),
	useQueryClient: vi.fn(() => ({
		invalidateQueries: mockInvalidateQueries,
		setQueriesData: mockSetQueriesData,
		getQueriesData: mockGetQueriesData,
		cancelQueries: mockCancelQueries,
		setQueryData: mockSetQueryData,
	})),
}));

vi.mock('svelte-sonner', () => ({
	toast: { success: mockToastSuccess, error: mockToastError },
}));

vi.mock('$lib/queries/client', () => ({
	graphqlRequest: vi.fn(),
}));

describe('useDeletePerspective hook', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		capturedMutationOptions = undefined;
		const { useDeletePerspective } = await import('$lib/queries/perspectives/useDeletePerspective');
		useDeletePerspective();
	});

	describe('mutationFn', () => {
		it('sends DELETE_PERSPECTIVE with only the id', async () => {
			const { graphqlRequest } = await import('$lib/queries/client');
			const { DELETE_PERSPECTIVE } = await import('$lib/queries/perspectives');
			(graphqlRequest as any).mockResolvedValue({ deletePerspective: true });

			await capturedMutationOptions.mutationFn({ id: '7', contentID: '3' });

			expect(graphqlRequest).toHaveBeenCalledWith(DELETE_PERSPECTIVE, { id: '7' });
		});

		it('treats a false response as a failure', async () => {
			const { graphqlRequest } = await import('$lib/queries/client');
			(graphqlRequest as any).mockResolvedValue({ deletePerspective: false });

			await expect(capturedMutationOptions.mutationFn({ id: '7', contentID: null })).rejects.toThrow();
		});
	});

	describe('onMutate (optimistic removal)', () => {
		it('removes only the target row from PerspectiveItem-shaped lists and snapshots them', async () => {
			const snapshot = [[['k'], { perspectives: { items: [{ id: '7' }] } }]];
			mockGetQueriesData.mockReturnValue(snapshot);

			const ctx = await capturedMutationOptions.onMutate({ id: '7', contentID: '3' });

			expect(mockCancelQueries).toHaveBeenCalledTimes(2);
			expect(mockSetQueriesData).toHaveBeenCalledTimes(2);
			const updater = mockSetQueriesData.mock.calls[0][1];
			const result = updater({ perspectives: { items: [{ id: '7' }, { id: '8' }] } });
			expect(result.perspectives.items).toEqual([{ id: '8' }]);
			expect(updater(undefined)).toBeUndefined();
			expect(ctx.previous).toHaveLength(2);
		});

		it('never patches the activity feed (different row shape)', async () => {
			const { queryKeys } = await import('$lib/queries/keys');
			await capturedMutationOptions.onMutate({ id: '7', contentID: null });
			const keys = mockSetQueriesData.mock.calls.map((c: any[]) => c[0].queryKey);
			expect(keys).not.toContainEqual(queryKeys.perspectives.activityFeeds());
		});
	});

	describe('onError', () => {
		it('restores the snapshot', () => {
			const previous = [[['a'], { perspectives: { items: [{ id: '7' }] } }]];
			capturedMutationOptions.onError(new Error('boom'), { id: '7', contentID: null }, { previous });
			expect(mockSetQueryData).toHaveBeenCalledWith(['a'], previous[0][1]);
			expect(mockToastError).toHaveBeenCalledWith('Failed to delete perspective. Please try again.');
		});

		it('explains an ownership rejection', () => {
			capturedMutationOptions.onError(
				new Error('access denied: you can only modify your own perspectives'),
				{ id: '7', contentID: null },
				{ previous: [] },
			);
			expect(mockToastError).toHaveBeenCalledWith('You can only delete your own perspectives');
		});

		it('refetches lists when the perspective is already gone', () => {
			capturedMutationOptions.onError(new Error('resource not found'), { id: '7', contentID: null }, { previous: [] });
			expect(mockToastError).toHaveBeenCalledWith('That perspective no longer exists');
			expect(mockInvalidateQueries).toHaveBeenCalled();
		});
	});

	describe('onSuccess', () => {
		it('toasts and invalidates activity feed, detail and the content aggregate', async () => {
			const { queryKeys } = await import('$lib/queries/keys');
			capturedMutationOptions.onSuccess({ deletePerspective: true }, { id: '7', contentID: '3' });

			expect(mockToastSuccess).toHaveBeenCalledWith('Perspective deleted');
			const keys = mockInvalidateQueries.mock.calls.map((c: any[]) => c[0].queryKey);
			expect(keys).toContainEqual(queryKeys.perspectives.activityFeeds());
			expect(keys).toContainEqual(queryKeys.perspectives.detail('7'));
			expect(keys).toContainEqual(queryKeys.content.detail('3'));
		});

		it('skips the content aggregate when there is no contentID', async () => {
			const { queryKeys } = await import('$lib/queries/keys');
			capturedMutationOptions.onSuccess({ deletePerspective: true }, { id: '7', contentID: null });
			const keys = mockInvalidateQueries.mock.calls.map((c: any[]) => c[0].queryKey);
			expect(keys.some((k: unknown[]) => k.includes('detail') && k.includes('content'))).toBe(false);
		});
	});
});
