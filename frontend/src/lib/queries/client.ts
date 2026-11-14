import { GraphQLClient } from 'graphql-request';
import { QueryClient } from '@tanstack/svelte-query';
import { browser } from '$app/environment';
import { clientInfoHeaders } from '$lib/buildInfo';
import { getAuthToken } from '$lib/auth';

/** GraphQL HTTP endpoint (VITE_GRAPHQL_URL build var, localhost fallback). */
export const GRAPHQL_ENDPOINT = import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:8080/graphql';

if (!import.meta.env.VITE_GRAPHQL_URL && import.meta.env.PROD) {
	console.error(
		'VITE_GRAPHQL_URL is not set — GraphQL requests will fail in production.',
		'Set VITE_GRAPHQL_URL as a BUILD_TIME environment variable in your deployment platform.',
	);
}

console.debug('[GraphQL] endpoint:', GRAPHQL_ENDPOINT);

export const graphqlClient = new GraphQLClient(GRAPHQL_ENDPOINT);

/**
 * The one TanStack QueryClient. A module singleton (not created in a component) so the route
 * load (routes/content-library/+page.ts) can prefetch into the same cache the app reads from, before any
 * component mounts. The app is SPA-only (ssr = false), so there is no per-request cache to share.
 */
export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			enabled: browser,
			staleTime: 60 * 1000,
			retry: 1,
		},
	},
});

// Token source (Clerk session, or the demo persona in demo mode) lives in
// $lib/auth; re-exported so existing importers keep working.
export { getAuthToken };

/**
 * Make a GraphQL request with optional auth.
 * Automatically includes Bearer token if user is signed in, plus the
 * X-Client-Version / X-Client-Platform headers on every request.
 */
export async function graphqlRequest<T>(document: string, variables?: Record<string, unknown>): Promise<T> {
	const token = await getAuthToken();
	const headers: Record<string, string> = clientInfoHeaders();
	if (token) {
		headers['Authorization'] = `Bearer ${token}`;
	}
	return graphqlClient.request<T>(document, variables, headers);
}

/**
 * Like graphqlRequest, but sends no Authorization header and never awaits Clerk. Only for a
 * request whose result is the same for a signed-out and a signed-in viewer (the Activity list,
 * unless filter.minPerspectiveCount is set). Used by the route prefetch (#636).
 */
export function graphqlRequestAnonymous<T>(document: string, variables?: Record<string, unknown>): Promise<T> {
	return graphqlClient.request<T>(document, variables, clientInfoHeaders());
}
