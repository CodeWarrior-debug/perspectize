import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
	mockMutate,
	mockInvalidateQueries,
	mockSetQueriesData,
	mockGetQueriesData,
	mockCancelQueries,
	mockSetQueryData,
	mockToastSuccess,
	mockToastError,
} = vi.hoisted(() => ({
	mockMutate: vi.fn(),
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
		return {
			mutate: mockMutate,
			isPending: false,
		};
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
	toast: {
		success: mockToastSuccess,
		error: mockToastError,
	},
}));

vi.mock('$lib/queries/client', () => ({
	graphqlRequest: vi.fn(),
}));

describe('useUpdatePerspective hook', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		capturedMutationOptions = undefined;
		const { useUpdatePerspective } = await import('$lib/queries/perspectives/useUpdatePerspective');
		useUpdatePerspective();
	});

	describe('hook initialization', () => {
		it('returns a mutation object with mutate method', async () => {
			const { useUpdatePerspective } = await import('$lib/queries/perspectives/useUpdatePerspective');
			const mutation = useUpdatePerspective();
			expect(mutation).toBeDefined();
			expect(mutation.mutate).toBeDefined();
		});
	});

	describe('mutationFn', () => {
		it('is defined and callable', () => {
			expect(capturedMutationOptions).toBeDefined();
			expect(typeof capturedMutationOptions.mutationFn).toBe('function');
		});

		it('calls graphqlRequest with UPDATE_PERSPECTIVE and input', async () => {
			const { graphqlRequest } = await import('$lib/queries/client');
			const { UPDATE_PERSPECTIVE } = await import('$lib/queries/perspectives');
			(graphqlRequest as any).mockResolvedValue({
				updatePerspective: { id: '1', userID: '42', quality: 8000, privacy: 'PUBLIC', createdAt: '', updatedAt: '' },
			});

			const input = { id: 1, quality: 8000 };
			await capturedMutationOptions.mutationFn(input);

			expect(graphqlRequest).toHaveBeenCalledWith(UPDATE_PERSPECTIVE, { input });
		});

		it('supports partial update with only quality', async () => {
			const { graphqlRequest } = await import('$lib/queries/client');
			(graphqlRequest as any).mockResolvedValue({
				updatePerspective: { id: '5', userID: '42', quality: 6000, privacy: 'PUBLIC', createdAt: '', updatedAt: '' },
			});

			const input = { id: 5, quality: 6000 };
			await capturedMutationOptions.mutationFn(input);

			expect(graphqlRequest).toHaveBeenCalledWith(expect.anything(), { input: { id: 5, quality: 6000 } });
		});

		it('supports partial update with only like', async () => {
			const { graphqlRequest } = await import('$lib/queries/client');
			(graphqlRequest as any).mockResolvedValue({
				updatePerspective: {
					id: '3',
					userID: '42',
					like: 'THUMBS_UP',
					privacy: 'PUBLIC',
					createdAt: '',
					updatedAt: '',
				},
			});

			const input = { id: 3, like: 'THUMBS_UP' };
			await capturedMutationOptions.mutationFn(input);

			expect(graphqlRequest).toHaveBeenCalledWith(expect.anything(), { input: { id: 3, like: 'THUMBS_UP' } });
		});
	});

	const updatedRow = {
		id: '5',
		userID: '42',
		contentID: '10',
		quality: 6000,
		agreement: null,
		importance: null,
		confidence: null,
		like: null,
		review: null,
		privacy: 'public',
		description: null,
		primaryPerspectiveID: null,
		relatedPerspectiveIDs: null,
		customFields: null,
		createdAt: '2026-01-01T00:00:00Z',
		updatedAt: '2026-01-02T00:00:00Z',
	};

	describe('onMutate — optimistic edit', () => {
		it('patches the matching cached row in place and returns a rollback snapshot', async () => {
			const existing = {
				perspectives: { items: [{ id: '5', quality: 1000, importance: 2000, updatedAt: 'old' }] },
			};
			mockGetQueriesData.mockReturnValueOnce([[['app', 'perspectives', 'list', { userId: 42 }], existing]]);

			const ctx = await capturedMutationOptions.onMutate({ id: 5, quality: 6000 });

			expect(mockCancelQueries).toHaveBeenCalled();
			const updater = mockSetQueriesData.mock.calls[0][1];
			const next = updater(existing);
			expect(next.perspectives.items[0]).toMatchObject({ id: '5', quality: 6000, importance: 2000 });
			expect(next.perspectives.items[0].updatedAt).not.toBe('old');
			expect(ctx.previous).toHaveLength(1);
		});
	});

	describe('privacy', () => {
		it('forwards privacy and patches the cached row via applyEdit', async () => {
			const { graphqlRequest } = await import('$lib/queries/client');
			const { UPDATE_PERSPECTIVE } = await import('$lib/queries/perspectives');
			(graphqlRequest as any).mockResolvedValue({
				updatePerspective: { id: '5', userID: '42', privacy: 'PRIVATE', createdAt: '', updatedAt: '' },
			});

			const input = { id: 5, privacy: 'PRIVATE' as const };
			await capturedMutationOptions.mutationFn(input);
			expect(graphqlRequest).toHaveBeenCalledWith(UPDATE_PERSPECTIVE, {
				input: expect.objectContaining({ id: 5, privacy: 'PRIVATE' }),
			});

			const existing = {
				perspectives: { items: [{ id: '5', quality: 1000, privacy: 'PUBLIC', updatedAt: 'old' }] },
			};
			mockGetQueriesData.mockReturnValueOnce([[['app', 'perspectives', 'list', { userId: 42 }], existing]]);
			await capturedMutationOptions.onMutate(input);
			const updater = mockSetQueriesData.mock.calls[0][1];
			const next = updater(existing);
			expect(next.perspectives.items[0]).toMatchObject({ id: '5', privacy: 'PRIVATE' });
		});
	});

	describe('onSuccess callback', () => {
		it('shows success toast "Perspective updated"', () => {
			capturedMutationOptions.onSuccess();
			expect(mockToastSuccess).toHaveBeenCalledWith('Perspective updated');
		});

		it('falls back to a full list invalidation when the response has no row', () => {
			capturedMutationOptions.onSuccess(undefined);
			expect(mockInvalidateQueries).toHaveBeenCalledWith(
				expect.objectContaining({ queryKey: expect.arrayContaining(['perspectives', 'list']) }),
			);
		});

		it('replaces the cached row with the server row and marks the list stale without refetching', () => {
			const cached = {
				perspectives: {
					items: [
						{ id: '5', quality: 1 },
						{ id: '9', quality: 2 },
					],
				},
			};
			capturedMutationOptions.onSuccess({ updatePerspective: updatedRow });

			const updater = mockSetQueriesData.mock.calls.at(-1)![1];
			const next = updater(cached);
			expect(next.perspectives.items).toEqual([updatedRow, { id: '9', quality: 2 }]);
			expect(mockInvalidateQueries).toHaveBeenCalledWith(
				expect.objectContaining({
					queryKey: expect.arrayContaining(['perspectives', 'list']),
					refetchType: 'none',
				}),
			);
		});

		it('does not invalidate content cache on update', () => {
			capturedMutationOptions.onSuccess({ updatePerspective: updatedRow });
			const contentCall = mockInvalidateQueries.mock.calls.find((call: any[]) =>
				call[0]?.queryKey?.includes('content'),
			);
			expect(contentCall).toBeUndefined();
		});
	});

	describe('onError callback', () => {
		it('shows "Invalid rating" message for rating errors', () => {
			capturedMutationOptions.onError(new Error('invalid rating: quality 99999'));
			expect(mockToastError).toHaveBeenCalledWith('Invalid rating value');
		});

		it('shows "at least one field" message for empty-input errors', () => {
			capturedMutationOptions.onError(new Error('at least one field must be provided'));
			expect(mockToastError).toHaveBeenCalledWith('Please fill in at least one field');
		});

		it('shows generic message for unknown errors', () => {
			capturedMutationOptions.onError(new Error('network failure'));
			expect(mockToastError).toHaveBeenCalledWith('Failed to update perspective. Please try again.');
		});

		it('shows "No user selected" for user-related errors', () => {
			capturedMutationOptions.onError(new Error('user not found'));
			expect(mockToastError).toHaveBeenCalledWith('No user selected');
		});

		it('rolls the optimistic edit back from the snapshot', () => {
			const key = ['app', 'perspectives', 'list', { userId: 42 }];
			const snapshot = { perspectives: { items: [{ id: '5', quality: 1000 }] } };
			capturedMutationOptions.onError(new Error('network failure'), { id: 5 }, { previous: [[key, snapshot]] });
			expect(mockSetQueryData).toHaveBeenCalledWith(key, snapshot);
		});
	});
});
