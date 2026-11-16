import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockInvalidateQueries, mockToastSuccess, mockToastError, mockGraphqlRequest } = vi.hoisted(() => ({
	mockInvalidateQueries: vi.fn(),
	mockToastSuccess: vi.fn(),
	mockToastError: vi.fn(),
	mockGraphqlRequest: vi.fn(),
}));

let capturedMutationOptions: any;

vi.mock('@tanstack/svelte-query', () => ({
	createMutation: vi.fn((optionsFn: () => any) => {
		capturedMutationOptions = optionsFn();
		return { mutate: vi.fn(), isPending: false };
	}),
	useQueryClient: vi.fn(() => ({ invalidateQueries: mockInvalidateQueries })),
}));

vi.mock('svelte-sonner', () => ({
	toast: { success: mockToastSuccess, error: mockToastError },
}));

// Only the authenticated wrapper is exported here: a hook that reached for the bare
// `graphqlClient` would get `undefined` and fail its request.
vi.mock('$lib/queries/client', () => ({ graphqlRequest: mockGraphqlRequest }));

describe('useCreateWebPage hook', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		capturedMutationOptions = undefined;
		const { useCreateWebPage } = await import('$lib/queries/content/useCreateWebPage');
		useCreateWebPage();
	});

	it('sends the url through the authenticated graphqlRequest wrapper', async () => {
		mockGraphqlRequest.mockResolvedValue({});
		const { CREATE_CONTENT_FROM_WEB_PAGE } = await import('$lib/queries/content');
		await capturedMutationOptions.mutationFn({ url: 'https://arxiv.org/abs/1706.03762' });
		expect(mockGraphqlRequest).toHaveBeenCalledWith(CREATE_CONTENT_FROM_WEB_PAGE, {
			input: { url: 'https://arxiv.org/abs/1706.03762' },
		});
	});

	it('omits webPageRoles when the adder picked none (undefined or empty), so the server stores a plain webpage', async () => {
		mockGraphqlRequest.mockResolvedValue({});
		await capturedMutationOptions.mutationFn({ url: 'https://example.com/a' });
		await capturedMutationOptions.mutationFn({ url: 'https://example.com/a', webPageRoles: [] });
		for (const call of mockGraphqlRequest.mock.calls) {
			expect(call[1].input).not.toHaveProperty('webPageRoles');
		}
	});

	it('sends the roles in pick order when at least one is picked; the first is the primary role', async () => {
		mockGraphqlRequest.mockResolvedValue({});
		await capturedMutationOptions.mutationFn({
			url: 'https://example.com/a',
			webPageRoles: ['SESSION_TRANSCRIPT', 'BLOG_POST'],
		});
		expect(mockGraphqlRequest.mock.calls[0][1].input).toEqual({
			url: 'https://example.com/a',
			webPageRoles: ['SESSION_TRANSCRIPT', 'BLOG_POST'],
		});
	});

	it('toasts the added title with a "Go to webpage" action that opens it on Activity', async () => {
		const { goto } = await import('$app/navigation');
		capturedMutationOptions.onSuccess({
			createContentFromWebPage: {
				content: { id: '42', name: 'Attention Is All You Need', url: null, contentType: 'WEB_PAGE' },
				alreadyExisted: false,
			},
		});
		expect(mockToastSuccess).toHaveBeenCalledWith('Added: Attention Is All You Need', {
			action: { label: 'Go to webpage', onClick: expect.any(Function) },
		});
		mockToastSuccess.mock.calls[0][1].action.onClick();
		expect(goto).toHaveBeenCalledWith('/content-library?open=42');
	});

	it('says "Already saved" when the server returns an existing row', () => {
		capturedMutationOptions.onSuccess({
			createContentFromWebPage: {
				content: { id: '7', name: 'Old title', url: null, contentType: 'WEB_PAGE' },
				alreadyExisted: true,
			},
		});
		expect(mockToastSuccess).toHaveBeenCalledWith('Already saved: Old title', expect.any(Object));
	});

	it('refetches content lists, exactly as the movie add does', async () => {
		const { queryKeys } = await import('$lib/queries/keys');
		capturedMutationOptions.onSuccess({
			createContentFromWebPage: { content: { id: '1', name: 'X' }, alreadyExisted: false },
		});
		expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);
		expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.content.lists() });
	});

	it('network errors say the server could not be reached', () => {
		capturedMutationOptions.onError(new Error('Failed to fetch'));
		expect(mockToastError).toHaveBeenCalledWith('Cannot reach the server. Check your connection and try again.');
	});

	it('any other failure gets the generic webpage message', () => {
		capturedMutationOptions.onError(new Error('boom'));
		expect(mockToastError).toHaveBeenCalledWith('Failed to add webpage. Please try again.');
	});
});
