import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	mockGraphql: vi.fn(),
	mockSetQueryData: vi.fn(),
	mockGetQueryData: vi.fn(),
	mockToastError: vi.fn(),
	captured: undefined as any,
}));

vi.mock('@tanstack/svelte-query', () => ({
	createMutation: vi.fn((fn: () => any) => {
		mocks.captured = fn();
		return { mutate: vi.fn(), isPending: false };
	}),
	useQueryClient: vi.fn(() => ({ setQueryData: mocks.mockSetQueryData, getQueryData: mocks.mockGetQueryData })),
}));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: (...a: unknown[]) => mocks.mockGraphql(...a) }));
vi.mock('svelte-sonner', () => ({ toast: { error: mocks.mockToastError, success: vi.fn() } }));

import { useEditMessage } from '$lib/queries/messaging/useEditMessage';
import { EDIT_MESSAGE } from '$lib/queries/messaging';
import { queryKeys } from '$lib/queries/keys';

const sender = { id: 'u1', username: 'me' };
const existingMsg = { id: 'm7', threadId: 't1', sender, seq: 7, body: 'old', editedAt: null, createdAt: 'x' };
const existingCache = { items: [existingMsg], oldestLoadedSeq: 7, hasMoreOlder: false };

describe('useEditMessage', () => {
	beforeEach(() => vi.clearAllMocks());

	it('onMutate optimistically updates the message body', () => {
		mocks.mockGetQueryData.mockReturnValue(existingCache);
		useEditMessage();
		mocks.captured.onMutate({ messageId: 'm7', threadId: 't1', body: 'new body', previousBody: 'old' });
		expect(mocks.mockSetQueryData).toHaveBeenCalledWith(queryKeys.messaging.messages.list('t1'), expect.any(Function));
		const updater = mocks.mockSetQueryData.mock.calls[0][1];
		const next = updater(existingCache);
		expect(next.items[0].body).toBe('new body');
		expect(next.items[0].editedAt).not.toBeNull();
	});

	it('mutationFn sends EDIT_MESSAGE with trimmed body', async () => {
		useEditMessage();
		mocks.mockGraphql.mockResolvedValue({
			editMessage: { ...existingMsg, body: 'new body', editedAt: '2026-09-07T14:00:00Z' },
		});
		await mocks.captured.mutationFn({ messageId: 'm7', threadId: 't1', body: '  new body  ', previousBody: 'old' });
		expect(mocks.mockGraphql).toHaveBeenCalledWith(EDIT_MESSAGE, { messageId: 'm7', body: 'new body' });
	});

	it('onError rolls back to the previousBody and toasts', () => {
		useEditMessage();
		mocks.captured.onError(new Error('x'), { messageId: 'm7', threadId: 't1', body: 'new', previousBody: 'old' }, {});
		const updater = mocks.mockSetQueryData.mock.calls[0][1];
		const next = updater({ items: [{ ...existingMsg, body: 'new' }], oldestLoadedSeq: 7, hasMoreOlder: false });
		expect(next.items[0].body).toBe('old');
		expect(mocks.mockToastError).toHaveBeenCalled();
	});

	it('onError also rolls back the optimistic editedAt to what it was before the mutation', () => {
		mocks.mockGetQueryData.mockReturnValue(existingCache); // existingMsg.editedAt is null before edit
		useEditMessage();
		mocks.captured.onMutate({ messageId: 'm7', threadId: 't1', body: 'new', previousBody: 'old' });
		const rollbackCtx = { previousBody: 'old', previousEditedAt: null };
		mocks.captured.onError(
			new Error('x'),
			{ messageId: 'm7', threadId: 't1', body: 'new', previousBody: 'old' },
			rollbackCtx,
		);
		const lastUpdater = mocks.mockSetQueryData.mock.calls.at(-1)![1];
		const next = lastUpdater({
			items: [{ ...existingMsg, body: 'new', editedAt: '2026-09-07T14:00:00Z' }],
			oldestLoadedSeq: 7,
			hasMoreOlder: false,
		});
		expect(next.items[0].body).toBe('old');
		expect(next.items[0].editedAt).toBeNull();
	});
});
