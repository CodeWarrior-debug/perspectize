/**
 * Cache contract for the import staging hooks (frontend/CLAUDE.md, "Query
 * caching & call budget"), against a real QueryClient.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hashKey, type QueryClient } from '@tanstack/svelte-query';
import { queryKeys } from '$lib/queries/keys';
import {
	IMPORT_JOB_POLL_MS,
	IMPORT_JOB_STALE_TIME_MS,
	type ImportItem,
	type ImportJob,
	type ImportJobResponse,
} from '$lib/queries/imports';
import { importJobIsBusy, useImportJob } from '$lib/queries/imports/useImportJob';
import { importItemsOnSuccess } from '$lib/queries/imports/useImportItems';
import { useImportItemDetails } from '$lib/queries/imports/useImportItemDetails';
import { graphqlRequest } from '$lib/queries/client';
import { invalidationOutcome, makeClient, mountConsumers, seed } from '../helpers/queryBudget';

let client: QueryClient;
let captured: any;

vi.mock('@tanstack/svelte-query', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@tanstack/svelte-query')>();
	return {
		...actual,
		createQuery: vi.fn((optionsFn: () => any) => {
			captured = optionsFn;
			return {};
		}),
		useQueryClient: () => client,
	};
});
vi.mock('$lib/queries/client', () => ({ graphqlRequest: vi.fn() }));

function item(overrides: Partial<ImportItem> = {}): ImportItem {
	return {
		id: '1',
		sourceId: '10',
		destinationType: 'YOUTUBE_VIDEO',
		kind: 'VIDEO',
		externalId: 'abc',
		url: 'https://www.youtube.com/watch?v=abc',
		title: 'A video',
		summary: null,
		publishedAt: null,
		durationSeconds: null,
		viewCount: null,
		likeCount: null,
		commentCount: null,
		rating: null,
		ratingCount: null,
		ratingSource: null,
		chapterCount: 0,
		hasCaptions: null,
		genres: [],
		topCast: [],
		thumbnailUrl: null,
		position: 0,
		statsFetchedAt: '2026-10-27T12:00:00Z',
		inLibrary: false,
		contentId: null,
		importStatus: null,
		importError: null,
		importedAt: null,
		...overrides,
	};
}

function job(overrides: Partial<ImportJob> = {}): ImportJob {
	return {
		id: '7',
		name: 'Peterson',
		createdAt: '2026-10-27T12:00:00Z',
		updatedAt: '2026-10-27T12:00:00Z',
		sources: [
			{
				id: '10',
				sourceType: 'YOUTUBE_CHANNEL',
				sourceRef: '@JordanBPeterson',
				title: 'Jordan B Peterson',
				url: null,
				role: null,
				destinationType: 'YOUTUBE_VIDEO',
				status: 'READY',
				statusDetail: null,
				itemCount: 1,
				fetchedAt: null,
			},
		],
		items: [item()],
		...overrides,
	};
}

beforeEach(() => {
	client = makeClient();
	captured = undefined;
	vi.mocked(graphqlRequest).mockReset();
});

describe('useImportJob', () => {
	it('keys each import separately and sends the id it is keyed on', () => {
		useImportJob(() => '7');
		const opts = captured();
		expect(opts.queryKey).toEqual(queryKeys.imports.detail('7'));
		expect(hashKey(queryKeys.imports.detail('7'))).not.toBe(hashKey(queryKeys.imports.detail('8')));
		expect(opts.staleTime).toBe(IMPORT_JOB_STALE_TIME_MS);
	});

	it('is disabled until signed in and for an empty id', () => {
		useImportJob(
			() => '7',
			() => false,
		);
		expect(captured().enabled).toBe(false);
		useImportJob(() => '');
		expect(captured().enabled).toBe(false);
	});

	it('three consumers of one sheet cost one network call', async () => {
		vi.mocked(graphqlRequest).mockResolvedValue({ importJob: job() } satisfies ImportJobResponse);
		useImportJob(() => '7');
		const { queryKey, queryFn, staleTime } = captured();
		const stop = await mountConsumers(client, { queryKey, queryFn, staleTime }, 3);
		expect(graphqlRequest).toHaveBeenCalledTimes(1);
		expect(vi.mocked(graphqlRequest).mock.calls[0][1]).toEqual({ id: '7' });
		stop();
	});

	it('polls while a source is listing or a row is queued, and stops after', () => {
		useImportJob(() => '7');
		const interval = captured().refetchInterval as (q: { state: { data?: ImportJobResponse } }) => number | false;
		const listing = job({ sources: [{ ...job().sources[0], status: 'LISTING' }] });
		const queued = job({ items: [item({ importStatus: 'QUEUED' })] });
		const done = job({ items: [item({ importStatus: 'IMPORTED', inLibrary: true })] });

		expect(interval({ state: { data: { importJob: listing } } })).toBe(IMPORT_JOB_POLL_MS);
		expect(interval({ state: { data: { importJob: queued } } })).toBe(IMPORT_JOB_POLL_MS);
		expect(interval({ state: { data: { importJob: done } } })).toBe(false);
		expect(interval({ state: {} })).toBe(false);
		expect(importJobIsBusy(null)).toBe(false);
	});
});

describe('useImportItemDetails', () => {
	it('is keyed per row and disabled with no row', () => {
		useImportItemDetails(() => '42');
		expect(captured().queryKey).toEqual(queryKeys.imports.itemDetails('42'));
		expect(captured().enabled).toBe(true);
		useImportItemDetails(() => '');
		expect(captured().enabled).toBe(false);
	});
});

describe('eviction: importItemsOnSuccess', () => {
	it("evicts that import's sheet and the Activity content lists, nothing else", async () => {
		const affected = [queryKeys.imports.detail('7'), queryKeys.content.list({ first: 50 })];
		const untouched = [
			queryKeys.imports.detail('8'),
			queryKeys.imports.list(),
			queryKeys.imports.itemDetails('1'),
			queryKeys.content.detail('3'),
			queryKeys.users.list(),
		];
		for (const k of [...affected, ...untouched]) seed(client, k);

		await importItemsOnSuccess(client, { jobId: '7', itemIds: ['1', '2'] });

		const outcome = invalidationOutcome(client, [...affected, ...untouched]);
		expect(outcome.invalidated).toEqual(affected);
		expect(outcome.untouched).toEqual(untouched);
	});
});
