import { createMutation, createQuery, useQueryClient, type QueryClient } from '@tanstack/svelte-query';
import { browser } from '$app/environment';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import {
	GET_AUDIO_TRACK,
	LIST_MUSIC_GENRES,
	MARK_RELATED_MEDIA_UNAVAILABLE,
	MARK_TRACK_LINK_UNAVAILABLE,
	PROMOTE_RELATED_MEDIA,
	REFRESH_LYRICS_AVAILABILITY,
	SET_TRACK_GENRE,
	type AudioTrack,
	type MusicGenre,
} from './index';
import { queryKeys } from '../keys';

/** Track details change only through this user's own mutations, which patch the cache. */
export const AUDIO_TRACK_STALE_TIME = 60_000;

export function audioTrackQuery(contentId: string) {
	return {
		queryKey: queryKeys.content.audioTrack(contentId),
		queryFn: async () =>
			(await graphqlRequest<{ contentByID: AudioTrack | null }>(GET_AUDIO_TRACK, { id: contentId })).contentByID,
		staleTime: AUDIO_TRACK_STALE_TIME,
	};
}

export function musicGenresQuery() {
	return {
		queryKey: queryKeys.music.genres(),
		queryFn: async () => (await graphqlRequest<{ musicGenres: MusicGenre[] }>(LIST_MUSIC_GENRES)).musicGenres,
		// Seeded by a migration; never changes while the app runs.
		staleTime: Infinity,
	};
}

/** An AUDIO_TRACK row's links, genre, related media and lyrics availability, for the details modal. */
export function useAudioTrack(contentId: () => string | null) {
	return createQuery(() => {
		const id = contentId();
		return { ...audioTrackQuery(id ?? ''), enabled: browser && id !== null };
	});
}

export function useMusicGenres(enabled: () => boolean = () => true) {
	return createQuery(() => ({ ...musicGenresQuery(), enabled: browser && enabled() }));
}

export function applyGenreSet(
	client: QueryClient,
	track: { id: string; genreId: string | null; genre: MusicGenre | null },
) {
	client.setQueryData<AudioTrack | null>(queryKeys.content.audioTrack(track.id), (old) =>
		old ? { ...old, genreId: track.genreId, genre: track.genre } : old,
	);
	// The grid's Genre column and a `?open=` row read the genre too.
	client.invalidateQueries({ queryKey: queryKeys.content.lists() });
	client.invalidateQueries({ queryKey: queryKeys.content.row(track.id) });
}

export function applyTrackLinkUnavailable(
	client: QueryClient,
	contentId: string,
	link: { id: string; unavailableAt: string | null },
) {
	client.setQueryData<AudioTrack | null>(queryKeys.content.audioTrack(contentId), (old) =>
		old
			? {
					...old,
					trackLinks: old.trackLinks.map((l) => (l.id === link.id ? { ...l, unavailableAt: link.unavailableAt } : l)),
				}
			: old,
	);
}

/** Saves a genre the user picked. Never called on its own: suggestions are only pre-filled (ADR 0006). */
export function useSetTrackGenre() {
	const queryClient = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (vars: { contentId: string; genreId: string }) =>
			(
				await graphqlRequest<{ setTrackGenre: { id: string; genreId: string | null; genre: MusicGenre | null } }>(
					SET_TRACK_GENRE,
					{
						contentId: Number(vars.contentId),
						genreId: Number(vars.genreId),
					},
				)
			).setTrackGenre,
		onSuccess: (track: { id: string; genreId: string | null; genre: MusicGenre | null }) => {
			applyGenreSet(queryClient, track);
			toast.success(`Genre saved: ${track.genre?.name ?? ''}`);
		},
		onError: (err: Error) => {
			toast.error(
				err.message.includes('can only be changed') ? err.message : 'Could not save the genre. Please try again.',
			);
		},
	}));
}

/** Records embed error 101/150 for one EMBED link (ticket 03). */
export function useMarkTrackLinkUnavailable() {
	const queryClient = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (vars: { contentId: string; linkId: string }) =>
			(
				await graphqlRequest<{ markTrackLinkUnavailable: { id: string; unavailableAt: string | null } }>(
					MARK_TRACK_LINK_UNAVAILABLE,
					{
						linkId: Number(vars.linkId),
					},
				)
			).markTrackLinkUnavailable,
		onSuccess: (link: { id: string; unavailableAt: string | null }, vars: { contentId: string; linkId: string }) => {
			applyTrackLinkUnavailable(queryClient, vars.contentId, link);
		},
	}));
}

/**
 * Re-checks lyrics availability. The backend only calls LRCLIB when the stored
 * result is due (never checked, or "not found" more than 30 days ago).
 */
export function useRefreshLyrics() {
	const queryClient = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (contentId: string) =>
			(
				await graphqlRequest<{ refreshLyricsAvailability: AudioTrack }>(REFRESH_LYRICS_AVAILABILITY, {
					contentId: Number(contentId),
				})
			).refreshLyricsAvailability,
		onSuccess: (track: AudioTrack) => {
			queryClient.setQueryData(queryKeys.content.audioTrack(track.id), track);
		},
	}));
}

/** Records that a related upload could not be embedded, so it is greyed out next time. */
export function useMarkRelatedMediaUnavailable() {
	const queryClient = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (vars: { contentId: string; videoId: string }) =>
			(
				await graphqlRequest<{ markRelatedMediaUnavailable: AudioTrack }>(MARK_RELATED_MEDIA_UNAVAILABLE, {
					contentId: Number(vars.contentId),
					videoId: vars.videoId,
				})
			).markRelatedMediaUnavailable,
		onSuccess: (track: AudioTrack) => {
			queryClient.setQueryData(queryKeys.content.audioTrack(track.id), track);
		},
	}));
}

/** Plain request, so it can also run from a toast action outside a component. */
export async function promoteRelatedMedia(contentId: string, videoId: string): Promise<{ id: string; name: string }> {
	const data = await graphqlRequest<{ promoteRelatedMedia: { id: string; name: string } }>(PROMOTE_RELATED_MEDIA, {
		contentId: Number(contentId),
		videoId,
	});
	return data.promoteRelatedMedia;
}

/** Explicit user action: add a related video as its own item. */
export function usePromoteRelatedMedia() {
	const queryClient = useQueryClient();
	return createMutation(() => ({
		mutationFn: (vars: { contentId: string; videoId: string }) => promoteRelatedMedia(vars.contentId, vars.videoId),
		onSuccess: (item: { id: string; name: string }, vars: { contentId: string; videoId: string }) => {
			toast.success(`Added: ${item.name}`);
			queryClient.invalidateQueries({ queryKey: queryKeys.content.audioTrack(vars.contentId) });
			queryClient.invalidateQueries({ queryKey: queryKeys.content.lists() });
		},
		onError: () => {
			toast.error('Could not add that video. Please try again.');
		},
	}));
}
