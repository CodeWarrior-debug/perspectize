/**
 * Test helpers for the "query budget" rules in frontend/CLAUDE.md →
 * "Query caching & call budget": count network calls, prove de-duplication,
 * and prove that a mutation evicts exactly the cache entries it should.
 *
 * They drive a REAL QueryClient, so a test reads the cache back instead of
 * inspecting which mock calls were made (a mock-only test passes even when the
 * key a hook invalidates matches nothing).
 */
import { QueryClient, QueryObserver, type QueryKey } from '@tanstack/svelte-query';
import { vi } from 'vitest';

/** A QueryClient with retries off so a failing fetch settles immediately. */
export function makeClient(): QueryClient {
	return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

/**
 * A queryFn that resolves `data` and records how many times the "network" was
 * hit. `fetches()` is the number to assert on.
 */
export function countingFetch<T>(data: T) {
	const fn = vi.fn(async () => data);
	return Object.assign(fn, { fetches: () => fn.mock.calls.length });
}

/**
 * Mount `consumers` observers on the same query (as N components calling the
 * same hook would) and wait for the first fetch to settle. Returns the
 * unsubscribe for all of them. Use to assert the call count stays at 1.
 */
export async function mountConsumers(
	client: QueryClient,
	options: { queryKey: QueryKey; queryFn: () => Promise<unknown>; staleTime?: number },
	consumers: number,
): Promise<() => void> {
	const unsubs = Array.from({ length: consumers }, () => new QueryObserver(client, options).subscribe(() => {}));
	await client.getQueryCache().find({ queryKey: options.queryKey })?.promise;
	await vi.waitFor(() => {
		if (client.isFetching()) throw new Error('still fetching');
	});
	return () => unsubs.forEach((u) => u());
}

/** Seed a cache entry with data so invalidation effects can be observed. */
export function seed(client: QueryClient, key: QueryKey, data: unknown = {}) {
	client.setQueryData(key, data);
}

/** True when the entry exists and was marked stale by an invalidate. */
export function isInvalidated(client: QueryClient, key: QueryKey): boolean {
	return client.getQueryState(key)?.isInvalidated === true;
}

/**
 * Partition `keys` into those a mutation invalidated and those it left alone.
 * Assert BOTH sides: "evicts the right thing" and "does not evict the rest".
 */
export function invalidationOutcome(client: QueryClient, keys: QueryKey[]) {
	return {
		invalidated: keys.filter((k) => isInvalidated(client, k)),
		untouched: keys.filter((k) => !isInvalidated(client, k)),
	};
}
