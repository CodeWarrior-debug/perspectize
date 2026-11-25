import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { silentToast } from '#lib/utils/toast.js';
import { goto } from '$app/navigation';
import { graphqlRequest } from '../client';
import { CREATE_CONTENT_FROM_MOVIE, type CreateContentFromMovieResponse } from './index';
import { queryKeys } from '../keys';
import { libraryContentHref } from '#lib/utils/contentLinks.js';
import { contentNotAllowedMessage } from '#lib/utils/movie.js';

export interface UseAddMovieOptions {
	/** Skip the toasts (and the navigation actions on them); the caller shows its own feedback. */
	quiet?: boolean;
}

export function useAddMovie(options: UseAddMovieOptions = {}) {
	const queryClient = useQueryClient();
	const notify = options.quiet ? silentToast : toast;

	return createMutation(() => ({
		// Always the authenticated wrapper; the server derives the user from the session.
		mutationFn: async (url: string) =>
			graphqlRequest<CreateContentFromMovieResponse>(CREATE_CONTENT_FROM_MOVIE, { input: { url } }),
		onSuccess: (data: CreateContentFromMovieResponse) => {
			const movie = data?.createContentFromMovie;
			// The server doesn't say whether the row already existed (find-or-create),
			// so both cases get a way to jump to it.
			const id = movie?.id;
			notify.success(`Added: ${movie?.name ?? 'movie'}`, {
				action: id ? { label: 'Go to movie', onClick: () => goto(libraryContentHref(id)) } : undefined,
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
				notify.error(notAllowed);
			} else if (message.includes('load failed') || message.includes('failed to fetch')) {
				notify.error('Cannot reach the server. Check your connection and try again.');
			} else if (message.includes('invalid movie url') || message.includes('movie not found')) {
				notify.error('Invalid movie link or movie not found');
			} else if (message.includes('access denied') || message.includes('authentication required')) {
				notify.error('Please sign in to add a movie');
			} else {
				notify.error('Failed to add movie. Please try again.');
			}
		},
	}));
}
