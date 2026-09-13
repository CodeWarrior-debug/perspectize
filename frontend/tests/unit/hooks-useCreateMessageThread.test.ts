import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	mockGraphql: vi.fn(),
	mockInvalidate: vi.fn(),
	mockToastError: vi.fn(),
	captured: undefined as any,
}));

vi.mock('@tanstack/svelte-query', () => ({
	createMutation: vi.fn((fn: () => any) => {
		mocks.captured = fn();
		return { mutate: vi.fn() };
	}),
	useQueryClient: vi.fn(() => ({ invalidateQueries: mocks.mockInvalidate })),
}));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: (...a: unknown[]) => mocks.mockGraphql(...a) }));
vi.mock('svelte-sonner', () => ({ toast: { error: mocks.mockToastError, success: vi.fn() } }));

import { useCreateMessageThread } from '$lib/queries/messaging/useCreateMessageThread';
import { CREATE_MESSAGE_THREAD } from '$lib/queries/messaging';
import { queryKeys } from '$lib/queries/keys';

describe('useCreateMessageThread', () => {
	beforeEach(() => vi.clearAllMocks());

	it('mutationFn maps args to CreateMessageThreadInput with a null title default', async () => {
		useCreateMessageThread();
		mocks.mockGraphql.mockResolvedValue({ createMessageThread: { id: 't9' } });
		await mocks.captured.mutationFn({ participantUserIds: ['u2', 'u3'] });
		expect(mocks.mockGraphql).toHaveBeenCalledWith(CREATE_MESSAGE_THREAD, {
			input: { participantUserIds: ['u2', 'u3'], title: null },
		});
	});

	it('onSuccess invalidates the thread list (navigation is the caller decision — see NewThreadDialog)', () => {
		useCreateMessageThread();
		mocks.captured.onSuccess();
		expect(mocks.mockInvalidate).toHaveBeenCalledWith({ queryKey: queryKeys.messaging.threads.lists() });
	});

	it('onError toasts a friendly message', () => {
		useCreateMessageThread();
		mocks.captured.onError(new Error('x'));
		expect(mocks.mockToastError).toHaveBeenCalled();
	});
});
