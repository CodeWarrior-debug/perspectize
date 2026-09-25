import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	options: undefined as any,
	invalidate: vi.fn(),
	setQueriesData: vi.fn(),
	success: vi.fn(),
	error: vi.fn(),
	graphqlRequest: vi.fn(),
}));

vi.mock('@tanstack/svelte-query', () => ({
	createMutation: (fn: () => any) => {
		mocks.options = fn();
		return {};
	},
	useQueryClient: () => ({ invalidateQueries: mocks.invalidate, setQueriesData: mocks.setQueriesData }),
}));
vi.mock('svelte-sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: mocks.graphqlRequest }));

import { useAddPassage } from '$lib/queries/content/useAddPassage';

const range = { bookId: 43, startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 18 };

beforeEach(() => {
	vi.clearAllMocks();
	useAddPassage();
});

describe('useAddPassage', () => {
	it('sends the range through the authenticated wrapper with the session-derived userID', async () => {
		mocks.graphqlRequest.mockResolvedValue({});
		await mocks.options.mutationFn(range);
		expect(mocks.graphqlRequest).toHaveBeenCalledWith(expect.anything(), {
			input: { bookID: 43, startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 18, userID: 0 },
		});
	});

	it('success (new or existing row) toasts the title and refetches lists instead of inserting', () => {
		mocks.options.onSuccess({
			createContentFromPassage: { id: '1', name: 'John 3:16-18', contentType: 'BIBLE_PASSAGE', displayTitle: null },
		});
		expect(mocks.success).toHaveBeenCalledWith('Added: John 3:16-18');
		expect(mocks.invalidate).toHaveBeenCalled();
		expect(mocks.setQueriesData).not.toHaveBeenCalled();
	});

	it('success prefers an existing display title', () => {
		mocks.options.onSuccess({
			createContentFromPassage: {
				id: '1',
				name: 'John 3:16-18',
				contentType: 'BIBLE_PASSAGE',
				displayTitle: 'God so loved',
			},
		});
		expect(mocks.success).toHaveBeenCalledWith('Added: God so loved');
	});

	it.each([
		['Failed to fetch', /cannot reach the server/i],
		['authentication required', /sign in/i],
		['boom', /failed to add passage/i],
	])('error "%s" shows a toast', (message, expected) => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		mocks.options.onError(new Error(message));
		expect(mocks.error).toHaveBeenCalledWith(expect.stringMatching(expected));
	});
});
