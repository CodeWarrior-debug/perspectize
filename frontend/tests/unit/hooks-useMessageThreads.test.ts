import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	mockGraphql: vi.fn(),
	capturedQueryOptions: undefined as any,
}));

vi.mock('@tanstack/svelte-query', () => ({
	createQuery: vi.fn((fn: () => any) => {
		mocks.capturedQueryOptions = fn();
		return { data: undefined, isLoading: true };
	}),
	useQueryClient: vi.fn(() => ({ setQueryData: vi.fn() })),
}));

vi.mock('$lib/queries/client', () => ({
	graphqlRequest: (...a: unknown[]) => mocks.mockGraphql(...a),
}));

import { useMessageThreads } from '$lib/queries/messaging/useMessageThreads';
import { LIST_MESSAGE_THREADS } from '$lib/queries/messaging';
import { queryKeys } from '$lib/queries/keys';

describe('useMessageThreads', () => {
	beforeEach(() => vi.clearAllMocks());

	it('uses the exact threads.list() key and sends no variables', async () => {
		useMessageThreads();
		expect(mocks.capturedQueryOptions.queryKey).toEqual(queryKeys.messaging.threads.list());
		mocks.mockGraphql.mockResolvedValue({ messageThreads: [] });
		await mocks.capturedQueryOptions.queryFn();
		expect(mocks.mockGraphql).toHaveBeenCalledWith(LIST_MESSAGE_THREADS);
	});
});
