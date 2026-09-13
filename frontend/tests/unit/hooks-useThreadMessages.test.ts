import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	mockGraphql: vi.fn(),
	mockSetQueryData: vi.fn(),
	capturedQueryOptions: undefined as any,
}));

vi.mock('@tanstack/svelte-query', () => ({
	createQuery: vi.fn((fn: () => any) => {
		mocks.capturedQueryOptions = fn();
		return { data: mocks.capturedQueryOptions.__data, isLoading: false };
	}),
	useQueryClient: vi.fn(() => ({ setQueryData: mocks.mockSetQueryData })),
}));

vi.mock('$lib/queries/client', () => ({
	graphqlRequest: (...a: unknown[]) => mocks.mockGraphql(...a),
}));

import { useThreadMessages } from '$lib/queries/messaging/useThreadMessages.svelte';
import { LIST_THREAD_MESSAGES } from '$lib/queries/messaging';
import { queryKeys } from '$lib/queries/keys';

const apiPage = {
	threadMessages: {
		items: [
			{ id: 'm9', threadId: 't1', sender: { id: 'u2', username: 'b' }, seq: 9, body: 'i', createdAt: 'x' },
			{ id: 'm8', threadId: 't1', sender: { id: 'u2', username: 'b' }, seq: 8, body: 'h', createdAt: 'x' },
		],
		pageInfo: { hasNextPage: false, hasPreviousPage: true, startCursor: '9', endCursor: '8' },
	},
};

describe('useThreadMessages', () => {
	beforeEach(() => vi.clearAllMocks());

	it('queryFn seeds an ascending ThreadMessagesCache from the newest-first API page', async () => {
		useThreadMessages(() => 't1');
		expect(mocks.capturedQueryOptions.queryKey).toEqual(queryKeys.messaging.messages.list('t1'));
		mocks.mockGraphql.mockResolvedValue(apiPage);
		const cache = await mocks.capturedQueryOptions.queryFn();
		expect(mocks.mockGraphql).toHaveBeenCalledWith(LIST_THREAD_MESSAGES, { threadId: 't1', first: 40 });
		expect(cache.items.map((m: any) => m.seq)).toEqual([8, 9]);
		expect(cache.hasMoreOlder).toBe(true);
		expect(cache.oldestLoadedSeq).toBe(8);
	});

	it('fetchOlder folds an older page via prependOlderPage into the same key', async () => {
		const olderPage = {
			threadMessages: {
				items: [{ id: 'm7', threadId: 't1', sender: { id: 'u2', username: 'b' }, seq: 7, body: 'g', createdAt: 'x' }],
				pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: '7', endCursor: '7' },
			},
		};
		mocks.capturedQueryOptions = undefined;
		const api = useThreadMessages(() => 't1');
		// simulate an existing cache
		(api.query as any).data = { items: [{ seq: 8 }, { seq: 9 }], oldestLoadedSeq: 8, hasMoreOlder: true };
		mocks.mockGraphql.mockResolvedValue(olderPage);
		await api.fetchOlder();
		expect(mocks.mockGraphql).toHaveBeenCalledWith(LIST_THREAD_MESSAGES, {
			threadId: 't1',
			first: 40,
			before: 8,
		});
		expect(mocks.mockSetQueryData).toHaveBeenCalledWith(queryKeys.messaging.messages.list('t1'), expect.any(Function));
		const updater = mocks.mockSetQueryData.mock.calls[0][1];
		const next = updater({ items: [{ seq: 8 }, { seq: 9 }], oldestLoadedSeq: 8, hasMoreOlder: true });
		expect(next.items.map((m: any) => m.seq)).toEqual([7, 8, 9]);
		expect(next.hasMoreOlder).toBe(false);
	});
});
