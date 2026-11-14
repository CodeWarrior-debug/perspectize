import { describe, it, expect } from 'vitest';
import { graphqlPreconnectOrigin } from '$lib/utils/graphqlOrigin';

describe('graphqlPreconnectOrigin', () => {
	it('returns the origin of an absolute https endpoint, with the path stripped', () => {
		expect(graphqlPreconnectOrigin({ VITE_GRAPHQL_URL: 'https://api.example.test/graphql' })).toBe(
			'https://api.example.test',
		);
	});

	it('keeps an explicit port and drops query and userinfo', () => {
		expect(graphqlPreconnectOrigin({ VITE_GRAPHQL_URL: 'http://user:pw@localhost:8080/graphql?x=1' })).toBe(
			'http://localhost:8080',
		);
	});

	it.each([
		['a relative path', { VITE_GRAPHQL_URL: '/graphql' }],
		['an empty value', { VITE_GRAPHQL_URL: '' }],
		['a missing value', {}],
		['garbage', { VITE_GRAPHQL_URL: 'not a url' }],
		['a markup payload', { VITE_GRAPHQL_URL: 'https://<img src=x onerror=1>.test/graphql' }],
		['a non-http scheme', { VITE_GRAPHQL_URL: 'javascript:alert(1)' }],
		['an IPv6 literal host', { VITE_GRAPHQL_URL: 'https://[::1]:8080/graphql' }],
	])('returns an empty origin for %s', (_label, env) => {
		expect(graphqlPreconnectOrigin(env)).toBe('');
	});

	it('ignores PUBLIC_GRAPHQL_URL, which client.ts never reads', () => {
		expect(graphqlPreconnectOrigin({ PUBLIC_GRAPHQL_URL: 'https://api.example.test/graphql' })).toBe('');
	});
});
