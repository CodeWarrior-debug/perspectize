import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { goto } from '$app/navigation';
import { graphqlRequest } from '../client';
import { CREATE_CONTENT_FROM_BOOK, type CreateContentFromBookResponse } from './index';
import { queryKeys } from '../keys';
import { activityContentHref } from '$lib/utils/contentLinks';
import { contentNotAllowedMessage } from '$lib/utils/movie';

/**
 * Adds a book from a work URL or a bare ISBN (the server resolves either to its work).
 * Find-or-create: an existing work comes back as a normal Content.
 */
export function useAddBook() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		// Always the authenticated wrapper; the server derives the user from the session.
		mutationFn: async (url: string) =>
			graphqlRequest<CreateContentFromBookResponse>(CREATE_CONTENT_FROM_BOOK, { input: { url } }),
		onSuccess: (data: CreateContentFromBookResponse) => {
			const book = data?.createContentFromBook;
			// The server doesn't say whether the row already existed (find-or-create),
			// so both cases get a way to jump to it.
			const id = book?.id;
			toast.success(`Added: ${book?.name ?? 'book'}`, {
				action: id ? { label: 'Go to book', onClick: () => goto(activityContentHref(id)) } : undefined,
			});
			// New or pre-existing rows both come back as Content, so refetch lists
			// instead of blindly prepending (no duplicates). Detail caches are unchanged.
			queryClient.invalidateQueries({ queryKey: queryKeys.content.lists() });
		},
		onError: (err: Error) => {
			console.error('[AddBook] mutation failed:', err);
			const notAllowed = contentNotAllowedMessage(err);
			const message = err.message.toLowerCase();
			if (notAllowed) {
				toast.error(notAllowed);
			} else if (message.includes('load failed') || message.includes('failed to fetch')) {
				toast.error('Cannot reach the server. Check your connection and try again.');
			} else if (
				message.includes('invalid book') ||
				message.includes('book not found') ||
				message.includes('no book found')
			) {
				toast.error('Invalid book link or book not found');
			} else if (message.includes('access denied') || message.includes('authentication required')) {
				toast.error('Please sign in to add a book');
			} else {
				toast.error('Failed to add book. Please try again.');
			}
		},
	}));
}
