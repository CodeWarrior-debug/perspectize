/**
 * Cache contract for useLibraryList (frontend/CLAUDE.md, "Query caching & call budget"), against a
 * real QueryClient. Key parity with the route prefetch is in library-list-prefetch.test.ts and the
 * key-per-variable rule in library-list-request.test.ts; this file covers what the hook adds: no
 * fetch on a prefetched mount, one fetch for two mounts, and the cursor stack.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import type { QueryClient } from '@tanstack/svelte-query';
import { LIST_CONTENT, libraryListRequest, type ContentResponse } from '#lib/queries/content/index.js';
import { graphqlRequest } from '#lib/queries/client.js';
import { parseGridParams } from '#lib/utils/gridUrlState.js';
import type { useLibraryList } from '#lib/queries/content/useLibraryList.svelte.js';
import LibraryListProbe from '../helpers/LibraryListProbe.svelte';
import { makeClient } from '../helpers/queryBudget';

let client: QueryClient;

vi.mock('@tanstack/svelte-query', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@tanstack/svelte-query')>();
	return {
		...actual,
		// Every query the hook creates (the list and the usernames lookup) runs on the test's client.
		createQuery: (options: Parameters<typeof actual.createQuery>[0]) => actual.createQuery(options, () => client),
	};
});
vi.mock('#lib/queries/client.js', () => ({ graphqlRequest: vi.fn() }));

function page(endCursor: string, items = 2): ContentResponse {
	return {
		content: {
			items: Array.from({ length: items }, (_, i) => ({
				id: `${endCursor}-${i}`,
				name: `Item ${i}`,
				addedByUserID: '1',
			})),
			pageInfo: { hasNextPage: true, endCursor, hasPreviousPage: false, startCursor: null },
			totalCount: 40,
		},
	} as unknown as ContentResponse;
}

const request = (qs: string, after: string | null = null) =>
	libraryListRequest(parseGridParams(new URLSearchParams(qs)), after);

/** The LIST_CONTENT calls made so far (the usernames lookup is a different document). */
function listCalls() {
	return vi.mocked(graphqlRequest).mock.calls.filter(([doc]) => doc === LIST_CONTENT);
}

beforeEach(() => {
	client = makeClient();
	vi.mocked(graphqlRequest).mockReset();
	vi.mocked(graphqlRequest).mockImplementation(async (doc: unknown, vars?: unknown) => {
		if (doc !== LIST_CONTENT) return { users: [] };
		const after = (vars as { after: string | null }).after;
		return page(after === null ? 'c10' : `${after}-next`);
	});
});

describe('useLibraryList cache contract', () => {
	it('a prefetched page costs no list fetch on mount', async () => {
		client.setQueryData(request('').queryKey, page('c10'));
		render(LibraryListProbe, { props: { qs: '' } });
		await waitFor(() => expect(screen.getByTestId('probe-rows').textContent).toBe('2'));
		expect(listCalls()).toHaveLength(0);
	});

	it('two Libraries on the same params cost one list fetch', async () => {
		render(LibraryListProbe, { props: { qs: 'mode=all' } });
		render(LibraryListProbe, { props: { qs: 'mode=all' } });
		await waitFor(() => expect(screen.getAllByTestId('probe-total').map((el) => el.textContent)).toEqual(['40', '40']));
		expect(listCalls()).toHaveLength(1);
	});

	it('Next after a cache hit sends the loaded page’s cursor (queryFn never ran for page 1)', async () => {
		client.setQueryData(request('mode=all').queryKey, page('c10'));
		const probe = render(LibraryListProbe, { props: { qs: 'mode=all' } });
		await waitFor(() => expect(screen.getByTestId('probe-rows').textContent).toBe('2'));
		expect(listCalls()).toHaveLength(0);

		await probe.rerender({ qs: 'mode=all&page=2' });
		await waitFor(() => expect(listCalls()).toHaveLength(1));
		expect(listCalls()[0][1]).toMatchObject({ after: 'c10' });
	});

	it('resetCursors() drops the stack: the list is back on the first page, served from cache', async () => {
		let list!: ReturnType<typeof useLibraryList>;
		const probe = render(LibraryListProbe, {
			props: { qs: 'mode=all', onList: (l: ReturnType<typeof useLibraryList>) => (list = l) },
		});
		await waitFor(() => expect(screen.getByTestId('probe-first').textContent).toBe('c10-0'));

		await probe.rerender({ qs: 'mode=all&page=2' });
		await waitFor(() => expect(screen.getByTestId('probe-first').textContent).toBe('c10-next-0'));
		expect(listCalls().map(([, vars]) => (vars as { after: string | null }).after)).toEqual([null, 'c10']);

		// The key carries the cursor, not the page number, so with no cursor the request is page 1's.
		list.resetCursors();
		await waitFor(() => expect(screen.getByTestId('probe-first').textContent).toBe('c10-0'));
		expect(listCalls()).toHaveLength(2);
	});

	it('"Loaded" mode never sends a cursor', async () => {
		render(LibraryListProbe, { props: { qs: 'mode=loaded&page=2' } });
		await waitFor(() => expect(listCalls()).toHaveLength(1));
		expect(listCalls()[0][1]).toMatchObject({ after: null });
	});
});
