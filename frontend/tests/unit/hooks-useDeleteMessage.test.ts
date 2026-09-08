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

import { useDeleteMessage } from '$lib/queries/hooks/useDeleteMessage';
import { DELETE_MESSAGE } from '$lib/queries/messaging';
import { queryKeys } from '$lib/queries/keys';

describe('useDeleteMessage', () => {
	beforeEach(() => vi.clearAllMocks());

	it('onMutate optimistically tombstones the message in place', () => {
		useDeleteMessage();
		mocks.captured.onMutate({ messageId: 'm7', threadId: 't1' });
		const updater = mocks.mockSetQueryData.mock.calls[0][1];
		const next = updater({
			items: [
				{ id: 'm7', seq: 7, body: 'secret', deletedAt: null },
				{ id: 'm8', seq: 8, body: 'hi', deletedAt: null },
			],
			oldestLoadedSeq: 7,
			hasMoreOlder: false,
		});
		expect(next.items.map((m: any) => m.id)).toEqual(['m7', 'm8']);
		expect(next.items[0]).toMatchObject({ body: '', deletedAt: expect.any(String) });
	});

	it('mutationFn calls DELETE_MESSAGE', async () => {
		useDeleteMessage();
		mocks.mockGraphql.mockResolvedValue({
			deleteMessage: { id: 'm7', threadId: 't1', seq: 7, body: '', editedAt: null, deletedAt: '2026-09-07T15:00:00Z', createdAt: 'x', sender: { id: 'u1', username: 'me' } },
		});
		await mocks.captured.mutationFn({ messageId: 'm7', threadId: 't1' });
		expect(mocks.mockGraphql).toHaveBeenCalledWith(DELETE_MESSAGE, { messageId: 'm7' });
	});

	it('onError invalidates the message list and toasts', () => {
		useDeleteMessage();
		mocks.captured.onError(new Error('fail'), { messageId: 'm7', threadId: 't1' });
		expect(mocks.mockInvalidate).toHaveBeenCalledWith({
			queryKey: queryKeys.messaging.messages.list('t1'),
		});
		expect(mocks.mockToastError).toHaveBeenCalled();
	});
});
