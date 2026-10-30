/**
 * Cache contract for AUDIO_TRACK (frontend/CLAUDE.md → "Query caching & call
 * budget", .docs/QUERY_BUDGET.md). Real QueryClient, the same keys/staleTimes
 * the hooks use.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashKey } from '@tanstack/svelte-query';
import { queryKeys } from '$lib/queries/keys';
import { AUDIO_TRACK_STALE_TIME, applyGenreSet, applyTrackLinkUnavailable } from '$lib/queries/content/useAudioTrack';
import { applyAudioTrackAdded } from '$lib/queries/content/useAddAudioTrack';
import { countingFetch, invalidationOutcome, makeClient, mountConsumers, seed } from '../helpers/queryBudget';

afterEach(() => vi.useRealTimers());

const genresOptions = (fn: () => Promise<unknown>) => ({
	queryKey: queryKeys.music.genres(),
	queryFn: fn,
	staleTime: Infinity,
});
const trackOptions = (id: string, fn: () => Promise<unknown>) => ({
	queryKey: queryKeys.content.audioTrack(id),
	queryFn: fn,
	staleTime: AUDIO_TRACK_STALE_TIME,
});

describe('audio track key hygiene', () => {
	it('details are distinct from the other per-content entries', () => {
		const keys = [
			queryKeys.content.audioTrack('9'),
			queryKeys.content.detail('9'),
			queryKeys.content.row('9'),
			queryKeys.content.banner('9'),
		].map(hashKey);
		expect(new Set(keys).size).toBe(4);
	});

	it('genres live outside the content tree, so content invalidations never refetch them', () => {
		expect(hashKey(queryKeys.music.genres()).includes('"content"')).toBe(false);
	});
});

describe('de-duplication and freshness', () => {
	it('three pickers share one genre fetch, and a remount costs nothing', async () => {
		const client = makeClient();
		const fetcher = countingFetch([]);
		(await mountConsumers(client, genresOptions(fetcher), 3))();
		(await mountConsumers(client, genresOptions(fetcher), 1))();
		expect(fetcher.fetches()).toBe(1);
	});

	it('track details are reused inside the stale time and refetched once after', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-11T12:00:00Z'));
		const client = makeClient();
		const fetcher = countingFetch({ id: '9' });
		(await mountConsumers(client, trackOptions('9', fetcher), 2))();
		(await mountConsumers(client, trackOptions('9', fetcher), 1))();
		expect(fetcher.fetches()).toBe(1);
		vi.setSystemTime(new Date(Date.now() + AUDIO_TRACK_STALE_TIME + 1000));
		(await mountConsumers(client, trackOptions('9', fetcher), 1))();
		expect(fetcher.fetches()).toBe(2);
	});
});

describe('mutations evict exactly what they change', () => {
	const list = queryKeys.content.list({ first: 50 });
	const track9 = queryKeys.content.audioTrack('9');
	const track10 = queryKeys.content.audioTrack('10');
	const row9 = queryKeys.content.row('9');
	const genres = queryKeys.music.genres();
	const all = [list, track9, track10, row9, genres];

	function seeded() {
		const client = makeClient();
		for (const k of all) seed(client, k, { id: 'x', trackLinks: [{ id: '1', unavailableAt: null }] });
		return client;
	}

	it('saving a genre patches the details and evicts lists and that row only', () => {
		const client = seeded();
		applyGenreSet(client, { id: '9', genreId: '21', genre: { id: '21', name: 'Rock', parentId: null } });
		const out = invalidationOutcome(client, all);
		expect(out.invalidated.map(hashKey).sort()).toEqual([list, row9].map(hashKey).sort());
		expect(client.getQueryData<{ genreId: string }>(track9)?.genreId).toBe('21');
	});

	it('a new track evicts the lists only', () => {
		const client = seeded();
		applyAudioTrackAdded(client, { content: { id: '11' } as never, alreadyExisted: false, sameSongCandidates: [] });
		expect(invalidationOutcome(client, all).invalidated.map(hashKey)).toEqual([hashKey(list)]);
	});

	it('a link attached to an existing track evicts that track only', () => {
		const client = seeded();
		applyAudioTrackAdded(client, { content: { id: '9' } as never, alreadyExisted: true, sameSongCandidates: [] });
		expect(invalidationOutcome(client, all).invalidated.map(hashKey)).toEqual([hashKey(track9)]);
	});

	it('a same-song prompt evicts nothing', () => {
		const client = seeded();
		applyAudioTrackAdded(client, {
			content: null,
			alreadyExisted: false,
			sameSongCandidates: [{ id: '9', name: 'x', url: null, audioTrack: null }],
		});
		expect(invalidationOutcome(client, all).invalidated).toEqual([]);
	});

	it('marking a link unavailable patches that track in place and evicts nothing', () => {
		const client = seeded();
		applyTrackLinkUnavailable(client, '9', { id: '1', unavailableAt: '2026-10-11T12:00:00Z' });
		expect(invalidationOutcome(client, all).invalidated).toEqual([]);
		expect(client.getQueryData<{ trackLinks: { unavailableAt: string }[] }>(track9)?.trackLinks[0].unavailableAt).toBe(
			'2026-10-11T12:00:00Z',
		);
	});
});
