import { createQuery } from '@tanstack/svelte-query';
import { useClerkContext } from 'svelte-clerk';
import { graphqlRequest } from '$lib/queries/client';
import { ME, type MeResponse, type Me } from '$lib/queries/users';

/**
 * Reactive access to the signed-in user and whether they are an admin.
 *
 * Reuses the exact query key / staleTime that `AuthUserSync.svelte` registers
 * (`['me', clerkUserId]`), so consumers read from the shared TanStack cache and
 * never trigger a second network request.
 */
export function useMe() {
	const clerk = useClerkContext();
	const clerkUserId = $derived(clerk.auth.userId);

	const meQuery = createQuery(() => ({
		queryKey: ['me', clerkUserId],
		queryFn: () => graphqlRequest<MeResponse>(ME),
		enabled: clerk.isLoaded && !!clerkUserId,
		staleTime: 5 * 60 * 1000,
	}));

	return {
		get me(): Me | null {
			return meQuery.data?.me ?? null;
		},
		get isAdmin(): boolean {
			return meQuery.data?.me?.role === 'ADMIN';
		},
		/** True once the ME query finished successfully (data or explicit null me). */
		get isSettled(): boolean {
			return meQuery.isSuccess || meQuery.isError;
		},
		get isSuccess(): boolean {
			return meQuery.isSuccess;
		},
		get isError(): boolean {
			return meQuery.isError;
		},
	};
}
