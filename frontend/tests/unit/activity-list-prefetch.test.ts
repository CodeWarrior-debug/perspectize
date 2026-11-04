/**
 * Route prefetch of the Activity list (#636). Runs against a REAL QueryClient, and fakes only the
 * GraphQL transport (graphql-request), so the real client.ts paths run and the headers can be read.
 *
 * Covers: key parity with the consumer, one network call for prefetch + mounts, joining an
 * in-flight prefetch, skipping viewer-scoped requests, no Authorization header, recovery after a
 * failed prefetch, and the route load's demo/SSR skips.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hashKey, QueryObserver, type QueryClient } from '@tanstack/svelte-query';
import { activityListRequest, type ContentFilterInput } from '$lib/queries/content';
import { prefetchActivityList, isViewerScoped } from '$lib/queries/content/prefetchActivityList';
import { LIST_CONTENT, type ContentResponse } from '$lib/queries/content';
import { graphqlRequest, graphqlRequestAnonymous } from '$lib/queries/client';
import { getAuthToken } from '$lib/auth';
import { parseGridParams } from '$lib/utils/gridUrlState';
import { makeClient, mountConsumers } from '../helpers/queryBudget';

const env = vi.hoisted(() => ({ demo: false, browser: true }));
const requestMock = vi.hoisted(() => vi.fn());

vi.mock('graphql-request', async (importOriginal) => {
	const actual = await importOriginal<typeof import('graphql-request')>();
	class FakeGraphQLClient {
		request(...args: unknown[]) {
			return requestMock(...args);
		}
	}
	return { ...actual, GraphQLClient: FakeGraphQLClient };
});
vi.mock('$lib/auth', () => ({
	DEMO_MODE: false,
	getAuthToken: vi.fn(async () => 'secret-token'),
}));
vi.mock('$app/environment', () => ({
	get browser() {
		return env.browser;
	},
}));

const response: ContentResponse = {
	content: {
		items: [],
		pageInfo: { hasNextPage: true, endCursor: 'c10', hasPreviousPage: false, startCursor: null },
		totalCount: 0,
	},
} as unknown as ContentResponse;

const request = (qs: string) => activityListRequest(parseGridParams(new URLSearchParams(qs)), null);

/** Options a component's useX would pass: same key, same variables, authenticated fetch. */
const consumerOptions = (req: ReturnType<typeof request>) => ({
	queryKey: req.queryKey,
	queryFn: () => graphqlRequest<ContentResponse>(LIST_CONTENT, req.variables),
	staleTime: 60 * 1000,
});

let client: QueryClient;

beforeEach(() => {
	client = makeClient();
	requestMock.mockReset();
	requestMock.mockResolvedValue(response);
	vi.mocked(getAuthToken).mockClear();
	env.demo = false;
	env.browser = true;
});

describe('key parity: the prefetched entry is the one ActivityTable reads', () => {
	it.each([
		['default (Loaded, first load)', ''],
		['"All" mode with a sort', 'mode=all&sort=views.desc'],
		['"All" mode with a type filter', 'mode=all&f.type=movie'],
		['search text', 'q=matrix'],
		['"Loaded" mode', 'mode=loaded'],
	])('%s: the consumer key finds the prefetched data', async (_name, qs) => {
		const req = request(qs);
		await prefetchActivityList(client, req);

		const consumerKey = request(qs).queryKey;
		expect(hashKey(consumerKey)).toBe(hashKey(req.queryKey));
		expect(client.getQueryData<ContentResponse>(consumerKey)).toEqual(response);
	});
});

describe('call budget', () => {
	it('prefetch then two mounts inside staleTime cost exactly one list request', async () => {
		const req = request('');
		await prefetchActivityList(client, req);
		const stop = await mountConsumers(client, consumerOptions(req), 2);

		expect(requestMock).toHaveBeenCalledTimes(1);
		stop();
	});

	it('a mount that starts while the prefetch is in flight joins it (no second request)', async () => {
		const req = request('');
		let resolve!: (value: ContentResponse) => void;
		requestMock.mockImplementationOnce(() => new Promise<ContentResponse>((r) => (resolve = r)));

		const prefetching = prefetchActivityList(client, req);
		const observer = new QueryObserver(client, consumerOptions(req));
		const unsubscribe = observer.subscribe(() => {});
		expect(requestMock).toHaveBeenCalledTimes(1);

		resolve(response);
		await prefetching;
		await vi.waitFor(() => expect(observer.getCurrentResult().data).toEqual(response));
		expect(requestMock).toHaveBeenCalledTimes(1);
		unsubscribe();
	});
});

