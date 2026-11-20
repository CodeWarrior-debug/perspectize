/**
 * Cache contract for the webpage add (WEB_PAGE). Runs against a real QueryClient, like
 * query-cache-contract.test.ts: a create must evict exactly the content lists it changed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QueryClient } from '@tanstack/svelte-query';
import { queryKeys } from '#lib/queries/keys.js';
import { invalidationOutcome, makeClient, seed } from '../helpers/queryBudget';
import { preloadLazy } from '../helpers/warmUp';

let client: QueryClient;
let capturedMutationOptions: any;

vi.mock('@tanstack/svelte-query', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@tanstack/svelte-query')>();
	return {
		...actual,
		createMutation: vi.fn((optionsFn: () => any) => {
			capturedMutationOptions = optionsFn();
			return { mutate: vi.fn(), isPending: false };
		}),
		useQueryClient: () => client,
	};
});
vi.mock('svelte-sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('#lib/queries/client.js', () => ({ graphqlRequest: vi.fn() }));

beforeEach(() => {
	client = makeClient();
	capturedMutationOptions = undefined;
});

// The tests import these inside their bodies; load them once up front so the first
// test doesn't pay the module transform, which balloons under full-suite load (#728).
preloadLazy(() => import('#lib/queries/content/useCreateWebPage.js'));

describe('eviction: useCreateWebPage.onSuccess invalidates content lists only', () => {
	it('marks every content list stale and leaves details, rows, previews and other domains alone', async () => {
		const affected = [
			queryKeys.content.list({ first: 50 }),
			queryKeys.content.list({ first: 10, search: 'attention' }),
		];
		const unrelated = [
			queryKeys.content.detail('3'),
			queryKeys.content.row('3'),
			queryKeys.content.webPagePreview('https://arxiv.org/abs/1706.03762'),
			queryKeys.perspectives.listByContent(3),
			queryKeys.users.list(),
			queryKeys.bible.passageText(1, 2),
		];
		for (const k of [...affected, ...unrelated]) seed(client, k);

		const { useCreateWebPage } = await import('#lib/queries/content/useCreateWebPage.js');
		useCreateWebPage();
		capturedMutationOptions.onSuccess({
			createContentFromWebPage: {
				content: { id: '9', name: 'Attention Is All You Need', url: null, contentType: 'WEB_PAGE' },
				alreadyExisted: false,
			},
		});

		const outcome = invalidationOutcome(client, [...affected, ...unrelated]);
		expect(outcome.invalidated).toEqual(affected);
		expect(outcome.untouched).toEqual(unrelated);
	});
});
