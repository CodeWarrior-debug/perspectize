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

describe('useAddMovie hook', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		capturedMutationOptions = undefined;
		const { useAddMovie } = await import('$lib/queries/content/useAddMovie');
		useAddMovie();
	});

	it('sends the url through the authenticated graphqlRequest wrapper', async () => {
		mockGraphqlRequest.mockResolvedValue({});
		const { CREATE_CONTENT_FROM_MOVIE } = await import('$lib/queries/content');
		await capturedMutationOptions.mutationFn('tt0133093');
		expect(mockGraphqlRequest).toHaveBeenCalledWith(CREATE_CONTENT_FROM_MOVIE, { input: { url: 'tt0133093' } });
	});

	it('toasts the added title with a "Go to movie" action that opens it on Activity', async () => {
		const { goto } = await import('$app/navigation');
		capturedMutationOptions.onSuccess({
			createContentFromMovie: { id: '42', name: 'The Matrix', contentType: 'MOVIE' },
		});
		expect(mockToastSuccess).toHaveBeenCalledWith('Added: The Matrix', {
			action: { label: 'Go to movie', onClick: expect.any(Function) },
		});
		mockToastSuccess.mock.calls[0][1].action.onClick();
		expect(goto).toHaveBeenCalledWith('/?open=42');
	});

	it('falls back to a generic label and no action when the response has no row', () => {
		capturedMutationOptions.onSuccess({ createContentFromMovie: null });
		expect(mockToastSuccess).toHaveBeenCalledWith('Added: movie', { action: undefined });
	});

	it('refetches content lists (no blind prepend: find-or-create can return an existing row)', () => {
		capturedMutationOptions.onSuccess({ createContentFromMovie: { id: '1', name: 'X' } });
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

		it('invalid movie URL', () => {
			capturedMutationOptions.onError(new Error('invalid movie URL: foo'));
			expect(mockToastError).toHaveBeenCalledWith('Invalid movie link or movie not found');
		});

		it('movie not found', () => {
			capturedMutationOptions.onError(new Error('movie not found'));
			expect(mockToastError).toHaveBeenCalledWith('Invalid movie link or movie not found');
		});

		it('auth errors', () => {
			capturedMutationOptions.onError(new Error('Authentication required'));
			expect(mockToastError).toHaveBeenCalledWith('Please sign in to add a movie');
			capturedMutationOptions.onError(new Error('access denied'));
			expect(mockToastError).toHaveBeenCalledTimes(2);
		});

		it('generic failure', () => {
			capturedMutationOptions.onError(new Error('boom'));
			expect(mockToastError).toHaveBeenCalledWith('Failed to add movie. Please try again.');
		});

		it('logs the raw error', () => {
			const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const err = new Error('boom');
			capturedMutationOptions.onError(err);
			expect(spy).toHaveBeenCalledWith('[AddMovie] mutation failed:', err);
			spy.mockRestore();
		});
	});
});