describe('skips', () => {
	it('does nothing when the request is viewer-scoped (filter.minPerspectiveCount)', async () => {
		const req = request('');
		const scoped = {
			...req,
			variables: { ...req.variables, filter: { minPerspectiveCount: 2 } as unknown as ContentFilterInput },
		};

		expect(isViewerScoped(scoped)).toBe(true);
		await prefetchActivityList(client, scoped);
		expect(requestMock).not.toHaveBeenCalled();
		expect(client.getQueryCache().getAll()).toHaveLength(0);
	});

	it('an ordinary Activity request is not viewer-scoped', () => {
		expect(isViewerScoped(request('mode=all&f.type=movie'))).toBe(false);
	});
});

describe('anonymous fetch', () => {
	it('the prefetch sends no Authorization header and never asks Clerk for a token', async () => {
		await prefetchActivityList(client, request(''));

		const headers = requestMock.mock.calls[0][2] as Record<string, string>;
		expect(headers).not.toHaveProperty('Authorization');
		expect(getAuthToken).not.toHaveBeenCalled();
	});

	it('for contrast, the authenticated consumer path does send the token', async () => {
		await graphqlRequest(LIST_CONTENT, {});

		const headers = requestMock.mock.calls[0][2] as Record<string, string>;
		expect(headers.Authorization).toBe('Bearer secret-token');
	});

	it('graphqlRequestAnonymous is exported for the prefetch path', async () => {
		await graphqlRequestAnonymous(LIST_CONTENT, {});
		expect(getAuthToken).not.toHaveBeenCalled();
	});
});

describe('failed prefetch', () => {
	it('is swallowed, leaves no data, and the next mount refetches and succeeds', async () => {
		const req = request('');
		requestMock.mockRejectedValueOnce(new Error('network down'));

		await expect(prefetchActivityList(client, req)).resolves.toBeUndefined();
		expect(client.getQueryData(req.queryKey)).toBeUndefined();
		expect(client.getQueryState(req.queryKey)?.status).toBe('error');

		const stop = await mountConsumers(client, consumerOptions(req), 1);
		expect(requestMock).toHaveBeenCalledTimes(2);
		expect(client.getQueryData<ContentResponse>(req.queryKey)).toEqual(response);
		expect(client.getQueryState(req.queryKey)?.status).toBe('success');
		stop();
	});
});

describe('route load (routes/+page.ts)', () => {
	it('prefetches the Activity list for the URL state in a browser, outside demo mode', async () => {
		const { load } = await import('../../src/routes/+page');
		const result = load({ url: new URL('http://localhost/?mode=all&f.type=movie') } as never);

		expect(result).toBeUndefined(); // not awaited: the page never waits on the prefetch
		expect(requestMock).toHaveBeenCalledTimes(1);
		const variables = requestMock.mock.calls[0][1] as Record<string, unknown>;
		expect(variables.first).toBe(10); // "All" mode sends the URL page size
	});

	it('skips the prefetch in demo mode (no Clerk gate to overlap)', async () => {
		vi.resetModules();
		vi.doMock('$lib/auth', () => ({ DEMO_MODE: true, getAuthToken: vi.fn() }));
		const { load } = await import('../../src/routes/+page');
		load({ url: new URL('http://localhost/') } as never);
		expect(requestMock).not.toHaveBeenCalled();
		vi.doUnmock('$lib/auth');
	});

	it('skips the prefetch when not in a browser (SSR)', async () => {
		env.browser = false;
		const { load } = await import('../../src/routes/+page');
		load({ url: new URL('http://localhost/') } as never);
		expect(requestMock).not.toHaveBeenCalled();
	});
});
