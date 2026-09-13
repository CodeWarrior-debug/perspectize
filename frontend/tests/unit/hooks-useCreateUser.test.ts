import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks — these are referenced inside vi.mock factories
const { mockMutate, mockInvalidateQueries, mockToastSuccess, mockToastError } = vi.hoisted(() => ({
	mockMutate: vi.fn(),
	mockInvalidateQueries: vi.fn(),
	mockToastSuccess: vi.fn(),
	mockToastError: vi.fn(),
}));

// Capture mutation options for behavioral testing
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

describe('useCreateUser hook', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		capturedMutationOptions = undefined;
	});

	describe('hook initialization', () => {
		it('returns a mutation object with mutate method', async () => {
			const { useCreateUser } = await import('$lib/queries/users/useCreateUser');
			const mutation = useCreateUser();

			expect(mutation).toBeDefined();
			expect(mutation.mutate).toBeDefined();
			expect(typeof mutation.mutate).toBe('function');
		});

		it('calls createMutation with a function that returns options', async () => {
			const { createMutation } = await import('@tanstack/svelte-query');
			const { useCreateUser } = await import('$lib/queries/users/useCreateUser');

			useCreateUser();

			expect(createMutation).toHaveBeenCalled();
			// Verify createMutation receives a function
			const call = (createMutation as any).mock.calls[0];
			expect(typeof call[0]).toBe('function');
		});

		it('captures mutation options via createMutation factory', async () => {
			const { useCreateUser } = await import('$lib/queries/users/useCreateUser');
			useCreateUser();

			expect(capturedMutationOptions).toBeDefined();
		});
	});

	describe('mutationFn', () => {
		beforeEach(async () => {
			const { useCreateUser } = await import('$lib/queries/users/useCreateUser');
			useCreateUser();
		});

		it('is defined and callable', () => {
			expect(capturedMutationOptions).toBeDefined();
			expect(capturedMutationOptions.mutationFn).toBeDefined();
			expect(typeof capturedMutationOptions.mutationFn).toBe('function');
		});

		it('calls graphqlRequest with CREATE_USER and input params', async () => {
			const { graphqlRequest } = await import('$lib/queries/client');
			(graphqlRequest as any).mockResolvedValue({
				createUser: { id: '1', username: 'testuser' },
			});

			const input = { username: 'testuser' };
			await capturedMutationOptions.mutationFn(input);

			expect(graphqlRequest).toHaveBeenCalledWith(expect.anything(), { input });
		});

		it('passes the full CREATE_USER mutation document', async () => {
			const { graphqlRequest } = await import('$lib/queries/client');
			const { CREATE_USER } = await import('$lib/queries/users');
			(graphqlRequest as any).mockResolvedValue({
				createUser: { id: '1', username: 'testuser' },
			});

			const input = { username: 'testuser' };
			await capturedMutationOptions.mutationFn(input);

			const firstArg = (graphqlRequest as any).mock.calls[0][0];
			expect(firstArg).toBeDefined();
			expect(firstArg).toBe(CREATE_USER);
		});

		it('returns the response from graphqlRequest', async () => {
			const { graphqlRequest } = await import('$lib/queries/client');
			const mockResponse = { createUser: { id: '42', username: 'newuser' } };
			(graphqlRequest as any).mockResolvedValue(mockResponse);

			const input = { username: 'newuser' };
			const result = await capturedMutationOptions.mutationFn(input);

			expect(result).toEqual(mockResponse);
		});
	});

	describe('onSuccess callback', () => {
		beforeEach(async () => {
			const { useCreateUser } = await import('$lib/queries/users/useCreateUser');
			useCreateUser();
		});

		it('is defined and callable', () => {
			expect(capturedMutationOptions).toBeDefined();
			expect(capturedMutationOptions.onSuccess).toBeDefined();
			expect(typeof capturedMutationOptions.onSuccess).toBe('function');
		});

		it('shows success toast with username from response', () => {
			const mockData = { createUser: { id: '1', username: 'johndoe' } };

			capturedMutationOptions.onSuccess(mockData);

			expect(mockToastSuccess).toHaveBeenCalledWith('Created user: johndoe');
		});

		it('shows success toast with different username', () => {
			const mockData = { createUser: { id: '2', username: 'janedoe' } };

			capturedMutationOptions.onSuccess(mockData);

			expect(mockToastSuccess).toHaveBeenCalledWith('Created user: janedoe');
		});

		it('invalidates queryKeys.users.list() after successful creation', () => {
			const mockData = { createUser: { id: '1', username: 'testuser' } };

			capturedMutationOptions.onSuccess(mockData);

			expect(mockInvalidateQueries).toHaveBeenCalledWith({
				queryKey: ['app', 'users', 'list'],
			});
		});

		it('invalidates cache even when toast message is shown', () => {
			const mockData = { createUser: { id: '1', username: 'user' } };

			capturedMutationOptions.onSuccess(mockData);

			expect(mockToastSuccess).toHaveBeenCalled();
			expect(mockInvalidateQueries).toHaveBeenCalled();
		});
	});

	describe('onError callback', () => {
		beforeEach(async () => {
			const { useCreateUser } = await import('$lib/queries/users/useCreateUser');
			useCreateUser();
		});

		it('is defined and callable', () => {
			expect(capturedMutationOptions).toBeDefined();
			expect(capturedMutationOptions.onError).toBeDefined();
			expect(typeof capturedMutationOptions.onError).toBe('function');
		});

		it('shows "already exists" toast for duplicate username errors', () => {
			const error = new Error('user already exists');

			capturedMutationOptions.onError(error);

			expect(mockToastError).toHaveBeenCalledWith('A user with that username already exists');
		});

		it('matches "already exists" case-insensitively', () => {
			const error = new Error('User ALREADY EXISTS in the database');

			capturedMutationOptions.onError(error);

			expect(mockToastError).toHaveBeenCalledWith('A user with that username already exists');
		});

		it('shows generic error toast for unknown errors', () => {
			const error = new Error('connection timeout');

			capturedMutationOptions.onError(error);

			expect(mockToastError).toHaveBeenCalledWith('Failed to create user. Please try again.');
		});

		it('shows generic error toast for validation errors', () => {
			const error = new Error('invalid email format');

			capturedMutationOptions.onError(error);

			expect(mockToastError).toHaveBeenCalledWith('Failed to create user. Please try again.');
		});

		it('shows generic error toast for network errors', () => {
			const error = new Error('network error occurred');

			capturedMutationOptions.onError(error);

			expect(mockToastError).toHaveBeenCalledWith('Failed to create user. Please try again.');
		});

		it('handles error messages with extra whitespace', () => {
			const error = new Error('   already exists   ');

			capturedMutationOptions.onError(error);

			expect(mockToastError).toHaveBeenCalledWith('A user with that username already exists');
		});
	});

	describe('integration with queryClient and toasts', () => {
		beforeEach(async () => {
			const { useCreateUser } = await import('$lib/queries/users/useCreateUser');
			useCreateUser();
		});

		it('calls both toast and invalidateQueries on success', () => {
			const mockData = { createUser: { id: '1', username: 'testuser' } };

			capturedMutationOptions.onSuccess(mockData);

			expect(mockToastSuccess).toHaveBeenCalled();
			expect(mockInvalidateQueries).toHaveBeenCalled();
		});

		it('only shows error toast on error (does not call invalidateQueries)', () => {
			const error = new Error('some error');

			capturedMutationOptions.onError(error);

			expect(mockToastError).toHaveBeenCalled();
			expect(mockInvalidateQueries).not.toHaveBeenCalled();
		});

		it('useQueryClient is called to get queryClient instance', async () => {
			const { useQueryClient } = await import('@tanstack/svelte-query');

			expect(useQueryClient).toHaveBeenCalled();
		});
	});

	describe('mutation input handling', () => {
		beforeEach(async () => {
			const { useCreateUser } = await import('$lib/queries/users/useCreateUser');
			useCreateUser();
		});

		it('accepts CreateUserInput with username only', async () => {
			const { graphqlRequest } = await import('$lib/queries/client');
			(graphqlRequest as any).mockResolvedValue({
				createUser: { id: '1', username: 'testuser' },
			});

			const input = { username: 'testuser' };
			await capturedMutationOptions.mutationFn(input);

			expect(graphqlRequest).toHaveBeenCalledWith(expect.anything(), { input: { username: 'testuser' } });
		});

		it('accepts CreateUserInput with username and email', async () => {
			const { graphqlRequest } = await import('$lib/queries/client');
			(graphqlRequest as any).mockResolvedValue({
				createUser: { id: '1', username: 'testuser' },
			});

			const input = { username: 'testuser', email: 'test@example.com' };
			await capturedMutationOptions.mutationFn(input);

			expect(graphqlRequest).toHaveBeenCalledWith(expect.anything(), {
				input: { username: 'testuser', email: 'test@example.com' },
			});
		});
	});
});
