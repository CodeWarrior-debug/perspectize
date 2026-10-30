/**
 * Regression test for gap #3 in the UI gap audit: useCreatePerspective/
 * useUpdatePerspective used to scope their cache writes to
 * `queryKeys.perspectives.lists()`, a prefix shared by listByUser and
 * listByContent. TanStack's default (non-exact) key matching treats a prefix
 * match as "the same cache entry", so a create/update on one content/user
 * leaked its PerspectiveItem row into every other cached perspective list,
 * including a different content's Compare picker, regardless of privacy.
 *
 * Unlike the mocked hook tests (hooks-useCreatePerspective.test.ts,
 * hooks-useUpdatePerspective.test.ts), this drives the hooks against a real
 * QueryClient so "did cache X actually change" is verified by reading the
 * cache back, not by inspecting which mock calls were made.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';
import { queryKeys } from '$lib/queries/keys';
import type { ListPerspectivesByUserResponse, PerspectiveItem } from '$lib/queries/perspectives';

let client: QueryClient;
let capturedCreateOptions: any;
let capturedUpdateOptions: any;

vi.mock('@tanstack/svelte-query', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@tanstack/svelte-query')>();
	return {
		...actual,
		createMutation: vi.fn((optionsFn: () => any) => {
			// Both hooks call createMutation once each; capture by call order.
			const options = optionsFn();
			if (!capturedCreateOptions) capturedCreateOptions = options;
			else capturedUpdateOptions = options;
			return { mutate: vi.fn(), isPending: false };
		}),
		useQueryClient: () => client,
	};
});

vi.mock('svelte-sonner', () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('$lib/queries/client', () => ({
	graphqlRequest: vi.fn(),
}));

function userRow(overrides: Partial<PerspectiveItem> = {}): PerspectiveItem {
	return {
		id: '1',
		userID: '42',
		contentID: '10',
		quality: 5000,
		agreement: null,
		importance: null,
		confidence: null,
		like: null,
		review: null,
		privacy: 'PUBLIC',
		description: null,
		primaryPerspectiveID: null,
		relatedPerspectiveIDs: null,
		customFields: null,
		feelings: null,
		createdAt: '2026-01-01T00:00:00Z',
		updatedAt: '2026-01-01T00:00:00Z',
		...overrides,
	};
}

beforeEach(async () => {
	vi.clearAllMocks();
	capturedCreateOptions = undefined;
	capturedUpdateOptions = undefined;
	client = new QueryClient();

	// Seed every branch with data belonging to *other* users/content than the
	// mutation under test, so a leak is detectable as "this cache changed".
	client.setQueryData<ListPerspectivesByUserResponse>(queryKeys.perspectives.listByUser(7), {
		perspectives: { items: [userRow({ id: 'other-user-row', userID: '7', contentID: '11' })] },
	});
	client.setQueryData<ListPerspectivesByUserResponse>(queryKeys.perspectives.listByContent(11), {
		perspectives: { items: [userRow({ id: 'other-content-row', contentID: '11' })] },
	});

	const { useCreatePerspective } = await import('$lib/queries/perspectives/useCreatePerspective');
	const { useUpdatePerspective } = await import('$lib/queries/perspectives/useUpdatePerspective');
	useCreatePerspective();
	useUpdatePerspective();
});

describe('perspective cache scoping (create)', () => {
	it("does not touch another user's listByUser cache", async () => {
		const before = client.getQueryData(queryKeys.perspectives.listByUser(7));
		await capturedCreateOptions.onMutate({ userID: 42, contentID: 10, quality: 5000 });
		capturedCreateOptions.onSuccess(
			{ createPerspective: userRow() },
			{ userID: 42, contentID: 10 },
			{ previous: [], tempId: 'x' },
		);
		expect(client.getQueryData(queryKeys.perspectives.listByUser(7))).toBe(before);
	});

	it("does not insert the new row into a different content's listByContent cache", async () => {
		const before = client.getQueryData(queryKeys.perspectives.listByContent(11));
		await capturedCreateOptions.onMutate({ userID: 42, contentID: 10, quality: 5000 });
		capturedCreateOptions.onSuccess(
			{ createPerspective: userRow() },
			{ userID: 42, contentID: 10 },
			{ previous: [], tempId: 'x' },
		);
		expect(client.getQueryData(queryKeys.perspectives.listByContent(11))).toBe(before);
	});

	it("still inserts the optimistic row into the creator's own listByUser cache", async () => {
		client.setQueryData<ListPerspectivesByUserResponse>(queryKeys.perspectives.listByUser(42), {
			perspectives: { items: [] },
		});
		await capturedCreateOptions.onMutate({ userID: 42, contentID: 10, quality: 5000 });
		const data = client.getQueryData<ListPerspectivesByUserResponse>(queryKeys.perspectives.listByUser(42));
		expect(data?.perspectives.items).toHaveLength(1);
		expect(data?.perspectives.items[0]).toMatchObject({ contentID: '10', quality: 5000 });
	});

	it('marks the created content’s listByContent as invalidated (refetch on next mount)', async () => {
		// invalidateQueries only marks a query state that already exists — seed the
		// created content's listByContent(10) cache so there's a state to check.
		client.setQueryData<ListPerspectivesByUserResponse>(queryKeys.perspectives.listByContent(10), {
			perspectives: { items: [] },
		});
		await capturedCreateOptions.onMutate({ userID: 42, contentID: 10, quality: 5000 });
		capturedCreateOptions.onSuccess(
			{ createPerspective: userRow() },
			{ userID: 42, contentID: 10 },
			{ previous: [], tempId: 'x' },
		);
		expect(client.getQueryState(queryKeys.perspectives.listByContent(10))?.isInvalidated).toBe(true);
	});

	it('rolls back the optimistic insert on error without touching other lists', async () => {
		client.setQueryData<ListPerspectivesByUserResponse>(queryKeys.perspectives.listByUser(42), {
			perspectives: { items: [] },
		});
		const beforeOther = client.getQueryData(queryKeys.perspectives.listByUser(7));

		const ctx = await capturedCreateOptions.onMutate({ userID: 42, contentID: 10, quality: 5000 });
		expect(
			client.getQueryData<ListPerspectivesByUserResponse>(queryKeys.perspectives.listByUser(42))?.perspectives.items,
		).toHaveLength(1);

		capturedCreateOptions.onError(new Error('boom'), { userID: 42, contentID: 10 }, ctx);
		expect(
			client.getQueryData<ListPerspectivesByUserResponse>(queryKeys.perspectives.listByUser(42))?.perspectives.items,
		).toHaveLength(0);
		expect(client.getQueryData(queryKeys.perspectives.listByUser(7))).toBe(beforeOther);
	});
});

describe('perspective cache scoping (update)', () => {
	it('patches a row cached under listByContent', async () => {
		client.setQueryData<ListPerspectivesByUserResponse>(queryKeys.perspectives.listByContent(10), {
			perspectives: { items: [userRow({ id: '5', quality: 1000 })] },
		});

		await capturedUpdateOptions.onMutate({ id: 5, quality: 9000 });
		capturedUpdateOptions.onSuccess({ updatePerspective: userRow({ id: '5', quality: 9000 }) });

		const patched = client.getQueryData<ListPerspectivesByUserResponse>(queryKeys.perspectives.listByContent(10));
		expect(patched?.perspectives.items[0]).toMatchObject({ id: '5', quality: 9000 });
	});

	it('does not touch an unrelated content’s listByContent cache', async () => {
		client.setQueryData<ListPerspectivesByUserResponse>(queryKeys.perspectives.listByContent(10), {
			perspectives: { items: [userRow({ id: '5' })] },
		});
		const beforeOther = client.getQueryData(queryKeys.perspectives.listByContent(11));

		await capturedUpdateOptions.onMutate({ id: 5, quality: 9000 });
		capturedUpdateOptions.onSuccess({ updatePerspective: userRow({ id: '5', quality: 9000 }) });

		expect(client.getQueryData(queryKeys.perspectives.listByContent(11))).toBe(beforeOther);
	});
});
