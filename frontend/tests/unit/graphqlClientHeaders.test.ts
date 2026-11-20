import { describe, it, expect, vi, afterEach } from 'vitest';

import { graphqlClient, graphqlRequest } from '#lib/queries/client.js';
import { APP_VERSION } from '#lib/buildInfo.js';

afterEach(() => {
	delete (window as any).Clerk;
	vi.restoreAllMocks();
});

describe('graphqlRequest client-info headers', () => {
	it('sends X-Client-Version and X-Client-Platform (no Authorization) when signed out', async () => {
		const requestSpy = vi.spyOn(graphqlClient, 'request').mockResolvedValue({ ok: true });
		await graphqlRequest('query { __typename }');
		expect(requestSpy).toHaveBeenCalledWith('query { __typename }', undefined, {
			'X-Client-Version': APP_VERSION,
			'X-Client-Platform': 'web',
		});
	});

	it('sends X-Client-* alongside Authorization when signed in', async () => {
		(window as any).Clerk = { session: { getToken: vi.fn().mockResolvedValue('tok_xyz') } };
		const requestSpy = vi.spyOn(graphqlClient, 'request').mockResolvedValue({ ok: true });
		await graphqlRequest('query { __typename }', { id: 7 });
		expect(requestSpy).toHaveBeenCalledWith(
			'query { __typename }',
			{ id: 7 },
			{
				Authorization: 'Bearer tok_xyz',
				'X-Client-Version': APP_VERSION,
				'X-Client-Platform': 'web',
			},
		);
	});
});
