import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	mockGraphql: vi.fn(),
	mockSetQueryData: vi.fn(),
	mockInvalidate: vi.fn(),
	captured: undefined as any,
}));

vi.mock('@tanstack/svelte-query', () => ({
	createMutation: vi.fn((fn: () => any) => {
		mocks.captured = fn();
		return { mutate: vi.fn() };
	}),
	useQueryClient: vi.fn(() => ({
		setQueryData: mocks.mockSetQueryData,
		invalidateQueries: mocks.mockInvalidate,
	})),
}));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: (...a: unknown[]) => mocks.mockGraphql(...a) }));
vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useMarkThreadRead } from '$lib/queries/hooks/useMarkThreadRead';
import { MARK_THREAD_READ } from '$lib/queries/messaging';
import { queryKeys } from '$lib/queries/keys';

describe('useMarkThreadRead', () => {
	beforeEach(() => vi.clearAllMocks());

	it('mutationFn calls markThreadRead with an IntID seq', async () => {
		useMarkThreadRead();
		mocks.mockGraphql.mockResolvedValue({ markThreadRead: { id: 't1' } });
		await mocks.captured.mutationFn({ threadId: 't1', seq: 12 });
		expect(mocks.mockGraphql).toHaveBeenCalledWith(MARK_THREAD_READ, { threadId: 't1', seq: 12 });
	});

	it('onSuccess writes the thread detail and patches the matching thread in the list cache', () => {
		useMarkThreadRead();
		const updated = { id: 't1', unreadCount: 0 };
		mocks.captured.onSuccess({ markThreadRead: updated }, { threadId: 't1', seq: 12 });
		expect(mocks.mockSetQueryData).toHaveBeenCalledWith(queryKeys.messaging.threads.detail('t1'), updated);
		expect(mocks.mockSetQueryData).toHaveBeenCalledWith(queryKeys.messaging.threads.list(), expect.any(Function));

		const listUpdater = mocks.mockSetQueryData.mock.calls.find(
			(call) => JSON.stringify(call[0]) === JSON.stringify(queryKeys.messaging.threads.list()),
		)![1];
		const other = { id: 't2', unreadCount: 5 };
		const next = listUpdater({ messageThreads: [other, { id: 't1', unreadCount: 5 }] });
		expect(next.messageThreads).toEqual([other, updated]);
	});
});
