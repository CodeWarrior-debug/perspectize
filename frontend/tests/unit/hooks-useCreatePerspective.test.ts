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

describe('useCreatePerspective hook', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		capturedMutationOptions = undefined;
		const { useCreatePerspective } = await import('$lib/queries/perspectives/useCreatePerspective');
		useCreatePerspective();
	});

	describe('hook initialization', () => {
		it('returns a mutation object with mutate method', async () => {
			const { useCreatePerspective } = await import('$lib/queries/perspectives/useCreatePerspective');
			const mutation = useCreatePerspective();
			expect(mutation).toBeDefined();
			expect(mutation.mutate).toBeDefined();
		});
	});

	describe('mutationFn', () => {
		it('is defined and callable', () => {
			expect(capturedMutationOptions).toBeDefined();
			expect(typeof capturedMutationOptions.mutationFn).toBe('function');
		});

		it('calls graphqlRequest with CREATE_PERSPECTIVE and input', async () => {
			const { graphqlRequest } = await import('$lib/queries/client');
			const { CREATE_PERSPECTIVE } = await import('$lib/queries/perspectives');
			(graphqlRequest as any).mockResolvedValue({
				createPerspective: { id: '1', userID: '42', quality: 7500, privacy: 'PUBLIC', createdAt: '', updatedAt: '' },
			});

			const input = { userID: 42, contentID: 10, quality: 7500 };
			await capturedMutationOptions.mutationFn(input);

			expect(graphqlRequest).toHaveBeenCalledWith(CREATE_PERSPECTIVE, { input });
		});

		it('passes partial input (only quality)', async () => {
			const { graphqlRequest } = await import('$lib/queries/client');
			(graphqlRequest as any).mockResolvedValue({
				createPerspective: { id: '1', userID: '42', quality: 5000, privacy: 'PUBLIC', createdAt: '', updatedAt: '' },
			});

			const input = { userID: 42, quality: 5000 };
			await capturedMutationOptions.mutationFn(input);

			expect(graphqlRequest).toHaveBeenCalledWith(expect.anything(), { input });
		});
	});

	const createdRow = {
		id: '7',
		userID: '42',
		contentID: '10',
		quality: 7500,
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
		updatedAt: '2026-01-01T00:00:00Z',
	};

	describe('onMutate — optimistic insert', () => {
		it('prepends an optimistic row to every cached perspectives list and returns a rollback snapshot', async () => {
			const existing = { perspectives: { items: [{ id: '1', contentID: '99' }] } };
			mockGetQueriesData.mockReturnValueOnce([[['app', 'perspectives', 'list', { userId: 42 }], existing]]);

			const ctx = await capturedMutationOptions.onMutate({ userID: 42, contentID: 10, quality: 7500 });

			expect(mockCancelQueries).toHaveBeenCalled();
			expect(mockSetQueriesData).toHaveBeenCalledWith(
				expect.objectContaining({ queryKey: expect.arrayContaining(['perspectives', 'list']) }),
				expect.any(Function),
			);

			const updater = mockSetQueriesData.mock.calls[0][1];
			const next = updater(existing);
			expect(next.perspectives.items).toHaveLength(2);
			expect(next.perspectives.items[0]).toMatchObject({ id: ctx.tempId, contentID: '10', quality: 7500 });
			expect(ctx.previous).toHaveLength(1);
		});
	});

	describe('privacy', () => {
		it('forwards privacy to the mutation and the optimistic row', async () => {
			const { graphqlRequest } = await import('$lib/queries/client');
			const { CREATE_PERSPECTIVE } = await import('$lib/queries/perspectives');
			(graphqlRequest as any).mockResolvedValue({
				createPerspective: { id: '1', userID: '42', quality: 9000, privacy: 'PRIVATE', createdAt: '', updatedAt: '' },
			});

			const input = { userID: 42, quality: 9000, privacy: 'PRIVATE' as const };
			await capturedMutationOptions.mutationFn(input);
			expect(graphqlRequest).toHaveBeenCalledWith(CREATE_PERSPECTIVE, {
				input: expect.objectContaining({ privacy: 'PRIVATE' }),
			});

			const existing = { perspectives: { items: [] as unknown[] } };
			await capturedMutationOptions.onMutate(input);
			const updater = mockSetQueriesData.mock.calls[0][1];
			const next = updater(existing);
			expect(next.perspectives.items[0]).toMatchObject({ privacy: 'PRIVATE' });
		});

		it('defaults the optimistic row to PUBLIC when privacy is omitted', async () => {
			const existing = { perspectives: { items: [] as unknown[] } };
			await capturedMutationOptions.onMutate({ userID: 42, quality: 9000 });
			const updater = mockSetQueriesData.mock.calls[0][1];
			const next = updater(existing);
			expect(next.perspectives.items[0]).toMatchObject({ privacy: 'PUBLIC' });
		});
	});

	describe('onSuccess callback', () => {
		it('shows success toast "Perspective added"', () => {
			capturedMutationOptions.onSuccess();
			expect(mockToastSuccess).toHaveBeenCalledWith('Perspective added');
		});

		it('falls back to a full list invalidation when the response has no row', () => {
			capturedMutationOptions.onSuccess(undefined, { userID: 42 }, undefined);
			expect(mockInvalidateQueries).toHaveBeenCalledWith(
				expect.objectContaining({ queryKey: expect.arrayContaining(['perspectives', 'list']) }),
			);
		});

		it('swaps the optimistic row for the server row and marks the list stale without refetching', () => {
			const optimistic = { perspectives: { items: [{ id: 'optimistic-1', contentID: '10' }] } };
			capturedMutationOptions.onSuccess(
				{ createPerspective: createdRow },
				{ userID: 42 },
				{ previous: [], tempId: 'optimistic-1' },
			);

			const updater = mockSetQueriesData.mock.calls.at(-1)![1];
			const next = updater(optimistic);
			expect(next.perspectives.items).toEqual([createdRow]);
			expect(mockInvalidateQueries).toHaveBeenCalledWith(
				expect.objectContaining({
					queryKey: expect.arrayContaining(['perspectives', 'list']),
					refetchType: 'none',
				}),
			);
		});

		it('does not invalidate content lists cache (content unchanged by perspective)', () => {
			capturedMutationOptions.onSuccess(
				{ createPerspective: createdRow },
				{ userID: 42 },
				{ previous: [], tempId: 'x' },
			);
			expect(mockInvalidateQueries).not.toHaveBeenCalledWith(
				expect.objectContaining({ queryKey: expect.arrayContaining(['content', 'list']) }),
			);
		});
	});

	describe('onError callback', () => {
		it('shows "No user selected" message for user not found errors', () => {
			capturedMutationOptions.onError(new Error('user not found'));
			expect(mockToastError).toHaveBeenCalledWith('No user selected');
		});

		it('shows "Invalid rating" message for rating errors', () => {
			capturedMutationOptions.onError(new Error('invalid rating: quality 99999'));
			expect(mockToastError).toHaveBeenCalledWith('Invalid rating value');
		});

		it('shows "at least one field" message for empty-input errors', () => {
			capturedMutationOptions.onError(new Error('at least one field must be provided'));
			expect(mockToastError).toHaveBeenCalledWith('Please fill in at least one field');
		});

		it('shows generic message for unknown errors', () => {
			capturedMutationOptions.onError(new Error('connection timeout'));
			expect(mockToastError).toHaveBeenCalledWith('Failed to add perspective. Please try again.');
		});

		it('rolls the optimistic insert back from the snapshot', () => {
			const key = ['app', 'perspectives', 'list', { userId: 42 }];
			const snapshot = { perspectives: { items: [{ id: '1' }] } };
			capturedMutationOptions.onError(
				new Error('connection timeout'),
				{ userID: 42 },
				{ previous: [[key, snapshot]], tempId: 't' },
			);
			expect(mockSetQueryData).toHaveBeenCalledWith(key, snapshot);
		});
	});
});
