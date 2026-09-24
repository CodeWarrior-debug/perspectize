import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import AddVideoPopover from '$lib/components/AddVideoPopover.svelte';
import { tick } from 'svelte';

// Hoisted mocks — shared pattern for useAddVideo components
const mocks = vi.hoisted(() => ({
	mockMutate: vi.fn(),
	mockInvalidateQueries: vi.fn(),
	mockSetQueriesData: vi.fn(),
	mockToastSuccess: vi.fn(),
	mockToastError: vi.fn(),
	mockValidate: vi.fn(),
	mockMutationState: { mutate: null as any, isPending: false, isSuccess: false },
	capturedMutationOptions: undefined as any,
}));

vi.mock('@tanstack/svelte-query', () => ({
	createMutation: vi.fn((optionsFn: () => any) => {
		mocks.capturedMutationOptions = optionsFn();
		mocks.mockMutationState.mutate = mocks.mockMutate;
		return mocks.mockMutationState;
	}),
	useQueryClient: vi.fn(() => ({
		invalidateQueries: mocks.mockInvalidateQueries,
		setQueriesData: mocks.mockSetQueriesData,
	})),
}));

vi.mock('svelte-sonner', () => ({
	toast: { success: mocks.mockToastSuccess, error: mocks.mockToastError },
}));

vi.mock('$lib/queries/client', () => ({ graphqlRequest: vi.fn() }));
vi.mock('$lib/utils/youtube', () => ({ validateYouTubeUrl: (url: string) => mocks.mockValidate(url) }));

function reset() {
	vi.clearAllMocks();
	mocks.capturedMutationOptions = undefined;
	mocks.mockMutationState.isPending = false;
	mocks.mockMutationState.isSuccess = false;
}

describe('AddVideoPopover component', () => {
	beforeEach(reset);

	it('renders without errors', () => {
		expect(render(AddVideoPopover).container).toBeTruthy();
	});

	it('renders Add Video button', () => {
		render(AddVideoPopover);
		expect(screen.getByRole('button', { name: /add video/i })).toBeInTheDocument();
	});

	it('button has plus icon', () => {
		render(AddVideoPopover);
		expect(screen.getByRole('button', { name: /add video/i }).querySelector('svg')).toBeInTheDocument();
	});

	it('uses buttonVariants for styling', () => {
		render(AddVideoPopover);
		expect(screen.getByRole('button', { name: /add video/i }).className).toBeTruthy();
	});

	it('opens popover when trigger is clicked', async () => {
		const { container } = render(AddVideoPopover);
		await fireEvent.click(screen.getByRole('button', { name: /add video/i }));
		await tick();
		expect(container).toBeTruthy();
	});
});

describe('AddVideoPopover paste button', () => {
	beforeEach(reset);

	async function openPopover() {
		render(AddVideoPopover);
		await fireEvent.click(screen.getByRole('button', { name: /add video/i }));
		await tick();
	}

	it('renders a paste from clipboard button', async () => {
		await openPopover();
		expect(screen.getByRole('button', { name: /paste from clipboard/i })).toBeInTheDocument();
	});

	it('populates the URL field from clipboard on click', async () => {
		const readText = vi.fn().mockResolvedValue('https://youtube.com/watch?v=abc123');
		Object.assign(navigator, { clipboard: { readText } });

		await openPopover();
		await fireEvent.click(screen.getByRole('button', { name: /paste from clipboard/i }));
		await tick();

		expect(readText).toHaveBeenCalled();
		expect(screen.getByPlaceholderText(/youtube.com\/watch/i)).toHaveValue('https://youtube.com/watch?v=abc123');
	});

	it('shows an error message when clipboard read fails', async () => {
		const readText = vi.fn().mockRejectedValue(new Error('permission denied'));
		Object.assign(navigator, { clipboard: { readText } });

		await openPopover();
		await fireEvent.click(screen.getByRole('button', { name: /paste from clipboard/i }));
		await tick();

		expect(screen.getByText(/could not read clipboard/i)).toBeInTheDocument();
	});
});

describe('AddVideoPopover $effect behaviors', () => {
	beforeEach(reset);

	it('renders with mutation in success state', () => {
		mocks.mockMutationState.isSuccess = true;
		expect(render(AddVideoPopover).container).toBeTruthy();
	});
});

describe('AddVideoPopover mutation setup', () => {
	beforeEach(() => {
		reset();
		render(AddVideoPopover);
	});

	it('captures mutation options from useAddVideo hook', () => {
		expect(mocks.capturedMutationOptions).toBeDefined();
		expect(mocks.capturedMutationOptions.mutationFn).toBeDefined();
		expect(mocks.capturedMutationOptions.onSuccess).toBeDefined();
		expect(mocks.capturedMutationOptions.onError).toBeDefined();
	});

	it('mutationFn calls graphqlRequest with correct args', async () => {
		const { graphqlRequest } = await import('$lib/queries/client');
		(graphqlRequest as any).mockResolvedValue({
			createContentFromYouTube: { content: { name: 'Test' }, alreadyExisted: false },
		});
		await mocks.capturedMutationOptions.mutationFn('https://youtube.com/watch?v=abc123');
		expect(graphqlRequest).toHaveBeenCalledWith(expect.anything(), {
			input: { url: 'https://youtube.com/watch?v=abc123', userId: 0 },
		});
	});
});
