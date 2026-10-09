import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flushSync } from 'svelte';
import { render } from '@testing-library/svelte';
import { reactiveClerk } from './authUserSyncClerk.svelte';
import AuthUserSync from '$lib/components/AuthUserSync.svelte';

const { mockSetSelectedUserId, mockClearUserSelection, mockQueryClientClear, mockClerkContext, mockQueryState } =
	vi.hoisted(() => ({
		mockSetSelectedUserId: vi.fn(),
		mockClearUserSelection: vi.fn(),
		mockQueryClientClear: vi.fn(),
		mockClerkContext: {
			isLoaded: true,
			auth: { userId: null as string | null },
		},
		mockQueryState: {
			isLoading: false,
			error: null as Error | null,
			data: null as { me: { id: string; username: string } } | null,
		},
	}));

let capturedQueryOptions: any;

vi.mock('@tanstack/svelte-query', () => ({
	createQuery: vi.fn((optionsFn: () => any) => {
		capturedQueryOptions = optionsFn();
		return mockQueryState;
	}),
	useQueryClient: vi.fn(() => ({
		clear: mockQueryClientClear,
	})),
}));

// Tests that change auth mid-life need a $state-backed context, like the real
// ClerkProvider; the plain object covers everything else.
let useReactive = false;

vi.mock('svelte-clerk', () => ({
	useClerkContext: vi.fn(() => (useReactive ? reactiveClerk : mockClerkContext)),
}));

vi.mock('$lib/queries/client', () => ({
	graphqlRequest: vi.fn(),
}));

vi.mock('$lib/queries/users', () => ({
	ME: 'mock-me-query',
}));

vi.mock('$lib/stores/userSelection.svelte', () => ({
	setSelectedUserId: (...args: unknown[]) => mockSetSelectedUserId(...args),
	clearUserSelection: () => mockClearUserSelection(),
}));

describe('AuthUserSync', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		capturedQueryOptions = undefined;
		useReactive = false;
		reactiveClerk.isLoaded = true;
		reactiveClerk.auth.userId = null;
		mockClerkContext.isLoaded = true;
		mockClerkContext.auth.userId = null;
		mockQueryState.isLoading = false;
		mockQueryState.error = null;
		mockQueryState.data = null;
	});

	it('does not sync while Clerk is still loading', () => {
		mockClerkContext.isLoaded = false;
		mockClerkContext.auth.userId = null;
		render(AuthUserSync);
		expect(mockQueryClientClear).not.toHaveBeenCalled();
		expect(mockSetSelectedUserId).not.toHaveBeenCalled();
		expect(mockClearUserSelection).not.toHaveBeenCalled();
	});

	it('on initial sign-in, syncs selected user without clearing the cache (siblings may already be fetching)', () => {
		mockClerkContext.isLoaded = true;
		mockClerkContext.auth.userId = 'clerk_user_123';
		mockQueryState.data = { me: { id: '5', username: 'alice' } };
		render(AuthUserSync);
		expect(mockQueryClientClear).not.toHaveBeenCalled();
		expect(mockSetSelectedUserId).toHaveBeenCalledWith(5);
		expect(mockClearUserSelection).not.toHaveBeenCalled();
	});

	it('on initial signed-out load, does not clear the cache but clears user selection', () => {
		mockClerkContext.isLoaded = true;
		mockClerkContext.auth.userId = null;
		render(AuthUserSync);
		expect(mockQueryClientClear).not.toHaveBeenCalled();
		expect(mockClearUserSelection).toHaveBeenCalledTimes(1);
		expect(mockSetSelectedUserId).not.toHaveBeenCalled();
	});

	it('on a later sign-out, clears query cache and clears user selection', () => {
		reactiveClerk.auth.userId = 'clerk_user_A';
		useReactive = true;
		render(AuthUserSync);
		expect(mockQueryClientClear).not.toHaveBeenCalled();

		reactiveClerk.auth.userId = null;
		flushSync();
		expect(mockQueryClientClear).toHaveBeenCalledTimes(1);
		expect(mockClearUserSelection).toHaveBeenCalledTimes(1);
	});

	it('account switch in place: clears the cache and re-syncs for the new user', () => {
		reactiveClerk.auth.userId = 'clerk_user_A';
		useReactive = true;
		mockQueryState.data = { me: { id: '1', username: 'alice' } };
		render(AuthUserSync);
		expect(mockSetSelectedUserId).toHaveBeenCalledWith(1);
		expect(mockQueryClientClear).not.toHaveBeenCalled();

		mockQueryState.data = { me: { id: '2', username: 'bob' } };
		reactiveClerk.auth.userId = 'clerk_user_B';
		flushSync();
		expect(mockQueryClientClear).toHaveBeenCalledTimes(1);
		expect(mockSetSelectedUserId).toHaveBeenCalledWith(2);
	});

	it('constructs the me query with a clerk-scoped key, 5 minute staleTime, and enabled when signed in', () => {
		mockClerkContext.isLoaded = true;
		mockClerkContext.auth.userId = 'clerk_user_123';
		render(AuthUserSync);
		expect(capturedQueryOptions.queryKey).toEqual(['me', 'clerk_user_123']);
		expect(capturedQueryOptions.staleTime).toBe(5 * 60 * 1000);
		expect(capturedQueryOptions.enabled).toBe(true);
	});

	it('disables the me query while signed out', () => {
		mockClerkContext.isLoaded = true;
		mockClerkContext.auth.userId = null;
		render(AuthUserSync);
		expect(capturedQueryOptions.enabled).toBe(false);
	});
});
