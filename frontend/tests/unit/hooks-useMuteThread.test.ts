import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	mockGraphql: vi.fn(),
	mockSetQueryData: vi.fn(),
	mockInvalidate: vi.fn(),
	mockToastError: vi.fn(),
	captured: undefined as any,
}));

vi.mock('@tanstack/svelte-query', () => ({
	createMutation: vi.fn((fn: () => any) => {
		mocks.captured = fn();
		return { mutate: vi.fn() };
	}),
	useQueryClient: vi.fn(() => ({ setQueryData: mocks.mockSetQueryData, invalidateQueries: mocks.mockInvalidate })),
}));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: (...a: unknown[]) => mocks.mockGraphql(...a) }));
vi.mock('svelte-sonner', () => ({ toast: { error: mocks.mockToastError, success: vi.fn() } }));

import { useMuteThread } from '$lib/queries/hooks/useMuteThread';
import { MUTE_THREAD } from '$lib/queries/messaging';
import { queryKeys } from '$lib/queries/keys';

const thread = { id: 't1', title: null, participants: [], lastMessageAt: 'x', latestSeq: 0, myLastReadSeq: 0, unreadCount: 0, muted: true, createdAt: 'x' };

describe('useMuteThread', () => {
	beforeEach(() => vi.clearAllMocks());

	it('mutationFn calls MUTE_THREAD with the given muted flag', async () => {
		useMuteThread();
		mocks.mockGraphql.mockResolvedValue({ muteThread: thread });
		await mocks.captured.mutationFn({ threadId: 't1', muted: true });
		expect(mocks.mockGraphql).toHaveBeenCalledWith(MUTE_THREAD, { threadId: 't1', muted: true });
	});

	it('onSuccess writes the thread detail and invalidates the list without refetching', () => {
		useMuteThread();
		mocks.captured.onSuccess({ muteThread: thread }, { threadId: 't1', muted: true });
		expect(mocks.mockSetQueryData).toHaveBeenCalledWith(
			queryKeys.messaging.threads.detail('t1'),
			thread,
		);
		expect(mocks.mockInvalidate).toHaveBeenCalledWith({
			queryKey: queryKeys.messaging.threads.lists(),
			refetchType: 'none',
		});
	});

	it('onError toasts with the direction-aware message', () => {
		useMuteThread();
		mocks.captured.onError(new Error('fail'), { threadId: 't1', muted: true });
		expect(mocks.mockToastError).toHaveBeenCalledWith('Could not mute thread');
		vi.clearAllMocks();
		mocks.captured.onError(new Error('fail'), { threadId: 't1', muted: false });
		expect(mocks.mockToastError).toHaveBeenCalledWith('Could not unmute thread');
	});
});
