import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	options: undefined as any,
	invalidate: vi.fn(),
	success: vi.fn(),
	error: vi.fn(),
	graphqlRequest: vi.fn(),
}));

vi.mock('@tanstack/svelte-query', () => ({
	createMutation: (fn: () => any) => {
		mocks.options = fn();
		return {};
	},
	useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));
vi.mock('svelte-sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: mocks.graphqlRequest }));

import { goto } from '$app/navigation';
import { useOpenPassage } from '$lib/queries/content/useOpenPassage';

const range = { bookId: 43, startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 16 };

beforeEach(() => {
	vi.clearAllMocks();
	useOpenPassage();
});

describe('useOpenPassage', () => {
	it('find-or-creates the range through the authenticated wrapper', async () => {
		mocks.graphqlRequest.mockResolvedValue({});
		await mocks.options.mutationFn(range);
		expect(mocks.graphqlRequest).toHaveBeenCalledWith(expect.anything(), {
			input: { bookID: 43, startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 16, userID: 0 },
		});
	});

	it('success (new or existing row) refetches lists and opens it on the Activity page, without a toast', () => {
		mocks.options.onSuccess({
			createContentFromPassage: { id: '12', name: 'John 3:16', contentType: 'BIBLE_PASSAGE', displayTitle: null },
		});
		expect(mocks.invalidate).toHaveBeenCalled();
		expect(goto).toHaveBeenCalledWith('/?open=12');
		expect(mocks.success).not.toHaveBeenCalled();
	});

	it.each([
		['Failed to fetch', /cannot reach the server/i],
		['authentication required', /sign in/i],
		['boom', /failed to open passage/i],
	])('error "%s" shows a toast and does not navigate', (message, expected) => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		mocks.options.onError(new Error(message));
		expect(mocks.error).toHaveBeenCalledWith(expect.stringMatching(expected));
		expect(goto).not.toHaveBeenCalled();
	});
});
