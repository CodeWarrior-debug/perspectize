import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	mockGraphql: vi.fn(),
	mockSetQueryData: vi.fn(),
	mockToastError: vi.fn(),
	captured: undefined as any,
}));

vi.mock('@tanstack/svelte-query', () => ({
	createMutation: vi.fn((fn: () => any) => {
		mocks.captured = fn();
		return { mutate: vi.fn(), isPending: false };
	}),
	useQueryClient: vi.fn(() => ({ setQueryData: mocks.mockSetQueryData })),
}));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: (...a: unknown[]) => mocks.mockGraphql(...a) }));
vi.mock('svelte-sonner', () => ({ toast: { error: mocks.mockToastError, success: vi.fn() } }));

import { useSendMessage } from '$lib/queries/hooks/useSendMessage';
import { SEND_MESSAGE } from '$lib/queries/messaging';
import { queryKeys } from '$lib/queries/keys';

const sender = { id: 'u1', username: 'me' };

describe('useSendMessage', () => {
	beforeEach(() => vi.clearAllMocks());

	it('onMutate adds an optimistic row keyed by the generated nonce', () => {
		useSendMessage();
		const args: any = { threadId: 't1', body: 'hi there', sender, afterSeq: 7 };
		mocks.captured.onMutate(args);
		expect(typeof args.__nonce).toBe('string');
		expect(mocks.mockSetQueryData).toHaveBeenCalledWith(
			queryKeys.messaging.messages.list('t1'),
			expect.any(Function),
		);
		const updater = mocks.mockSetQueryData.mock.calls[0][1];
		const next = updater({ items: [{ id: 'm7', seq: 7 }], oldestLoadedSeq: 7, hasMoreOlder: false });
		expect(next.items[next.items.length - 1].id).toBe('optimistic:' + args.__nonce);
	});

	it('mutationFn sends the same nonce set on the args by onMutate', async () => {
		useSendMessage();
		const args: any = { threadId: 't1', body: '  hi  ', sender, afterSeq: 7 };
		mocks.captured.onMutate(args);
		mocks.mockGraphql.mockResolvedValue({ sendMessage: { id: 'm8', seq: 8, body: 'hi', threadId: 't1', sender, createdAt: 'x' } });
		const result = await mocks.captured.mutationFn(args);
		expect(mocks.mockGraphql).toHaveBeenCalledWith(SEND_MESSAGE, {
			input: { threadId: 't1', body: 'hi', clientNonce: args.__nonce },
		});
		expect(result.clientNonce).toBe(args.__nonce);
	});

	it('onError removes the optimistic row and toasts', () => {
		useSendMessage();
		const args: any = { threadId: 't1', body: 'x', sender, afterSeq: 7, __nonce: 'n1' };
		mocks.captured.onError(new Error('boom'), args);
		const updater = mocks.mockSetQueryData.mock.calls[0][1];
		const next = updater({ items: [{ id: 'optimistic:n1', seq: 7.5 }, { id: 'm7', seq: 7 }] });
		expect(next.items.map((m: any) => m.id)).toEqual(['m7']);
		expect(mocks.mockToastError).toHaveBeenCalled();
	});

	it('onSuccess reconciles the optimistic row into the server row', () => {
		useSendMessage();
		const args: any = { threadId: 't1', __nonce: 'n1' };
		const server = { id: 'm8', seq: 8, body: 'hi', threadId: 't1', sender, createdAt: 'x' };
		mocks.captured.onSuccess({ response: { sendMessage: server }, clientNonce: 'n1', args }, args);
		const updater = mocks.mockSetQueryData.mock.calls[0][1];
		const next = updater({ items: [{ id: 'optimistic:n1', seq: 7.5 }], oldestLoadedSeq: 7, hasMoreOlder: false });
		expect(next.items.map((m: any) => m.id)).toEqual(['m8']);
	});
});
