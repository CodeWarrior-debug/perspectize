import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { goto } from '$app/navigation';
import { graphqlRequest } from '../client';
import { CREATE_CONTENT_FROM_MOVIE, type CreateContentFromMovieResponse } from './index';
import { queryKeys } from '../keys';
import { activityContentHref } from '$lib/utils/contentLinks';
import { contentNotAllowedMessage } from '$lib/utils/movie';

export function useAddMovie() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		// Always the authenticated wrapper; the server derives the user from the session.
		mutationFn: async (url: string) =>
			graphqlRequest<CreateContentFromMovieResponse>(CREATE_CONTENT_FROM_MOVIE, { input: { url } }),
		onSuccess: (data: CreateContentFromMovieResponse) => {
			const movie = data?.createContentFromMovie;
			// The server doesn't say whether the row already existed (find-or-create),
			// so both cases get a way to jump to it.
			const id = movie?.id;
			toast.success(`Added: ${movie?.name ?? 'movie'}`, {
				action: id ? { label: 'Go to movie', onClick: () => goto(activityContentHref(id)) } : undefined,
			});
			// New or pre-existing rows both come back as Content, so refetch lists
			// instead of blindly prepending (no duplicates). Detail caches are unchanged.
			queryClient.invalidateQueries({ queryKey: queryKeys.content.lists() });
		},
		onError: (err: Error) => {
			console.error('[AddMovie] mutation failed:', err);
			const notAllowed = contentNotAllowedMessage(err);
			const message = err.message.toLowerCase();
			if (notAllowed) {
				toast.error(notAllowed);
			} else if (message.includes('load failed') || message.includes('failed to fetch')) {
				toast.error('Cannot reach the server. Check your connection and try again.');
			} else if (message.includes('invalid movie url') || message.includes('movie not found')) {
				toast.error('Invalid movie link or movie not found');
			} else if (message.includes('access denied') || message.includes('authentication required')) {
				toast.error('Please sign in to add a movie');
			} else {
				toast.error('Failed to add movie. Please try again.');
			}
		},
	}));
}
