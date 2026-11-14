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

vi.mock('$lib/queries/client', () => ({ graphqlRequest: mockGraphqlRequest }));

describe('useAddBook hook', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		capturedMutationOptions = undefined;
		const { useAddBook } = await import('$lib/queries/content/useAddBook');
		useAddBook();
	});

	it('sends the url through the authenticated graphqlRequest wrapper', async () => {
		mockGraphqlRequest.mockResolvedValue({});
		const { CREATE_CONTENT_FROM_BOOK } = await import('$lib/queries/content');
		await capturedMutationOptions.mutationFn('https://openlibrary.org/works/OL23166W');
		expect(mockGraphqlRequest).toHaveBeenCalledWith(CREATE_CONTENT_FROM_BOOK, {
			input: { url: 'https://openlibrary.org/works/OL23166W' },
		});
	});

	it('sends a raw ISBN as the url, for the server to resolve', async () => {
		mockGraphqlRequest.mockResolvedValue({});
		const { CREATE_CONTENT_FROM_BOOK } = await import('$lib/queries/content');
		await capturedMutationOptions.mutationFn('9780434740024');
		expect(mockGraphqlRequest).toHaveBeenCalledWith(CREATE_CONTENT_FROM_BOOK, { input: { url: '9780434740024' } });
	});

	it('toasts the added title with a "Go to book" action that opens it on Activity', async () => {
		const { goto } = await import('$app/navigation');
		capturedMutationOptions.onSuccess({
			createContentFromBook: { id: '42', name: 'East of Eden', url: null, contentType: 'BOOK' },
		});
		expect(mockToastSuccess).toHaveBeenCalledWith('Added: East of Eden', {
			action: { label: 'Go to book', onClick: expect.any(Function) },
		});
		mockToastSuccess.mock.calls[0][1].action.onClick();
		expect(goto).toHaveBeenCalledWith('/content-library?open=42');
	});

	it('falls back to a generic label and no action when the response has no row', () => {
		capturedMutationOptions.onSuccess({ createContentFromBook: null });
		expect(mockToastSuccess).toHaveBeenCalledWith('Added: book', { action: undefined });
	});

	it('refetches content lists (no blind prepend: find-or-create can return an existing row)', () => {
		capturedMutationOptions.onSuccess({ createContentFromBook: { id: '1', name: 'X' } });
		expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);
	});

	describe('onError', () => {
		it('network errors', () => {
			capturedMutationOptions.onError(new Error('Failed to fetch'));
			expect(mockToastError).toHaveBeenCalledWith('Cannot reach the server. Check your connection and try again.');
		});

		it('load failed', () => {
			capturedMutationOptions.onError(new Error('load failed'));
			expect(mockToastError).toHaveBeenCalledWith('Cannot reach the server. Check your connection and try again.');
		});

		it('invalid book link or unknown book', () => {
			capturedMutationOptions.onError(new Error('invalid book URL: foo'));
			expect(mockToastError).toHaveBeenLastCalledWith('Invalid book link or book not found');
			capturedMutationOptions.onError(new Error('book not found'));
			expect(mockToastError).toHaveBeenLastCalledWith('Invalid book link or book not found');
		});

		it('auth errors', () => {
			capturedMutationOptions.onError(new Error('Authentication required'));
			expect(mockToastError).toHaveBeenLastCalledWith('Please sign in to add a book');
			capturedMutationOptions.onError(new Error('access denied'));
			expect(mockToastError).toHaveBeenLastCalledWith('Please sign in to add a book');
			expect(mockToastError).toHaveBeenCalledTimes(2);
		});

		it('generic failure', () => {
			capturedMutationOptions.onError(new Error('boom'));
			expect(mockToastError).toHaveBeenCalledWith('Failed to add book. Please try again.');
		});

		it('CONTENT_NOT_ALLOWED toasts the server message verbatim', () => {
			const err = Object.assign(new Error('While Perspectize ...: {"response":{}}'), {
				response: { errors: [{ message: 'No NSFW yet.', extensions: { code: 'CONTENT_NOT_ALLOWED' } }] },
			});
			capturedMutationOptions.onError(err);
			expect(mockToastError).toHaveBeenCalledWith('No NSFW yet.');
		});

		it('logs the raw error', () => {
			const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const err = new Error('boom');
			capturedMutationOptions.onError(err);
			expect(spy).toHaveBeenCalledWith('[AddBook] mutation failed:', err);
			spy.mockRestore();
		});
	});
});
