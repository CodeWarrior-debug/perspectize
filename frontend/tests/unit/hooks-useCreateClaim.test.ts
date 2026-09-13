import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockMutate, mockInvalidateQueries, mockToastSuccess, mockToastError } = vi.hoisted(() => ({
	mockMutate: vi.fn(),
	mockInvalidateQueries: vi.fn(),
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

describe('useCreateClaim hook', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		capturedMutationOptions = undefined;
	});

	describe('hook initialization', () => {
		it('returns a mutation object with mutate method', async () => {
			const { useCreateClaim } = await import('$lib/queries/content/useCreateClaim');
			const mutation = useCreateClaim();
			expect(mutation).toBeDefined();
			expect(mutation.mutate).toBeDefined();
		});
	});

	describe('mutationFn', () => {
		it('is defined and callable', async () => {
			const { useCreateClaim } = await import('$lib/queries/content/useCreateClaim');
			useCreateClaim();
			expect(capturedMutationOptions).toBeDefined();
			expect(typeof capturedMutationOptions.mutationFn).toBe('function');
		});

		it('calls graphqlRequest with CREATE_CLAIM and input', async () => {
			const { useCreateClaim } = await import('$lib/queries/content/useCreateClaim');
			const { graphqlRequest } = await import('$lib/queries/client');
			useCreateClaim();

			(graphqlRequest as any).mockResolvedValue({
				createClaim: { id: '1', text: 'Test claim', userID: '42' },
			});

			const input = { text: 'Test claim', userID: 42, parentContentID: 10 };
			await capturedMutationOptions.mutationFn(input);

			expect(graphqlRequest).toHaveBeenCalledWith(expect.anything(), { input });
		});
	});

	describe('onSuccess callback', () => {
		beforeEach(async () => {
			const { useCreateClaim } = await import('$lib/queries/content/useCreateClaim');
			useCreateClaim();
		});

		it('shows success toast "Claim created"', () => {
			capturedMutationOptions.onSuccess();
			expect(mockToastSuccess).toHaveBeenCalledWith('Claim created');
		});

		it('invalidates content lists cache', () => {
			capturedMutationOptions.onSuccess();
			expect(mockInvalidateQueries).toHaveBeenCalledWith(
				expect.objectContaining({ queryKey: expect.arrayContaining(['content', 'list']) }),
			);
		});
	});

	describe('onError callback', () => {
		beforeEach(async () => {
			const { useCreateClaim } = await import('$lib/queries/content/useCreateClaim');
			useCreateClaim();
		});

		it('shows "Parent content not found" message for parent content not found errors', () => {
			capturedMutationOptions.onError(new Error('Parent content not found'));
			expect(mockToastError).toHaveBeenCalledWith('Parent content not found');
		});

		it('shows "Parent content not found" message case-insensitively', () => {
			capturedMutationOptions.onError(new Error('PARENT CONTENT NOT FOUND in the database'));
			expect(mockToastError).toHaveBeenCalledWith('Parent content not found');
		});

		it('shows "Invalid claim input" message for invalid input errors', () => {
			capturedMutationOptions.onError(new Error('invalid input: text too long'));
			expect(mockToastError).toHaveBeenCalledWith('Invalid claim input. Please check your entry.');
		});

		it('shows "Invalid claim input" message case-insensitively', () => {
			capturedMutationOptions.onError(new Error('INVALID INPUT format'));
			expect(mockToastError).toHaveBeenCalledWith('Invalid claim input. Please check your entry.');
		});

		it('shows generic message for unknown errors', () => {
			capturedMutationOptions.onError(new Error('network timeout'));
			expect(mockToastError).toHaveBeenCalledWith('Failed to create claim. Please try again.');
		});

		it('shows generic message for database errors', () => {
			capturedMutationOptions.onError(new Error('database connection failed'));
			expect(mockToastError).toHaveBeenCalledWith('Failed to create claim. Please try again.');
		});
	});

	describe('integration with queryClient and toasts', () => {
		beforeEach(async () => {
			const { useCreateClaim } = await import('$lib/queries/content/useCreateClaim');
			useCreateClaim();
		});

		it('calls both toast and invalidateQueries on success', () => {
			capturedMutationOptions.onSuccess();
			expect(mockToastSuccess).toHaveBeenCalled();
			expect(mockInvalidateQueries).toHaveBeenCalled();
		});

		it('only shows error toast on error (does not call invalidateQueries)', () => {
			capturedMutationOptions.onError(new Error('some error'));
			expect(mockToastError).toHaveBeenCalled();
			expect(mockInvalidateQueries).not.toHaveBeenCalled();
		});
	});
});
