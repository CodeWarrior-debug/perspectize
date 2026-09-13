import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { GraphQLClient } from 'graphql-request';

let graphqlClient: GraphQLClient;
let graphqlRequest: (document: string, variables?: Record<string, unknown>) => Promise<unknown>;
let getAuthToken: () => Promise<string | null>;

beforeEach(async () => {
	vi.resetModules();
	const mod = await import('$lib/queries/client');
	graphqlClient = mod.graphqlClient;
	graphqlRequest = mod.graphqlRequest;
	getAuthToken = mod.getAuthToken;
});

describe('GraphQL client', () => {
	it('exports a graphqlClient instance', () => {
		expect(graphqlClient).toBeDefined();
		expect(typeof graphqlClient.request).toBe('function');
	});

	it('client has request method for making GraphQL calls', () => {
		expect(graphqlClient).toHaveProperty('request');
		expect(graphqlClient).toHaveProperty('rawRequest');
	});

	it('exports graphqlRequest function', () => {
		expect(graphqlRequest).toBeDefined();
		expect(typeof graphqlRequest).toBe('function');
	});

	it('exports getAuthToken function', () => {
		expect(getAuthToken).toBeDefined();
		expect(typeof getAuthToken).toBe('function');
	});

	it('getAuthToken returns null when Clerk is not available', async () => {
		const token = await getAuthToken();
		expect(token).toBeNull();
	});

	it('getAuthToken returns the session token when Clerk is signed in', async () => {
		(window as any).Clerk = { session: { getToken: vi.fn().mockResolvedValue('tok_123') } };
		try {
			expect(await getAuthToken()).toBe('tok_123');
		} finally {
			delete (window as any).Clerk;
		}
	});

	it('getAuthToken returns null if Clerk.session.getToken throws', async () => {
		(window as any).Clerk = { session: { getToken: vi.fn().mockRejectedValue(new Error('boom')) } };
		try {
			expect(await getAuthToken()).toBeNull();
		} finally {
			delete (window as any).Clerk;
		}
	});

	it('graphqlRequest sends no Authorization header when signed out', async () => {
		const requestSpy = vi.spyOn(graphqlClient, 'request').mockResolvedValue({ ok: true });
		await graphqlRequest('query { __typename }');
		expect(requestSpy).toHaveBeenCalledWith('query { __typename }', undefined, {});
	});

	it('graphqlRequest includes a Bearer Authorization header when signed in', async () => {
		(window as any).Clerk = { session: { getToken: vi.fn().mockResolvedValue('tok_abc') } };
		const requestSpy = vi.spyOn(graphqlClient, 'request').mockResolvedValue({ ok: true });
		try {
			await graphqlRequest('query { __typename }', { id: 1 });
			expect(requestSpy).toHaveBeenCalledWith('query { __typename }', { id: 1 }, { Authorization: 'Bearer tok_abc' });
		} finally {
			delete (window as any).Clerk;
		}
	});

	it('uses default endpoint when VITE_GRAPHQL_URL is not set', () => {
		expect(graphqlClient).toBeDefined();
	});

	it('logs error in production when VITE_GRAPHQL_URL is not set', async () => {
		vi.resetModules();
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		// Simulate production without VITE_GRAPHQL_URL
		const originalEnv = import.meta.env.PROD;
		import.meta.env.PROD = true;
		import.meta.env.VITE_GRAPHQL_URL = '';

		try {
			await import('$lib/queries/client');
			expect(consoleSpy).toHaveBeenCalledWith(
				'VITE_GRAPHQL_URL is not set — GraphQL requests will fail in production.',
				'Set VITE_GRAPHQL_URL as a BUILD_TIME environment variable in your deployment platform.',
			);
		} finally {
			import.meta.env.PROD = originalEnv;
			consoleSpy.mockRestore();
		}
	});
});
