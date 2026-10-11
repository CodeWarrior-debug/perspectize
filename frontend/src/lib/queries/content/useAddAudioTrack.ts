import { createMutation, useQueryClient, type QueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { goto } from '$app/navigation';
import { graphqlRequest } from '../client';
import {
	CREATE_AUDIO_TRACK,
	type CreateAudioTrackInput,
	type CreateAudioTrackResponse,
	type RelatedMedia,
} from './index';
import { promoteRelatedMedia } from './useAudioTrack';
import { queryKeys } from '../keys';
import { activityContentHref } from '$lib/utils/contentLinks';
import { contentNotAllowedMessage } from '$lib/utils/movie';

export type AddAudioTrackResult = CreateAudioTrackResponse['createAudioTrack'];

/** Cache effect of an add (see audio-track-cache-contract.test.ts). */
export function applyAudioTrackAdded(client: QueryClient, result: AddAudioTrackResult) {
	if (result.sameSongCandidates.length > 0 || !result.content) return; // the form asks; nothing changed
	if (result.alreadyExisted) {
		// A link may have been attached to that track.
		client.invalidateQueries({ queryKey: queryKeys.content.audioTrack(result.content.id) });
	} else {
		client.invalidateQueries({ queryKey: queryKeys.content.lists() });
	}
}

/**
 * The one official video worth offering after an add: not already its own
 * item and not known to be broken. Never for a duplicate or a prompt.
 */
export function promotableOfficialVideo(result: AddAudioTrackResult): RelatedMedia | null {
	if (!result.content || result.alreadyExisted) return null;
	return (
		result.content.relatedMedia?.find((r) => r.kind === 'official_video' && !r.contentId && !r.unavailable) ?? null
	);
}

export function audioTrackErrorMessage(err: Error): string {
	const notAllowed = contentNotAllowedMessage(err);
	if (notAllowed) return notAllowed;
	const m = err.message.toLowerCase();
	if (m.includes('load failed') || m.includes('failed to fetch'))
		return 'Cannot reach the server. Check your connection and try again.';
	if (m.includes('not an album')) return 'Paste a song link, not an album, playlist, or artist.';
	if (m.includes('unsupported music link'))
		return 'Paste a YouTube Music, Spotify, Apple Music or Amazon Music song link.';
	if (m.includes('title is required'))
		return 'Add the song title (Spotify, Apple Music and Amazon Music links are not looked up).';
	if (m.includes('access denied') || m.includes('authentication required')) return 'Please sign in to add a track';
	return 'Failed to add track. Please try again.';
}

export function useAddAudioTrack() {
	const queryClient = useQueryClient();
	return createMutation(() => ({
		// Always the authenticated wrapper; the server derives the user from the session.
		mutationFn: async (input: CreateAudioTrackInput) =>
			(await graphqlRequest<CreateAudioTrackResponse>(CREATE_AUDIO_TRACK, { input })).createAudioTrack,
		onSuccess: (result: AddAudioTrackResult) => {
			applyAudioTrackAdded(queryClient, result);
			const track = result.content;
			if (!track) return; // same-song prompt: AudioTrackFields asks the user
			const goToTrack = { label: 'Go to track', onClick: () => goto(activityContentHref(track.id)) };
			if (result.alreadyExisted) {
				toast.warning(`This song has already been added: ${track.name}`, { action: goToTrack });
				return;
			}
			toast.success(`Added: ${track.name}`, { action: goToTrack });
			const official = promotableOfficialVideo(result);
			if (official) {
				toast('This song also has an official video.', {
					description: 'Add it separately?',
					action: {
						label: 'Add video',
						onClick: () => {
							promoteRelatedMedia(track.id, official.videoId)
								.then((item) => {
									toast.success(`Added: ${item.name}`);
									queryClient.invalidateQueries({ queryKey: queryKeys.content.lists() });
								})
								.catch(() => toast.error('Could not add that video. Please try again.'));
						},
					},
				});
			}
		},
		onError: (err: Error) => {
			console.error('[AddAudioTrack] mutation failed:', err);
			toast.error(audioTrackErrorMessage(err));
		},
	}));
}
