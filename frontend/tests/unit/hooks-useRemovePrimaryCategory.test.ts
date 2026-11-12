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
	// Deliberately no `graphqlClient` export — if the hook falls back to the
	// raw unauthenticated client, this mock throws instead of silently
	// resolving, so a regression fails loudly (see useSetPrimaryCategory's
	// equivalent gotcha).
}));

describe('useRemovePrimaryCategory hook', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		capturedMutationOptions = undefined;
		const { useRemovePrimaryCategory } = await import('$lib/queries/hooks/useRemovePrimaryCategory');
		useRemovePrimaryCategory();
	});

	it('sends the mutation through the authenticated graphqlRequest wrapper with the contentId variable', async () => {
		mockGraphqlRequest.mockResolvedValue({
			removePrimaryCategory: { id: '1', name: 'Video', primaryCategory: null },
		});

		await capturedMutationOptions.mutationFn(42);

		expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
		const [, variables] = mockGraphqlRequest.mock.calls[0];
		expect(variables).toEqual({ contentId: 42 });
	});

	describe('onSuccess', () => {
		it('shows a success toast and invalidates content lists', () => {
			capturedMutationOptions.onSuccess();

			expect(mockToastSuccess).toHaveBeenCalledWith('Category removed');
			expect(mockInvalidateQueries).toHaveBeenCalled();
		});
	});

	describe('onError', () => {
		it('shows an error toast and logs the failure', () => {
			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const err = new Error('not authorized');

			capturedMutationOptions.onError(err);

			expect(mockToastError).toHaveBeenCalledWith('Failed to remove category. Please try again.');
			expect(consoleErrorSpy).toHaveBeenCalledWith('[RemovePrimaryCategory] mutation failed:', err);
			consoleErrorSpy.mockRestore();
		});
	});
});
