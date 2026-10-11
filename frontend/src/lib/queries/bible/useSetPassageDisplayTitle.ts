import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import { queryKeys } from '../keys';
import {
	SET_PASSAGE_DISPLAY_TITLE,
	type SetPassageDisplayTitleInput,
	type SetPassageDisplayTitleResponse,
} from './index';

/**
 * Returns `data` with content `id`'s displayTitle set, for every cached shape
 * that carries it: a list (`content.items[]`) or a single row (`contentByID`
 * with a displayTitle field). Anything else — including the aggregate-only
 * detail entry — comes back unchanged (same reference, so no re-render).
 */
export function withDisplayTitle(data: unknown, id: string, title: string | null): unknown {
	if (!data || typeof data !== 'object') return data;
	const d = data as Record<string, any>;
	const items = d.content?.items;
	if (Array.isArray(items)) {
		if (!items.some((it: { id?: string }) => it?.id === id)) return data;
		return {
			...d,
			content: {
				...d.content,
				items: items.map((it: { id?: string }) => (it?.id === id ? { ...it, displayTitle: title } : it)),
			},
		};
	}
	const row = d.contentByID;
	if (row && row.id === id && 'displayTitle' in row) {
		return { ...d, contentByID: { ...row, displayTitle: title } };
	}
	return data;
}

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
			// Only this passage's title changed: patch it in place in every
			// cached list/row instead of refetching every content query (grid,
			// details, aggregates, banners...) the app has cached.
			queryClient.setQueriesData({ queryKey: queryKeys.content.all() }, (old: unknown) =>
				withDisplayTitle(old, data.setPassageDisplayTitle.id, stored),
			);
		},
		onError: () => {
			toast.error('Failed to save title. Please try again.');
		},
	}));
}
