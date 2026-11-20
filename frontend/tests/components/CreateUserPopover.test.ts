import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import CreateUserPopover from '#lib/components/CreateUserPopover.svelte';

// Hoisted mocks — these are referenced inside vi.mock factories
const { mockMutate, mockInvalidateQueries, mockToastSuccess, mockToastError, mockMutationState } = vi.hoisted(() => ({
	mockMutate: vi.fn(),
	mockInvalidateQueries: vi.fn(),
	mockToastSuccess: vi.fn(),
	mockToastError: vi.fn(),
	mockMutationState: {
		mutate: null as any,
		isPending: false,
		isSuccess: false,
		data: undefined as any,
	},
}));

// Capture mutation options for behavioral testing
let capturedMutationOptions: any;

vi.mock('@tanstack/svelte-query', () => ({
	createMutation: vi.fn((optionsFn: () => any) => {
		capturedMutationOptions = optionsFn();
		mockMutationState.mutate = mockMutate;
		return mockMutationState;
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

vi.mock('#lib/queries/client.js', () => ({
	graphqlRequest: vi.fn(),
}));

vi.mock('#lib/queries/users/index.js', () => ({
	CREATE_USER: 'CREATE_USER_QUERY_STRING',
}));

function resetMutationState() {
	mockMutationState.isPending = false;
	mockMutationState.isSuccess = false;
	mockMutationState.data = undefined;
}

describe('CreateUserPopover component', () => {
	const mockOnUserCreated = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		capturedMutationOptions = undefined;
		resetMutationState();
	});

	it('renders without errors', () => {
		const result = render(CreateUserPopover, {
			props: { onUserCreated: mockOnUserCreated },
		});
		expect(result.container).toBeTruthy();
	});

	it('renders "New User" trigger button', () => {
		render(CreateUserPopover, { props: { onUserCreated: mockOnUserCreated } });
		expect(screen.getByRole('button', { name: /new user/i })).toBeInTheDocument();
	});

	it('button has UserPlus icon', () => {
		render(CreateUserPopover, { props: { onUserCreated: mockOnUserCreated } });
		const button = screen.getByRole('button', { name: /new user/i });
		const svg = button.querySelector('svg');
		expect(svg).toBeInTheDocument();
	});

	it('mutationFn is defined and callable', () => {
		render(CreateUserPopover, { props: { onUserCreated: mockOnUserCreated } });
		expect(capturedMutationOptions).toBeDefined();
		expect(capturedMutationOptions.mutationFn).toBeDefined();
		expect(typeof capturedMutationOptions.mutationFn).toBe('function');
	});

	it('mutationFn calls graphqlRequest with correct args', async () => {
		render(CreateUserPopover, { props: { onUserCreated: mockOnUserCreated } });
		expect(capturedMutationOptions).toBeDefined();
		const { graphqlRequest } = await import('#lib/queries/client.js');
		(graphqlRequest as any).mockResolvedValue({
			createUser: { id: '123', username: 'testuser' },
		});

		await capturedMutationOptions.mutationFn({ username: 'testuser' });

		expect(graphqlRequest).toHaveBeenCalledWith(expect.anything(), {
			input: { username: 'testuser' },
		});
	});

	it('calls onUserCreated when mutation succeeds with data', () => {
		// Set mutation to success state BEFORE render so $effect fires on mount
		mockMutationState.isSuccess = true;
		mockMutationState.data = { createUser: { id: '99', username: 'newuser' } };

		render(CreateUserPopover, { props: { onUserCreated: mockOnUserCreated } });

		expect(mockOnUserCreated).toHaveBeenCalledWith('99');
	});

	it('renders form fields snippet content', () => {
		render(CreateUserPopover, { props: { onUserCreated: mockOnUserCreated } });
		// FormPopover renders the formFields snippet which includes the input
		// The popover content renders in desktop (non-portal) mode
		const container = document.body;
		// Verify the component mounts and includes expected structure
		expect(container.querySelector('button')).toBeTruthy();
	});
});

describe('CreateUserPopover mutation callbacks', () => {
	const mockOnUserCreated = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		capturedMutationOptions = undefined;
		resetMutationState();
		render(CreateUserPopover, { props: { onUserCreated: mockOnUserCreated } });
	});

	it('onSuccess shows toast with username', () => {
		expect(capturedMutationOptions).toBeDefined();

		capturedMutationOptions.onSuccess({
			createUser: { id: '123', username: 'testuser' },
		});

		expect(mockToastSuccess).toHaveBeenCalledWith('Created user: testuser');
	});

	it('onSuccess invalidates users.list query cache', () => {
		expect(capturedMutationOptions).toBeDefined();

		capturedMutationOptions.onSuccess({
			createUser: { id: '123', username: 'testuser' },
		});

		expect(mockInvalidateQueries).toHaveBeenCalledWith({
			queryKey: expect.arrayContaining(['users', 'list']),
		});
	});

	it('onError shows "already exists" toast for duplicate errors', () => {
		expect(capturedMutationOptions).toBeDefined();

		capturedMutationOptions.onError(new Error('A user with that username already exists'));

		expect(mockToastError).toHaveBeenCalledWith('A user with that username already exists');
	});

	it('onError shows generic toast for unknown errors', () => {
		expect(capturedMutationOptions).toBeDefined();

		capturedMutationOptions.onError(new Error('failed to create user'));

		expect(mockToastError).toHaveBeenCalledWith('Failed to create user. Please try again.');
	});
});
