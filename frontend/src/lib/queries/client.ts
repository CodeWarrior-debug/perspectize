import { GraphQLClient } from 'graphql-request';
import { clientInfoHeaders } from '$lib/buildInfo';

const GRAPHQL_ENDPOINT = import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:8080/graphql';

if (!import.meta.env.VITE_GRAPHQL_URL && import.meta.env.PROD) {
	console.error(
		'VITE_GRAPHQL_URL is not set — GraphQL requests will fail in production.',
		'Set VITE_GRAPHQL_URL as a BUILD_TIME environment variable in your deployment platform.',
	);
}

console.debug('[GraphQL] endpoint:', GRAPHQL_ENDPOINT);

export const graphqlClient = new GraphQLClient(GRAPHQL_ENDPOINT);

/**
 * Get current Clerk session token for API requests.
 * Returns null if not authenticated.
 */
export async function getAuthToken(): Promise<string | null> {
	try {
		const token = await window.Clerk?.session?.getToken();
		return token ?? null;
	} catch {
		return null;
	}
}

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
