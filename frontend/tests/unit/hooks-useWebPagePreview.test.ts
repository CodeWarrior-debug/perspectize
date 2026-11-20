import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hashKey } from '@tanstack/svelte-query';
import { preloadLazy } from '../helpers/warmUp';

const { mockGraphqlRequest } = vi.hoisted(() => ({ mockGraphqlRequest: vi.fn() }));

let capturedQueryOptions: any;

vi.mock('@tanstack/svelte-query', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@tanstack/svelte-query')>();
	return {
		...actual,
		createQuery: vi.fn((optionsFn: () => any) => {
			capturedQueryOptions = optionsFn();
			return { data: undefined, isPending: true };
		}),
	};
});

vi.mock('#lib/queries/client.js', () => ({ graphqlRequest: mockGraphqlRequest }));

const URL_A = 'https://arxiv.org/abs/1706.03762';
const URL_B = 'https://example.com/post';

async function mountPreview(url: string | null) {
	const { useWebPagePreview } = await import('#lib/queries/content/useWebPagePreview.js');
	useWebPagePreview(() => url);
	return capturedQueryOptions;
}

// The tests import these inside their bodies; load them once up front so the first
// test doesn't pay the module transform, which balloons under full-suite load (#728).
preloadLazy(
	() => import('#lib/queries/content/index.js'),
	() => import('#lib/queries/content/useWebPagePreview.js'),
	() => import('#lib/queries/keys.js'),
);

describe('useWebPagePreview', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		capturedQueryOptions = undefined;
	});

	it('is disabled when there is no url, so no request is sent', async () => {
		const options = await mountPreview(null);
		expect(options.enabled).toBe(false);
	});

	it('is enabled for a url', async () => {
		const options = await mountPreview(URL_A);
		expect(options.enabled).toBe(true);
	});

	it('keys on the url: a different url gets a different key, the same url an equal one', async () => {
		const a = await mountPreview(URL_A);
		const aAgain = await mountPreview(URL_A);
		const b = await mountPreview(URL_B);
		expect(hashKey(a.queryKey)).toBe(hashKey(aAgain.queryKey));
		expect(hashKey(a.queryKey)).not.toBe(hashKey(b.queryKey));
	});

	it('stays out of the content list keys, so a list invalidation does not refetch it', async () => {
		const { queryKeys } = await import('#lib/queries/keys.js');
		const options = await mountPreview(URL_A);
		const listKey = queryKeys.content.lists();
		expect(options.queryKey.slice(0, listKey.length)).not.toEqual(listKey);
	});

	it('is cached for a deliberate window (the page is read once; the preview does not change minute to minute)', async () => {
		const { WEB_PAGE_PREVIEW_STALE_TIME_MS } = await import('#lib/queries/content/useWebPagePreview.js');
		const options = await mountPreview(URL_A);
		expect(options.staleTime).toBe(WEB_PAGE_PREVIEW_STALE_TIME_MS);
		expect(WEB_PAGE_PREVIEW_STALE_TIME_MS).toBeGreaterThan(0);
	});

	it('sends the url through the authenticated graphqlRequest wrapper and unwraps previewWebPage', async () => {
		mockGraphqlRequest.mockResolvedValue({ previewWebPage: { title: 'Attention', alreadyExistsContentId: null } });
		const { PREVIEW_WEB_PAGE } = await import('#lib/queries/content/index.js');
		const options = await mountPreview(URL_A);
		const result = await options.queryFn();
		expect(mockGraphqlRequest).toHaveBeenCalledWith(PREVIEW_WEB_PAGE, { url: URL_A });
		expect(result).toEqual({ title: 'Attention', alreadyExistsContentId: null });
	});

	it('returns null (not undefined) when the server has no preview', async () => {
		mockGraphqlRequest.mockResolvedValue({ previewWebPage: null });
		const options = await mountPreview(URL_A);
		expect(await options.queryFn()).toBeNull();
	});
});
