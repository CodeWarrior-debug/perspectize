import { createQuery } from '@tanstack/svelte-query';
import { browser } from '$app/environment';
import { graphqlRequest } from '../client';
import { LIST_HERMENEUTIC_APPROACHES, type ListHermeneuticApproachesResponse } from './index';
import { queryKeys } from '../keys';

/**
 * The hermeneutic approach lookup list (a fixed, database-stored set of
 * interpretive lenses) for the BIBLE_PASSAGE perspective form's hermeneutic
 * field. Small and effectively static, so a long staleTime avoids refetching
 * it every time the perspective popover opens.
 */
export function useHermeneuticApproaches() {
	return createQuery(() => ({
		queryKey: queryKeys.hermeneuticApproaches.all(),
		queryFn: () => graphqlRequest<ListHermeneuticApproachesResponse>(LIST_HERMENEUTIC_APPROACHES),
		enabled: browser,
		staleTime: 60 * 60 * 1000,
	}));
}
