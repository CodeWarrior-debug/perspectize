import { describe, it, expect, vi, beforeEach } from 'vitest';

const clerkState = vi.hoisted(() => ({
	isLoaded: false,
	auth: { userId: null as string | null },
}));

let capturedQueryOptions: any;

vi.mock('svelte-clerk', () => ({
	useClerkContext: () => clerkState,
}));

vi.mock('@tanstack/svelte-query', () => ({
	createQuery: vi.fn((optionsFn: () => any) => {
		capturedQueryOptions = optionsFn();
		return { data: undefined, isSuccess: false, isError: false };
	}),
}));

vi.mock('$lib/queries/client', () => ({ graphqlRequest: vi.fn() }));

describe('useMe', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clerkState.isLoaded = false;
		clerkState.auth.userId = null;
	});

	it('disables the query when Clerk has not loaded yet', async () => {
		const { useMe } = await import('$lib/queries/users/useMe.svelte');
		useMe();
		expect(capturedQueryOptions.enabled).toBe(false);
	});

	it('disables the query when loaded but signed out', async () => {
		clerkState.isLoaded = true;
		const { useMe } = await import('$lib/queries/users/useMe.svelte');
		useMe();
		expect(capturedQueryOptions.enabled).toBe(false);
	});

	it('enables the query once loaded and signed in, keying on the Clerk user id', async () => {
		clerkState.isLoaded = true;
		clerkState.auth.userId = 'user_42';
		const { useMe } = await import('$lib/queries/users/useMe.svelte');
		useMe();
		expect(capturedQueryOptions.enabled).toBe(true);
		expect(capturedQueryOptions.queryKey).toEqual(['me', 'user_42']);
	});

	it('me/isAdmin reflect null when the query has no data', async () => {
		const { createQuery } = await import('@tanstack/svelte-query');
		(createQuery as any).mockReturnValueOnce({ data: undefined, isSuccess: false, isError: false });
		const { useMe } = await import('$lib/queries/users/useMe.svelte');
		const result = useMe();
		expect(result.me).toBeNull();
		expect(result.isAdmin).toBe(false);
		expect(result.isSettled).toBe(false);
	});

	it('me/isAdmin reflect a loaded non-admin user', async () => {
		const { createQuery } = await import('@tanstack/svelte-query');
		(createQuery as any).mockReturnValueOnce({
			data: { me: { id: '1', role: 'MEMBER' } },
			isSuccess: true,
			isError: false,
		});
		const { useMe } = await import('$lib/queries/users/useMe.svelte');
		const result = useMe();
		expect(result.me).toEqual({ id: '1', role: 'MEMBER' });
		expect(result.isAdmin).toBe(false);
		expect(result.isSuccess).toBe(true);
		expect(result.isSettled).toBe(true);
	});

	it('isAdmin is true for an ADMIN role', async () => {
		const { createQuery } = await import('@tanstack/svelte-query');
		(createQuery as any).mockReturnValueOnce({
			data: { me: { id: '1', role: 'ADMIN' } },
			isSuccess: true,
			isError: false,
		});
		const { useMe } = await import('$lib/queries/users/useMe.svelte');
		expect(useMe().isAdmin).toBe(true);
	});

	it('isSettled/isError reflect a failed query', async () => {
		const { createQuery } = await import('@tanstack/svelte-query');
		(createQuery as any).mockReturnValueOnce({ data: undefined, isSuccess: false, isError: true });
		const { useMe } = await import('$lib/queries/users/useMe.svelte');
		const result = useMe();
		expect(result.isError).toBe(true);
		expect(result.isSettled).toBe(true);
	});
});
