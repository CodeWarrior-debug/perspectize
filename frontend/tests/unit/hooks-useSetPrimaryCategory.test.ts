import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockMutate, mockInvalidateQueries, mockToastSuccess, mockToastError, mockGraphqlRequest } = vi.hoisted(() => ({
	mockMutate: vi.fn(),
	mockInvalidateQueries: vi.fn(),
	mockToastSuccess: vi.fn(),
	mockToastError: vi.fn(),
	mockGraphqlRequest: vi.fn(),
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
	})),
}));

vi.mock('svelte-sonner', () => ({
	toast: {
		success: mockToastSuccess,
		error: mockToastError,
	},
}));

vi.mock('$lib/queries/client', () => ({
	graphqlRequest: mockGraphqlRequest,
	// Deliberately no `graphqlClient` export here — if the hook falls back to
	// the raw unauthenticated client, this mock throws instead of silently
	// resolving, so a regression fails loudly.
}));

describe('useSetPrimaryCategory hook', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		capturedMutationOptions = undefined;
		const { useSetPrimaryCategory } = await import('$lib/queries/categories/useSetPrimaryCategory');
		useSetPrimaryCategory();
	});

	it('sends the mutation through the authenticated graphqlRequest wrapper, not the bare client', async () => {
		mockGraphqlRequest.mockResolvedValue({
			setPrimaryCategory: { id: '1', name: 'Video', primaryCategory: { label: 'Test' } },
		});

		await capturedMutationOptions.mutationFn({
			contentId: 1,
			qid: 'Q1',
			label: 'Test',
		});

		expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
		const [, variables] = mockGraphqlRequest.mock.calls[0];
		expect(variables).toEqual({
			input: {
				contentId: 1,
				qid: 'Q1',
				label: 'Test',
				description: '',
				entityType: '',
			},
		});
	});

	it('passes through optional description and entityType', async () => {
		mockGraphqlRequest.mockResolvedValue({
			setPrimaryCategory: { id: '1', name: 'Video', primaryCategory: { label: 'Test' } },
		});

		await capturedMutationOptions.mutationFn({
			contentId: 2,
			qid: 'Q2',
			label: 'Test 2',
			description: 'A description',
			entityType: 'person',
		});

		const [, variables] = mockGraphqlRequest.mock.calls[0];
		expect(variables).toEqual({
			input: {
				contentId: 2,
				qid: 'Q2',
				label: 'Test 2',
				description: 'A description',
				entityType: 'person',
			},
		});
	});

	describe('onSuccess', () => {
		it('shows a success toast naming the selected category and invalidates content lists', () => {
			capturedMutationOptions.onSuccess({
				setPrimaryCategory: { id: '1', name: 'Video', primaryCategory: { label: 'Politics' } },
			});

			expect(mockToastSuccess).toHaveBeenCalledWith('Category set: Politics');
			expect(mockInvalidateQueries).toHaveBeenCalled();
		});

		it('falls back to "unknown" when primaryCategory is missing', () => {
			capturedMutationOptions.onSuccess({
				setPrimaryCategory: { id: '1', name: 'Video', primaryCategory: null },
			});

			expect(mockToastSuccess).toHaveBeenCalledWith('Category set: unknown');
		});
	});

	describe('onError', () => {
		it('shows an error toast and logs the failure', () => {
			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const err = new Error('unauthenticated');

			capturedMutationOptions.onError(err);

			expect(mockToastError).toHaveBeenCalledWith('Failed to set category. Please try again.');
			expect(consoleErrorSpy).toHaveBeenCalledWith('[SetPrimaryCategory] mutation failed:', err);
			consoleErrorSpy.mockRestore();
		});
	});
});
