import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	mockInvalidateQueries: vi.fn(),
	mockToastSuccess: vi.fn(),
	mockToastInfo: vi.fn(),
	mockToastError: vi.fn(),
}));

let capturedMutationOptions: any;

vi.mock('@tanstack/svelte-query', () => ({
	createMutation: vi.fn((optionsFn: () => any) => {
		capturedMutationOptions = optionsFn();
		return { mutate: vi.fn(), isPending: false };
	}),
	useQueryClient: vi.fn(() => ({ invalidateQueries: mocks.mockInvalidateQueries })),
}));

vi.mock('svelte-sonner', () => ({
	toast: { success: mocks.mockToastSuccess, info: mocks.mockToastInfo, error: mocks.mockToastError },
}));

vi.mock('$lib/queries/client', () => ({ graphqlRequest: vi.fn() }));

describe('useSetPassageDisplayTitle', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		const { useSetPassageDisplayTitle } = await import('$lib/queries/bible/useSetPassageDisplayTitle');
		useSetPassageDisplayTitle();
	});

	it('sends the input through the authenticated graphqlRequest wrapper', async () => {
		const { graphqlRequest } = await import('$lib/queries/client');
		(graphqlRequest as any).mockResolvedValue({ setPassageDisplayTitle: { id: '7', displayTitle: 'Creation' } });

		const input = { contentID: '7', title: 'Creation' };
		await capturedMutationOptions.mutationFn(input);

		expect(graphqlRequest).toHaveBeenCalledWith(expect.stringContaining('setPassageDisplayTitle'), { input });
	});

	it('toasts success and refreshes content when our title was stored', () => {
		capturedMutationOptions.onSuccess(
			{ setPassageDisplayTitle: { id: '7', displayTitle: 'Creation' } },
			{ contentID: '7', title: ' Creation ' },
		);

		expect(mocks.mockToastSuccess).toHaveBeenCalledWith('Title saved');
		expect(mocks.mockToastInfo).not.toHaveBeenCalled();
		expect(mocks.mockInvalidateQueries).toHaveBeenCalled();
	});

	it('tells the user when another title won (first-write-wins) and still refreshes', () => {
		capturedMutationOptions.onSuccess(
			{ setPassageDisplayTitle: { id: '7', displayTitle: 'Genesis Creation' } },
			{ contentID: '7', title: 'Creation' },
		);

		expect(mocks.mockToastInfo).toHaveBeenCalled();
		expect(mocks.mockToastSuccess).not.toHaveBeenCalled();
		expect(mocks.mockInvalidateQueries).toHaveBeenCalled();
	});

	it('toasts an error on failure', () => {
		capturedMutationOptions.onError(new Error('boom'));
		expect(mocks.mockToastError).toHaveBeenCalled();
	});
});
