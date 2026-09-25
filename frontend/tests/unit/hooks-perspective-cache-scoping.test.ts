/**
 * Regression test for gap #3 in the UI gap audit: useCreatePerspective/
 * useUpdatePerspective used to scope their cache writes to
 * `queryKeys.perspectives.lists()`, a prefix shared by listByUser,
 * listByContent and activityFeed. TanStack's default (non-exact) key matching
 * treats a prefix match as "the same cache entry", so a create/update on one
 * content/user leaked its PerspectiveItem row into every other cached
 * perspective list, including a different content's Compare picker and the
 * activityFeed cache (a different row shape — ActivityPerspectiveItem, with
 * nested `content` and no rating fields — so the leaked row rendered with no
 * title/thumbnail there), regardless of privacy.
 *
 * Unlike the mocked hook tests (hooks-useCreatePerspective.test.ts,
 * hooks-useUpdatePerspective.test.ts), this drives the hooks against a real
 * QueryClient so "did cache X actually change" is verified by reading the
 * cache back, not by inspecting which mock calls were made.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';
import { queryKeys } from '$lib/queries/keys';
import type {
	ListPerspectivesByUserResponse,
	ListActivityPerspectivesResponse,
	PerspectiveItem,
	ActivityPerspectiveItem,
} from '$lib/queries/perspectives';

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

function activityRow(overrides: Partial<ActivityPerspectiveItem> = {}): ActivityPerspectiveItem {
	return {
		id: '1',
		userID: '42',
		contentID: '10',
		privacy: 'PUBLIC',
		description: null,
		content: { id: '10', name: 'Some Video', url: null, channelTitle: 'A Channel', length: 100, lengthUnits: null },
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
	client.setQueryData<ListActivityPerspectivesResponse>(queryKeys.perspectives.activityFeed(true), {
		perspectives: { items: [activityRow({ id: 'private-feed-row' })] },
	});
	client.setQueryData<ListActivityPerspectivesResponse>(queryKeys.perspectives.activityFeed(false), {
		perspectives: { items: [activityRow({ id: 'public-feed-row' })] },
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

	it('does not insert a PerspectiveItem-shaped row into either activityFeed cache', async () => {
		const beforePrivate = client.getQueryData(queryKeys.perspectives.activityFeed(true));
		const beforePublic = client.getQueryData(queryKeys.perspectives.activityFeed(false));
		await capturedCreateOptions.onMutate({ userID: 42, contentID: 10, quality: 5000 });
		capturedCreateOptions.onSuccess(
			{ createPerspective: userRow() },
			{ userID: 42, contentID: 10 },
			{ previous: [], tempId: 'x' },
		);
		expect(client.getQueryData(queryKeys.perspectives.activityFeed(true))).toBe(beforePrivate);
		expect(client.getQueryData(queryKeys.perspectives.activityFeed(false))).toBe(beforePublic);
	});

	it('a PRIVATE create leaves the public-only activity feed untouched (no privacy leak)', async () => {
		const beforePublic = client.getQueryData(queryKeys.perspectives.activityFeed(false));
		await capturedCreateOptions.onMutate({ userID: 42, contentID: 10, quality: 5000, privacy: 'PRIVATE' });
		capturedCreateOptions.onSuccess(
			{ createPerspective: userRow({ privacy: 'PRIVATE' }) },
			{ userID: 42, contentID: 10, privacy: 'PRIVATE' },
			{ previous: [], tempId: 'x' },
		);
		expect(client.getQueryData(queryKeys.perspectives.activityFeed(false))).toBe(beforePublic);
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

	it('marks the activity feeds and the created content’s listByContent as invalidated (refetch on next mount)', async () => {
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
		expect(client.getQueryState(queryKeys.perspectives.activityFeed(true))?.isInvalidated).toBe(true);
		expect(client.getQueryState(queryKeys.perspectives.activityFeed(false))?.isInvalidated).toBe(true);
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
	it('patches a row cached under listByContent, but never inserts into activityFeed', async () => {
		client.setQueryData<ListPerspectivesByUserResponse>(queryKeys.perspectives.listByContent(10), {
			perspectives: { items: [userRow({ id: '5', quality: 1000 })] },
		});
		const beforeFeed = client.getQueryData(queryKeys.perspectives.activityFeed(false));

		await capturedUpdateOptions.onMutate({ id: 5, quality: 9000 });
		capturedUpdateOptions.onSuccess({ updatePerspective: userRow({ id: '5', quality: 9000 }) });

		const patched = client.getQueryData<ListPerspectivesByUserResponse>(queryKeys.perspectives.listByContent(10));
		expect(patched?.perspectives.items[0]).toMatchObject({ id: '5', quality: 9000 });
		expect(client.getQueryData(queryKeys.perspectives.activityFeed(false))).toBe(beforeFeed);
	});

	it('a PUBLIC→PRIVATE toggle invalidates (does not patch) the activity feeds so the row can be re-filtered server-side', async () => {
		client.setQueryData<ListPerspectivesByUserResponse>(queryKeys.perspectives.listByContent(10), {
			perspectives: { items: [userRow({ id: '5', privacy: 'PUBLIC' })] },
		});

		await capturedUpdateOptions.onMutate({ id: 5, privacy: 'PRIVATE' });
		capturedUpdateOptions.onSuccess({ updatePerspective: userRow({ id: '5', privacy: 'PRIVATE' }) });

		expect(client.getQueryState(queryKeys.perspectives.activityFeed(false))?.isInvalidated).toBe(true);
		expect(client.getQueryState(queryKeys.perspectives.activityFeed(true))?.isInvalidated).toBe(true);
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
