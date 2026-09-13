import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import AddVideoDialog from '$lib/components/AddVideoDialog.svelte';

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

describe('AddVideoDialog component', () => {
	beforeEach(reset);

	it('renders without errors when open', () => {
		expect(render(AddVideoDialog, { props: { open: true } }).container).toBeTruthy();
	});

	it('renders without errors when closed', () => {
		expect(render(AddVideoDialog, { props: { open: false } }).container).toBeTruthy();
	});

	it('accepts no props', () => {
		expect(render(AddVideoDialog)).toBeTruthy();
	});
});

describe('AddVideoDialog $effect behaviors', () => {
	beforeEach(reset);

	it('renders with mutation in success state', () => {
		mocks.mockMutationState.isSuccess = true;
		expect(render(AddVideoDialog, { props: { open: true } }).container).toBeTruthy();
	});
});

describe('AddVideoDialog mutation setup', () => {
	beforeEach(() => {
		reset();
		render(AddVideoDialog, { props: { open: true } });
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
