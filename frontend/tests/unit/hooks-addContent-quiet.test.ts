import { describe, it, expect, vi, beforeEach } from 'vitest';
import { preloadLazy } from '../helpers/warmUp';

const { mockInvalidateQueries, mockSetQueriesData, mockToast, mockGoto } = vi.hoisted(() => ({
	mockInvalidateQueries: vi.fn(),
	mockSetQueriesData: vi.fn(),
	mockToast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
	mockGoto: vi.fn(),
}));

let capturedMutationOptions: any;

vi.mock('@tanstack/svelte-query', () => ({
	createMutation: vi.fn((optionsFn: () => any) => {
		capturedMutationOptions = optionsFn();
		return { mutate: vi.fn(), isPending: false };
	}),
	useQueryClient: vi.fn(() => ({
		invalidateQueries: mockInvalidateQueries,
		setQueriesData: mockSetQueriesData,
	})),
}));

vi.mock('svelte-sonner', () => ({ toast: mockToast }));
vi.mock('$app/navigation', () => ({ goto: mockGoto }));
vi.mock('#lib/queries/client.js', () => ({ graphqlRequest: vi.fn() }));

preloadLazy(
	() => import('#lib/queries/content/useAddVideo.js'),
	() => import('#lib/queries/content/useAddMovie.js'),
	() => import('#lib/queries/content/useAddBook.js'),
	() => import('#lib/queries/content/useAddPassage.js'),
	() => import('#lib/queries/content/useCreateWebPage.js'),
);

const CASES = [
	{
		name: 'useAddVideo',
		load: () => import('#lib/queries/content/useAddVideo.js').then((m) => m.useAddVideo),
		data: { createContentFromYouTube: { alreadyExisted: true, content: { id: '9', name: 'v' } } },
	},
	{
		name: 'useAddMovie',
		load: () => import('#lib/queries/content/useAddMovie.js').then((m) => m.useAddMovie),
		data: { createContentFromMovie: { id: '9', name: 'm' } },
	},
	{
		name: 'useAddBook',
		load: () => import('#lib/queries/content/useAddBook.js').then((m) => m.useAddBook),
		data: { createContentFromBook: { id: '9', name: 'b' } },
	},
	{
		name: 'useAddPassage',
		load: () => import('#lib/queries/content/useAddPassage.js').then((m) => m.useAddPassage),
		data: { createContentFromPassage: { id: '9', name: 'p' } },
	},
	{
		name: 'useCreateWebPage',
		load: () => import('#lib/queries/content/useCreateWebPage.js').then((m) => m.useCreateWebPage),
		data: { createContentFromWebPage: { alreadyExisted: false, content: { id: '9', name: 'w' } } },
	},
] as const;

describe.each(CASES)('$name quiet option', ({ load, data }) => {
	beforeEach(() => {
		vi.clearAllMocks();
		capturedMutationOptions = undefined;
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	it('toasts on success and error by default', async () => {
		const hook = await load();
		hook();
		capturedMutationOptions.onSuccess(data);
		capturedMutationOptions.onError(new Error('boom'));
		expect(
			mockToast.success.mock.calls.length + mockToast.warning.mock.calls.length,
		).toBeGreaterThan(0);
		expect(mockToast.error).toHaveBeenCalled();
	});

	it('does not toast on success when quiet, but still refreshes the lists', async () => {
		const hook = await load();
		hook({ quiet: true });
		capturedMutationOptions.onSuccess(data);
		expect(mockToast.success).not.toHaveBeenCalled();
		expect(mockToast.warning).not.toHaveBeenCalled();
		expect(mockInvalidateQueries.mock.calls.length + mockSetQueriesData.mock.calls.length).toBeGreaterThan(0);
	});

	it('does not toast on error when quiet', async () => {
		const hook = await load();
		hook({ quiet: true });
		capturedMutationOptions.onError(new Error('boom'));
		expect(mockToast.error).not.toHaveBeenCalled();
	});
});
