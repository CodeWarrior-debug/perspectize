import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import { queryKeys } from '../keys';
import {
	SET_PASSAGE_DISPLAY_TITLE,
	type SetPassageDisplayTitleInput,
	type SetPassageDisplayTitleResponse,
} from './index';

export function useSetPassageDisplayTitle() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		mutationFn: async (input: SetPassageDisplayTitleInput) =>
			graphqlRequest<SetPassageDisplayTitleResponse>(SET_PASSAGE_DISPLAY_TITLE, { input }),
		onSuccess: (data, variables) => {
			// First-write-wins: a loser gets the winner's title back, not an error.
			const stored = data.setPassageDisplayTitle.displayTitle;
			if (stored && stored !== variables.title.trim()) {
				toast.info('Someone else already titled this passage — showing their title.');
			} else {
				toast.success('Title saved');
			}
			queryClient.invalidateQueries({ queryKey: queryKeys.content.all() });
		},
		onError: () => {
			toast.error('Failed to save title. Please try again.');
		},
	}));
}
