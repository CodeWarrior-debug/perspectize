import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	mockGraphql: vi.fn(),
	mockSetQueryData: vi.fn(),
	mockInvalidate: vi.fn(),
	mockGoto: vi.fn(),
	mockToastSuccess: vi.fn(),
	mockToastError: vi.fn(),
	captures: [] as any[],
}));

vi.mock('@tanstack/svelte-query', () => ({
	createMutation: vi.fn((fn: () => any) => {
		mocks.captures.push(fn());
		return { mutate: vi.fn() };
	}),
	useQueryClient: vi.fn(() => ({
		setQueryData: mocks.mockSetQueryData,
		invalidateQueries: mocks.mockInvalidate,
	})),
}));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: (...a: unknown[]) => mocks.mockGraphql(...a) }));
vi.mock('$app/navigation', () => ({ goto: mocks.mockGoto }));
vi.mock('svelte-sonner', () => ({ toast: { success: mocks.mockToastSuccess, error: mocks.mockToastError } }));

import { useSetTyping } from '$lib/queries/hooks/useSetTyping';
import { useAddThreadParticipants } from '$lib/queries/hooks/useAddThreadParticipants';
import { useLeaveThread } from '$lib/queries/hooks/useLeaveThread';
import { SET_TYPING, ADD_THREAD_PARTICIPANTS, LEAVE_THREAD } from '$lib/queries/messaging';
import { queryKeys } from '$lib/queries/keys';

describe('thin messaging mutation hooks', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.captures = [];
	});

	it('useSetTyping forwards threadId/typing and never toasts on error', async () => {
		useSetTyping();
		const opts = mocks.captures[0];
		mocks.mockGraphql.mockResolvedValue({ setTyping: true });
		await opts.mutationFn({ threadId: 't1', typing: true });
		expect(mocks.mockGraphql).toHaveBeenCalledWith(SET_TYPING, { threadId: 't1', typing: true });
		opts.onError?.(new Error('x'));
		expect(mocks.mockToastError).not.toHaveBeenCalled();
	});

	it('useAddThreadParticipants updates detail cache + invalidates list + toasts', async () => {
		useAddThreadParticipants();
		const opts = mocks.captures[0];
		mocks.mockGraphql.mockResolvedValue({ addThreadParticipants: { id: 't1' } });
		await opts.mutationFn({ threadId: 't1', userIds: ['u5'] });
		expect(mocks.mockGraphql).toHaveBeenCalledWith(ADD_THREAD_PARTICIPANTS, { threadId: 't1', userIds: ['u5'] });
		opts.onSuccess({ addThreadParticipants: { id: 't1' } }, { threadId: 't1', userIds: ['u5'] });
		expect(mocks.mockSetQueryData).toHaveBeenCalledWith(queryKeys.messaging.threads.detail('t1'), { id: 't1' });
		expect(mocks.mockInvalidate).toHaveBeenCalledWith({ queryKey: queryKeys.messaging.threads.lists() });
		expect(mocks.mockToastSuccess).toHaveBeenCalled();
	});

	it('useLeaveThread invalidates list, navigates to /messages, toasts', async () => {
		useLeaveThread();
		const opts = mocks.captures[0];
		mocks.mockGraphql.mockResolvedValue({ leaveThread: true });
		await opts.mutationFn({ threadId: 't1' });
		expect(mocks.mockGraphql).toHaveBeenCalledWith(LEAVE_THREAD, { threadId: 't1' });
		opts.onSuccess({ leaveThread: true }, { threadId: 't1' });
		expect(mocks.mockInvalidate).toHaveBeenCalledWith({ queryKey: queryKeys.messaging.threads.lists() });
		expect(mocks.mockGoto).toHaveBeenCalledWith('/messages');
		expect(mocks.mockToastSuccess).toHaveBeenCalled();
	});
});
