import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
import { browser } from '$app/environment';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import {
	GET_MUSIC_TRACK,
	MARK_RELATED_MEDIA_UNAVAILABLE,
	PROMOTE_RELATED_MEDIA,
	REFRESH_LYRICS_AVAILABILITY,
	type MusicTrack,
} from './index';
import { queryKeys } from '../keys';

/** Loads a YOUTUBE_MUSIC row's related media and lyrics availability for the details modal. */
export function useMusicTrack(contentId: () => string | null) {
	return createQuery(() => ({
		queryKey: queryKeys.content.music(contentId() ?? ''),
		queryFn: async () => {
			const id = contentId();
			if (!id) return null;
			const data = await graphqlRequest<{ contentByID: MusicTrack | null }>(GET_MUSIC_TRACK, { id });
			return data.contentByID;
		},
		enabled: browser && contentId() !== null,
	}));
}

/**
 * Re-checks lyrics availability. The backend only calls LRCLIB when the stored
 * result is due (never checked, or "not found" more than 30 days ago).
 */
export function useRefreshLyrics() {
	const queryClient = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (contentId: string) => {
			const data = await graphqlRequest<{ refreshLyricsAvailability: MusicTrack }>(REFRESH_LYRICS_AVAILABILITY, {
				contentId: Number(contentId),
			});
			return data.refreshLyricsAvailability;
		},
		onSuccess: (track: MusicTrack) => {
			queryClient.setQueryData(queryKeys.content.music(track.id), track);
		},
	}));
}

/** Records that a related video could not be embedded, so it is greyed out next time. */
export function useMarkRelatedMediaUnavailable() {
	const queryClient = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (vars: { contentId: string; videoId: string }) => {
			const data = await graphqlRequest<{ markRelatedMediaUnavailable: MusicTrack }>(MARK_RELATED_MEDIA_UNAVAILABLE, {
				contentId: Number(vars.contentId),
				videoId: vars.videoId,
			});
			return data.markRelatedMediaUnavailable;
		},
		onSuccess: (track: MusicTrack) => {
			queryClient.setQueryData(queryKeys.content.music(track.id), track);
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
			queryClient.invalidateQueries({ queryKey: queryKeys.content.music(vars.contentId) });
			queryClient.invalidateQueries({ queryKey: queryKeys.content.lists() });
		},
		onError: () => {
			toast.error('Could not add that video. Please try again.');
		},
	}));
}
