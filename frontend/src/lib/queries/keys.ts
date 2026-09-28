/**
 * Centralized query key factory for type-safe, hierarchical cache invalidation.
 */
export const queryKeys = {
	all: ['app'] as const,

	content: {
		all: () => [...queryKeys.all, 'content'] as const,
		lists: () => [...queryKeys.content.all(), 'list'] as const,
		list: (filters: {
			sortBy?: string;
			sortOrder?: string;
			sorts?: { field: string; order: string }[];
			search?: string;
			searchFields?: string[];
			first?: number;
			after?: string | null;
			filter?: Record<string, unknown>;
			mode?: string;
		}) => [...queryKeys.content.lists(), filters] as const,
		details: () => [...queryKeys.content.all(), 'detail'] as const,
		detail: (id: string) => [...queryKeys.content.details(), id] as const,
		// Distinct from `detail` (GET_CONTENT_AGGREGATES) — Compare.svelte's
		// content banner fetches different fields (GET_CONTENT) and must not
		// share a cache key, or whichever query populates the cache first wins
		// for the shared staleTime window and the other reads wrong fields.
		banner: (id: string) => [...queryKeys.content.details(), 'banner', id] as const,
		// ListComparableContent (ComparePicker.svelte) — a distinct shape/query
		// from `list` above (adds perspectiveCount, no pagination), keyed by
		// the debounced search term.
		comparePicker: (search: string) => [...queryKeys.content.lists(), 'compare-picker', search] as const,
	},

	bible: {
		all: () => [...queryKeys.all, 'bible'] as const,
		passageText: (startVerseId: number, endVerseId: number) =>
			[...queryKeys.bible.all(), 'passage', startVerseId, endVerseId] as const,
		passageInterlinear: (startVerseId: number, endVerseId: number) =>
			[...queryKeys.bible.all(), 'interlinear', startVerseId, endVerseId] as const,
	},

	users: {
		all: () => [...queryKeys.all, 'users'] as const,
		lists: () => [...queryKeys.users.all(), 'list'] as const,
		list: () => [...queryKeys.users.lists()] as const,
		details: () => [...queryKeys.users.all(), 'detail'] as const,
		detail: (id: string) => [...queryKeys.users.details(), id] as const,
	},

	categories: {
		all: () => [...queryKeys.all, 'categories'] as const,
		search: (query: string) => [...queryKeys.categories.all(), 'search', query] as const,
	},

	perspectives: {
		all: () => [...queryKeys.all, 'perspectives'] as const,
		// Umbrella over EVERY perspective list, regardless of row shape. Safe for
		// invalidate/cancel/remove (a shape-agnostic "everything's stale"); never pass
		// this to setQueriesData/getQueriesData, since the three branches below cache
		// different response shapes and an optimistic patch built for one would
		// corrupt the others (see byUserLists' comment).
		lists: () => [...queryKeys.perspectives.all(), 'list'] as const,
		// ListPerspectivesByUserResponse -- PerspectiveItem rows, the same shape
		// createPerspective/updatePerspective return. The only branch that's safe to
		// optimistically patch with a PerspectiveItem.
		byUserLists: () => [...queryKeys.perspectives.lists(), 'byUser'] as const,
		listByUser: (userId: number) => [...queryKeys.perspectives.byUserLists(), { userId }] as const,
		// ListPerspectivesByContentResponse -- also PerspectiveItem rows.
		byContentLists: () => [...queryKeys.perspectives.lists(), 'byContent'] as const,
		listByContent: (contentId: number) => [...queryKeys.perspectives.byContentLists(), { contentId }] as const,
		// ListActivityPerspectivesResponse -- ActivityPerspectiveItem rows (nested
		// `content`, no rating fields: a DIFFERENT shape) and privacy-filtered by the
		// server (includePrivate). Never patch this with a PerspectiveItem -- refetch
		// it instead, so privacy scoping and the nested content stay correct.
		activityFeeds: () => [...queryKeys.perspectives.lists(), 'activityFeed'] as const,
		activityFeed: (includePrivate: boolean) => [...queryKeys.perspectives.activityFeeds(), { includePrivate }] as const,
		details: () => [...queryKeys.perspectives.all(), 'detail'] as const,
		detail: (id: string) => [...queryKeys.perspectives.details(), id] as const,
	},

	messaging: {
		all: () => [...queryKeys.all, 'messaging'] as const,
		threads: {
			all: () => [...queryKeys.messaging.all(), 'threads'] as const,
			lists: () => [...queryKeys.messaging.threads.all(), 'list'] as const,
			list: () => [...queryKeys.messaging.threads.lists()] as const,
			details: () => [...queryKeys.messaging.threads.all(), 'detail'] as const,
			detail: (id: string) => [...queryKeys.messaging.threads.details(), id] as const,
		},
		messages: {
			all: () => [...queryKeys.messaging.all(), 'messages'] as const,
			lists: () => [...queryKeys.messaging.messages.all(), 'list'] as const,
			list: (threadId: string) => [...queryKeys.messaging.messages.lists(), { threadId }] as const,
		},
	},
} as const;
