/**
 * Cache-contract tests for the saved-formulas domain (frontend/CLAUDE.md →
 * "Query caching & call budget"; ADR 0002 threat 5). Each hook runs for real except
 * that createQuery/createMutation return their options object, so the tests drive
 * the hook's own queryFn/mutationFn/onSuccess against a REAL QueryClient. The
 * network is mocked at graphqlRequest, so "fetches" counts real hook calls.
 *
 * What the contract pins down:
 *  - the viewer id is part of both list keys (a different user never reads
 *    another's cache), and 'mine' never fires while signed out;
 *  - every variable the queryFn sends is in its queryKey;
 *  - each mutation evicts exactly the lists it changes, and nothing else.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hashKey, type QueryClient, type QueryKey } from '@tanstack/svelte-query';
import { queryKeys } from '#lib/queries/keys.js';
import { invalidationOutcome, makeClient, mountConsumers, seed } from '../helpers/queryBudget';
import {
	SAVED_FORMULA_STALE_TIME_MS,
	SHARED_FORMULA_STALE_TIME_MS,
	type SavedFormula,
	type SavedFormulaListArgs,
	type SavedItem,
} from '#lib/queries/savedFormulas/index.js';
import { useMySavedFormulas } from '#lib/queries/savedFormulas/useMySavedFormulas.js';
import { useSharedFormulas } from '#lib/queries/savedFormulas/useSharedFormulas.js';
import { useCreateSavedFormula } from '#lib/queries/savedFormulas/useCreateSavedFormula.js';
import { useUpdateSavedFormula } from '#lib/queries/savedFormulas/useUpdateSavedFormula.js';
import { useDeleteSavedItem } from '#lib/queries/savedFormulas/useDeleteSavedItem.js';
import { useRestoreSavedItem } from '#lib/queries/savedFormulas/useRestoreSavedItem.js';
import { useSetSavedItemPrivacy } from '#lib/queries/savedFormulas/useSetSavedItemPrivacy.js';
import { useCopySavedItem } from '#lib/queries/savedFormulas/useCopySavedItem.js';
import { useLinkSavedItem } from '#lib/queries/savedFormulas/useLinkSavedItem.js';
import { useConvertLinkToCopy } from '#lib/queries/savedFormulas/useConvertLinkToCopy.js';

const { graphqlRequest, viewer } = vi.hoisted(() => ({
	graphqlRequest: vi.fn(),
	viewer: { id: 'user_a' as string | null },
}));

vi.mock('#lib/auth/useAuthState.js', () => ({
	useAuthState: () => ({
		get isLoaded() {
			return true;
		},
		get userId() {
			return viewer.id;
		},
	}),
}));

let client: QueryClient;

vi.mock('@tanstack/svelte-query', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@tanstack/svelte-query')>();
	return {
		...actual,
		// Return the options object itself so the hook's queryFn/mutationFn/onSuccess can be driven directly.
		createQuery: (optionsFn: () => unknown) => optionsFn(),
		createMutation: (optionsFn: () => unknown) => optionsFn(),
		useQueryClient: () => client,
	};
});
vi.mock('#lib/queries/client.js', () => ({ graphqlRequest }));

interface HookOptions {
	queryKey: QueryKey;
	queryFn: () => Promise<unknown>;
	staleTime?: number;
	enabled?: boolean;
}

interface HookMutation {
	mutationFn: (input: any) => Promise<any>;
	onSuccess: (data: any, variables: any) => void;
}

const asOptions = (hook: unknown) => hook as HookOptions;
const asMutation = (hook: unknown) => hook as HookMutation;

const PAGE: SavedFormulaListArgs = { first: 10 };
const NEXT_PAGE: SavedFormulaListArgs = { first: 10, after: 'cursor:9' };

// Viewer A's own lists (both pages), viewer B's own, and the shared list per viewer and anonymous.
const MINE_A = queryKeys.savedFormulas.mine('user_a', PAGE);
const MINE_A_NEXT = queryKeys.savedFormulas.mine('user_a', NEXT_PAGE);
const MINE_B = queryKeys.savedFormulas.mine('user_b', PAGE);
const SHARED_A = queryKeys.savedFormulas.shared('user_a', PAGE);
const SHARED_A_NEXT = queryKeys.savedFormulas.shared('user_a', NEXT_PAGE);
const SHARED_B = queryKeys.savedFormulas.shared('user_b', PAGE);
const SHARED_ANON = queryKeys.savedFormulas.shared(null, PAGE);
const ALL_MINE = [MINE_A, MINE_A_NEXT, MINE_B];
const ALL_SHARED = [SHARED_A, SHARED_A_NEXT, SHARED_B, SHARED_ANON];

// Unrelated domains: nothing a saved-formula mutation should touch.
const TODO_LIST = queryKeys.userTodos.list({ first: 10 });
const CONTENT_DETAIL = queryKeys.content.detail('3');
const PERSPECTIVES_BY_USER = queryKeys.perspectives.listByUser(42);
const UNRELATED = [TODO_LIST, CONTENT_DETAIL, PERSPECTIVES_BY_USER];

const PAYLOAD = { expression: { const: 1 } };

function item(overrides: Partial<SavedFormula> = {}): SavedFormula {
	return {
		id: '5',
		type: 'FORMULA',
		name: 'Bang for buck',
		privacy: 'PRIVATE',
		origin: 'OWN',
		sourceId: null,
		sourceAvailable: true,
		payloadVersion: 1,
		user: { id: 'user_a', username: 'a' },
		createdAt: '2026-11-20T12:00:00Z',
		updatedAt: '2026-11-20T12:00:00Z',
		payload: PAYLOAD,
		...overrides,
	};
}

beforeEach(() => {
	client = makeClient();
	graphqlRequest.mockReset();
	graphqlRequest.mockResolvedValue({});
	viewer.id = 'user_a';
});

describe('queryKeys.savedFormulas: the viewer is part of every list key', () => {
	it('mine(viewer, vars) sits under mineFor(viewer), which sits under mineAll-by-viewer', () => {
		const prefix = queryKeys.savedFormulas.mineFor('user_a');
		expect(MINE_A.slice(0, prefix.length)).toEqual([...prefix]);
		expect(MINE_A).toEqual([...queryKeys.savedFormulas.mineFor('user_a'), PAGE]);
	});

	it('two viewers never share a mine entry, and a signed-out viewer has its own', () => {
		expect(hashKey(MINE_A)).not.toBe(hashKey(MINE_B));
		expect(hashKey(queryKeys.savedFormulas.mine(null, PAGE))).not.toBe(hashKey(MINE_A));
	});

	it('two viewers never share a shared entry, and anonymous has its own', () => {
		expect(hashKey(SHARED_A)).not.toBe(hashKey(SHARED_B));
		expect(hashKey(SHARED_ANON)).not.toBe(hashKey(SHARED_A));
	});

	it('sharedAll() is a prefix of every shared key, across viewers, and never of a mine key', () => {
		const prefix = queryKeys.savedFormulas.sharedAll();
		for (const key of ALL_SHARED) expect(key.slice(0, prefix.length)).toEqual([...prefix]);
		for (const key of ALL_MINE) expect(key.slice(0, prefix.length)).not.toEqual([...prefix]);
	});
});

describe('useMySavedFormulas: signed in, de-duplicated, freshness', () => {
	it('is enabled for a signed-in viewer and uses the 2-minute user-scoped staleTime', () => {
		const opts = asOptions(useMySavedFormulas());
		expect(opts.enabled).toBe(true);
		expect(opts.staleTime).toBe(SAVED_FORMULA_STALE_TIME_MS);
		expect(SAVED_FORMULA_STALE_TIME_MS).toBe(120_000);
	});

	it('three consumers of one page cost one network call', async () => {
		graphqlRequest.mockResolvedValue({ mySavedFormulas: { items: [], pageInfo: {}, totalCount: null } });
		await mountConsumers(client, asOptions(useMySavedFormulas()), 3);
		expect(graphqlRequest).toHaveBeenCalledTimes(1);
	});

	it('a remount inside staleTime costs no call', async () => {
		const opts = asOptions(useMySavedFormulas());
		(await mountConsumers(client, opts, 1))();
		(await mountConsumers(client, opts, 1))();
		expect(graphqlRequest).toHaveBeenCalledTimes(1);
	});

	it('defaults to the SDL page size of 10 and sends exactly the variables it keys on', async () => {
		const opts = asOptions(useMySavedFormulas());
		expect(opts.queryKey).toEqual(queryKeys.savedFormulas.mine('user_a', { first: 10 }));
		await opts.queryFn();
		expect(graphqlRequest.mock.calls[0][1]).toEqual({ first: 10 });
	});

	it('passes a caller-supplied first, after and includeTotalCount through to the key and the request', async () => {
		const args = { first: 25, after: 'cursor:24', includeTotalCount: true };
		const opts = asOptions(useMySavedFormulas(() => args));
		expect(opts.queryKey).toEqual(queryKeys.savedFormulas.mine('user_a', args));
		await opts.queryFn();
		expect(graphqlRequest.mock.calls[0][1]).toEqual(args);
	});

	it.each([
		['first', { first: 20 }],
		['after', { after: 'cursor:9' }],
		['includeTotalCount', { includeTotalCount: true }],
	])('changing %s changes the mine key', (_name, change) => {
		const original = asOptions(useMySavedFormulas(() => ({ first: 10 }))).queryKey;
		const changed = asOptions(useMySavedFormulas(() => ({ first: 10, ...change }))).queryKey;
		expect(hashKey(changed)).not.toBe(hashKey(original));
	});
});

describe('useMySavedFormulas: signed out never fires', () => {
	it('is disabled while there is no viewer, and mounting it costs zero calls', async () => {
		viewer.id = null;
		const opts = asOptions(useMySavedFormulas());
		expect(opts.enabled).toBe(false);
		await mountConsumers(client, opts, 3);
		expect(graphqlRequest).not.toHaveBeenCalled();
	});
});

describe('useSharedFormulas: anonymous and signed-in callers share one contract', () => {
	it('is always enabled (anonymous callers see public rows) and uses the 60-second staleTime', () => {
		viewer.id = null;
		const opts = asOptions(useSharedFormulas());
		expect(opts.enabled).not.toBe(false);
		expect(opts.staleTime).toBe(SHARED_FORMULA_STALE_TIME_MS);
		expect(SHARED_FORMULA_STALE_TIME_MS).toBe(60_000);
	});

	it('three consumers cost one call, and a remount inside staleTime costs none', async () => {
		graphqlRequest.mockResolvedValue({ sharedFormulas: { items: [], pageInfo: {}, totalCount: null } });
		const opts = asOptions(useSharedFormulas());
		await mountConsumers(client, opts, 3);
		(await mountConsumers(client, opts, 1))();
		expect(graphqlRequest).toHaveBeenCalledTimes(1);
	});

	it('the key includes the viewer, and the queryFn sends exactly the keyed variables', async () => {
		const args = { first: 10, after: 'cursor:9' };
		const opts = asOptions(useSharedFormulas(() => args));
		expect(opts.queryKey).toEqual(queryKeys.savedFormulas.shared('user_a', args));
		await opts.queryFn();
		expect(graphqlRequest.mock.calls[0][1]).toEqual(args);
	});

	it.each([
		['first', { first: 20 }],
		['after', { after: 'cursor:9' }],
		['includeTotalCount', { includeTotalCount: true }],
	])('changing %s changes the shared key', (_name, change) => {
		const original = asOptions(useSharedFormulas(() => ({ first: 10 }))).queryKey;
		const changed = asOptions(useSharedFormulas(() => ({ first: 10, ...change }))).queryKey;
		expect(hashKey(changed)).not.toBe(hashKey(original));
	});

	it('the anonymous viewer and a signed-in viewer get different shared entries', () => {
		viewer.id = null;
		const anon = asOptions(useSharedFormulas()).queryKey;
		viewer.id = 'user_a';
		const signedIn = asOptions(useSharedFormulas()).queryKey;
		expect(hashKey(anon)).not.toBe(hashKey(signedIn));
	});
});

describe('eviction: each mutation evicts exactly the lists it changes', () => {
	const seedAll = (keys: QueryKey[]) => {
		for (const k of keys) seed(client, k);
	};

	// Shared by every case: whatever a mutation changes must be invalidated, and nothing else.
	function expectEvicted(affected: QueryKey[], untouched: QueryKey[]) {
		const outcome = invalidationOutcome(client, [...affected, ...untouched]);
		expect(outcome.invalidated).toEqual(affected);
		expect(outcome.untouched).toEqual(untouched);
	}

	it('createSavedFormula: evicts the viewer’s own mine and shared lists (every page), never another viewer’s', async () => {
		graphqlRequest.mockResolvedValueOnce({ createSavedFormula: item() });
		const m = asMutation(useCreateSavedFormula());
		const affected = [MINE_A, MINE_A_NEXT, SHARED_A, SHARED_A_NEXT];
		const untouched = [MINE_B, SHARED_B, SHARED_ANON, ...UNRELATED];
		seedAll([...affected, ...untouched]);

		const input = { name: 'Bang for buck', payload: PAYLOAD };
		const data = await m.mutationFn(input);
		m.onSuccess(data, input);

		expect(data).toEqual(item());
		expectEvicted(affected, untouched);
	});

	it('updateSavedFormula: evicts the viewer’s own mine and shared lists only, and sends IntID as a number', async () => {
		graphqlRequest.mockResolvedValueOnce({ updateSavedFormula: item({ name: 'Renamed' }) });
		const m = asMutation(useUpdateSavedFormula());
		const affected = [MINE_A, MINE_A_NEXT, SHARED_A, SHARED_A_NEXT];
		const untouched = [MINE_B, SHARED_B, SHARED_ANON, ...UNRELATED];
		seedAll([...affected, ...untouched]);

		const input = { id: 5, name: 'Renamed' };
		const data = await m.mutationFn(input);
		m.onSuccess(data, input);

		expect(graphqlRequest.mock.calls[0][1]).toEqual({ input });
		expectEvicted(affected, untouched);
	});

	it('deleteSavedItem of a PRIVATE item: evicts the viewer’s mine and shared lists, leaves other viewers’ lists alone', async () => {
		graphqlRequest.mockResolvedValueOnce({ deleteSavedItem: true });
		const m = asMutation(useDeleteSavedItem());
		const affected = [MINE_A, MINE_A_NEXT, SHARED_A, SHARED_A_NEXT];
		const untouched = [MINE_B, SHARED_B, SHARED_ANON, ...UNRELATED];
		seedAll([...affected, ...untouched]);

		const input = { id: '5', privacy: 'PRIVATE' };
		const data = await m.mutationFn(input);
		m.onSuccess(data, input);

		expectEvicted(affected, untouched);
	});

	it('deleteSavedItem of a PUBLIC item: also evicts every shared list, for every viewer', async () => {
		graphqlRequest.mockResolvedValueOnce({ deleteSavedItem: true });
		const m = asMutation(useDeleteSavedItem());
		const affected = [MINE_A, MINE_A_NEXT, ...ALL_SHARED];
		const untouched = [MINE_B, ...UNRELATED];
		seedAll([...affected, ...untouched]);

		const input = { id: '5', privacy: 'PUBLIC' };
		const data = await m.mutationFn(input);
		m.onSuccess(data, input);

		expectEvicted(affected, untouched);
	});

	it('deleteSavedItem: a server answer of false is an error, not a silent success', async () => {
		graphqlRequest.mockResolvedValueOnce({ deleteSavedItem: false });
		const m = asMutation(useDeleteSavedItem());
		await expect(m.mutationFn({ id: '5', privacy: 'PRIVATE' })).rejects.toThrow('Delete was not confirmed');
	});

	it('restoreSavedItem of a PRIVATE item: evicts the viewer’s own lists only (the result says PRIVATE)', async () => {
		graphqlRequest.mockResolvedValueOnce({ restoreSavedItem: item({ privacy: 'PRIVATE' }) });
		const m = asMutation(useRestoreSavedItem());
		const affected = [MINE_A, MINE_A_NEXT, SHARED_A, SHARED_A_NEXT];
		const untouched = [MINE_B, SHARED_B, SHARED_ANON, ...UNRELATED];
		seedAll([...affected, ...untouched]);

		const data = await m.mutationFn('5');
		m.onSuccess(data, '5');

		expectEvicted(affected, untouched);
	});

	it('restoreSavedItem of a PUBLIC item: also evicts every shared list', async () => {
		graphqlRequest.mockResolvedValueOnce({ restoreSavedItem: item({ privacy: 'PUBLIC' }) });
		const m = asMutation(useRestoreSavedItem());
		const affected = [MINE_A, MINE_A_NEXT, ...ALL_SHARED];
		const untouched = [MINE_B, ...UNRELATED];
		seedAll([...affected, ...untouched]);

		const data = await m.mutationFn('5');
		m.onSuccess(data, '5');

		expectEvicted(affected, untouched);
	});

	it('setSavedItemPrivacy: evicts the viewer’s mine lists and every shared list (any privacy change)', async () => {
		graphqlRequest.mockResolvedValueOnce({ setSavedItemPrivacy: item({ privacy: 'PUBLIC' }) });
		const m = asMutation(useSetSavedItemPrivacy());
		const affected = [MINE_A, MINE_A_NEXT, ...ALL_SHARED];
		const untouched = [MINE_B, ...UNRELATED];
		seedAll([...affected, ...untouched]);

		const input = { id: '5', privacy: 'PUBLIC' };
		const data = await m.mutationFn(input);
		m.onSuccess(data, input);

		expect(graphqlRequest.mock.calls[0][1]).toEqual({ id: '5', privacy: 'PUBLIC' });
		expectEvicted(affected, untouched);
	});

	it('copySavedItem: evicts the viewer’s own mine and shared lists only', async () => {
		graphqlRequest.mockResolvedValueOnce({ copySavedItem: item({ origin: 'COPY', sourceId: '9' }) as SavedItem });
		const m = asMutation(useCopySavedItem());
		const affected = [MINE_A, MINE_A_NEXT, SHARED_A, SHARED_A_NEXT];
		const untouched = [MINE_B, SHARED_B, SHARED_ANON, ...UNRELATED];
		seedAll([...affected, ...untouched]);

		const data = await m.mutationFn('9');
		m.onSuccess(data, '9');

		expectEvicted(affected, untouched);
	});

	it('linkSavedItem: evicts the viewer’s own mine and shared lists only', async () => {
		graphqlRequest.mockResolvedValueOnce({ linkSavedItem: item({ origin: 'LINK', sourceId: '9' }) as SavedItem });
		const m = asMutation(useLinkSavedItem());
		const affected = [MINE_A, MINE_A_NEXT, SHARED_A, SHARED_A_NEXT];
		const untouched = [MINE_B, SHARED_B, SHARED_ANON, ...UNRELATED];
		seedAll([...affected, ...untouched]);

		const data = await m.mutationFn('9');
		m.onSuccess(data, '9');

		expectEvicted(affected, untouched);
	});

	it('convertLinkToCopy: evicts the viewer’s own mine and shared lists only', async () => {
		graphqlRequest.mockResolvedValueOnce({ convertLinkToCopy: item({ origin: 'COPY', sourceId: '9' }) as SavedItem });
		const m = asMutation(useConvertLinkToCopy());
		const affected = [MINE_A, MINE_A_NEXT, SHARED_A, SHARED_A_NEXT];
		const untouched = [MINE_B, SHARED_B, SHARED_ANON, ...UNRELATED];
		seedAll([...affected, ...untouched]);

		const data = await m.mutationFn('5');
		m.onSuccess(data, '5');

		expectEvicted(affected, untouched);
	});
});
