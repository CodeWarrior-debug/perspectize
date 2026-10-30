import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockGetPlatform } = vi.hoisted(() => ({ mockGetPlatform: vi.fn() }));

vi.mock('@capacitor/core', () => ({
	Capacitor: { getPlatform: mockGetPlatform },
}));

import { graphqlClient, graphqlRequest } from '$lib/queries/client';
import { APP_VERSION } from '$lib/buildInfo';

beforeEach(() => {
	mockGetPlatform.mockReturnValue('android');
});

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
			'X-Client-Platform': 'android',
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
				'X-Client-Platform': 'android',
			},
		);
	});
});
