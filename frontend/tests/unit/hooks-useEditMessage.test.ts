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

	describe('survivor coverage (found by Stryker)', () => {
		const other = { ...existingMsg, id: 'm8', seq: 8, body: 'other', editedAt: '2026-01-01T00:00:00Z' };
		const args = { messageId: 'm7', threadId: 't1', body: '  new body  ', previousBody: 'old' };
		const key = queryKeys.messaging.messages.list('t1');

		it('onMutate reads the cache for this thread and remembers the previous body and editedAt of the edited message', () => {
			const edited = { ...existingMsg, editedAt: '2026-02-02T00:00:00Z' };
			mocks.mockGetQueryData.mockReturnValue({ items: [other, edited], oldestLoadedSeq: 7, hasMoreOlder: false });
			useEditMessage();
			const ctx = mocks.captured.onMutate(args);
			expect(mocks.mockGetQueryData).toHaveBeenCalledWith(key);
			// must be m7's editedAt, not the first row's (m8's) value
			expect(ctx).toEqual({ previousBody: 'old', previousEditedAt: '2026-02-02T00:00:00Z' });
		});

		it('onMutate remembers editedAt as null when the message is not cached or nothing is cached', () => {
			useEditMessage();
			mocks.mockGetQueryData.mockReturnValue(undefined);
			expect(mocks.captured.onMutate(args)).toEqual({ previousBody: 'old', previousEditedAt: null });
			mocks.mockGetQueryData.mockReturnValue({ items: [other], oldestLoadedSeq: 8, hasMoreOlder: false });
			expect(mocks.captured.onMutate(args)).toEqual({ previousBody: 'old', previousEditedAt: null });
		});

		it('onMutate stores the trimmed body and edits only the targeted message', () => {
			mocks.mockGetQueryData.mockReturnValue(existingCache);
			useEditMessage();
			mocks.captured.onMutate(args);
			const updater = mocks.mockSetQueryData.mock.calls[0][1];
			const cache = { items: [other, existingMsg], oldestLoadedSeq: 7, hasMoreOlder: false };
			const next = updater(cache);
			expect(next.items[0]).toBe(other);
			expect(next.items[1].body).toBe('new body');
		});

		it('onMutate updater leaves an empty cache and an uncached message alone', () => {
			mocks.mockGetQueryData.mockReturnValue(existingCache);
			useEditMessage();
			mocks.captured.onMutate(args);
			const updater = mocks.mockSetQueryData.mock.calls[0][1];
			expect(updater(undefined)).toBeUndefined();
			const unrelated = { items: [other], oldestLoadedSeq: 8, hasMoreOlder: false };
			expect(updater(unrelated)).toBe(unrelated);
		});

		it('onSuccess replaces the message in this thread with the server version', () => {
			useEditMessage();
			const server = { ...existingMsg, body: 'new body', editedAt: '2026-09-07T14:00:00Z' };
			mocks.captured.onSuccess({ editMessage: server }, args);
			expect(mocks.mockSetQueryData).toHaveBeenCalledWith(key, expect.any(Function));
			const updater = mocks.mockSetQueryData.mock.calls[0][1];
			const next = updater({
				items: [other, { ...existingMsg, body: 'new body' }],
				oldestLoadedSeq: 7,
				hasMoreOlder: false,
			});
			expect(next.items[1]).toEqual(server);
			expect(next.items[0]).toBe(other);
		});

		it('onSuccess leaves an empty cache empty', () => {
			useEditMessage();
			mocks.captured.onSuccess({ editMessage: existingMsg }, args);
			const updater = mocks.mockSetQueryData.mock.calls[0][1];
			expect(updater(undefined)).toBeUndefined();
		});

		it('onError restores the remembered editedAt on the right message and leaves others alone', () => {
			useEditMessage();
			mocks.captured.onError(new Error('x'), args, { previousBody: 'old', previousEditedAt: '2026-02-02T00:00:00Z' });
			expect(mocks.mockSetQueryData).toHaveBeenCalledWith(key, expect.any(Function));
			const updater = mocks.mockSetQueryData.mock.calls[0][1];
			const edited = { ...existingMsg, body: 'new body', editedAt: '2026-09-07T14:00:00Z' };
			const next = updater({ items: [other, edited], oldestLoadedSeq: 7, hasMoreOlder: false });
			expect(next.items[0]).toBe(other);
			expect(next.items[1].body).toBe('old');
			expect(next.items[1].editedAt).toBe('2026-02-02T00:00:00Z');
		});

		it('onError falls back to editedAt null when no rollback context exists', () => {
			useEditMessage();
			mocks.captured.onError(new Error('x'), args, undefined);
			const updater = mocks.mockSetQueryData.mock.calls[0][1];
			const edited = { ...existingMsg, body: 'new body', editedAt: '2026-09-07T14:00:00Z' };
			const next = updater({ items: [edited], oldestLoadedSeq: 7, hasMoreOlder: false });
			expect(next.items[0].editedAt).toBeNull();
		});

		it('onError leaves an empty cache and an uncached message alone, and says the edit failed', () => {
			useEditMessage();
			mocks.captured.onError(new Error('x'), args, {});
			const updater = mocks.mockSetQueryData.mock.calls[0][1];
			expect(updater(undefined)).toBeUndefined();
			const unrelated = { items: [other], oldestLoadedSeq: 8, hasMoreOlder: false };
			expect(updater(unrelated)).toBe(unrelated);
			expect(mocks.mockToastError).toHaveBeenCalledWith('Could not edit message');
		});
	});
});
