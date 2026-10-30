import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	mockInvalidateQueries: vi.fn(),
	mockSetQueriesData: vi.fn(),
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
	useQueryClient: vi.fn(() => ({
		invalidateQueries: mocks.mockInvalidateQueries,
		setQueriesData: mocks.mockSetQueriesData,
	})),
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

	it('toasts success and patches the title in place (no refetch) when our title was stored', () => {
		capturedMutationOptions.onSuccess(
			{ setPassageDisplayTitle: { id: '7', displayTitle: 'Creation' } },
			{ contentID: '7', title: ' Creation ' },
		);

		expect(mocks.mockToastSuccess).toHaveBeenCalledWith('Title saved');
		expect(mocks.mockToastInfo).not.toHaveBeenCalled();
		expect(mocks.mockSetQueriesData).toHaveBeenCalledWith({ queryKey: ['app', 'content'] }, expect.any(Function));
		expect(mocks.mockInvalidateQueries).not.toHaveBeenCalled();
	});

	it('tells the user when another title won (first-write-wins) and patches in the winner', () => {
		capturedMutationOptions.onSuccess(
			{ setPassageDisplayTitle: { id: '7', displayTitle: 'Genesis Creation' } },
			{ contentID: '7', title: 'Creation' },
		);

		expect(mocks.mockToastInfo).toHaveBeenCalled();
		expect(mocks.mockToastSuccess).not.toHaveBeenCalled();
		const updater = mocks.mockSetQueriesData.mock.calls[0][1];
		const patched = updater({ content: { items: [{ id: '7', displayTitle: null }] } });
		expect(patched.content.items[0].displayTitle).toBe('Genesis Creation');
	});

	it('withDisplayTitle patches lists and rows, and leaves other shapes untouched', async () => {
		const { withDisplayTitle } = await import('$lib/queries/bible/useSetPassageDisplayTitle');
		const list = {
			content: {
				items: [
					{ id: '7', displayTitle: null },
					{ id: '8', displayTitle: 'x' },
				],
			},
		};
		const patchedList = withDisplayTitle(list, '7', 'T') as typeof list;
		expect(patchedList.content.items[0].displayTitle).toBe('T');
		expect(patchedList.content.items[1]).toBe(list.content.items[1]);

		const other = { content: { items: [{ id: '9' }] } };
		expect(withDisplayTitle(other, '7', 'T')).toBe(other);

		const row = { contentByID: { id: '7', displayTitle: null, name: 'Gen 1' } };
		expect((withDisplayTitle(row, '7', 'T') as typeof row).contentByID.displayTitle).toBe('T');

		const aggregates = { contentByID: { id: '7', perspectiveCount: 2 } };
		expect(withDisplayTitle(aggregates, '7', 'T')).toBe(aggregates);
		expect(withDisplayTitle(undefined, '7', 'T')).toBeUndefined();
	});

	it('toasts an error on failure', () => {
		capturedMutationOptions.onError(new Error('boom'));
		expect(mocks.mockToastError).toHaveBeenCalled();
	});
});
