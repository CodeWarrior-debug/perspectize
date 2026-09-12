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
			first?: number;
			after?: string | null;
			filter?: Record<string, unknown>;
			mode?: string;
		}) => [...queryKeys.content.lists(), filters] as const,
		details: () => [...queryKeys.content.all(), 'detail'] as const,
		detail: (id: string) => [...queryKeys.content.details(), id] as const,
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
		lists: () => [...queryKeys.perspectives.all(), 'list'] as const,
		listByUser: (userId: number) => [...queryKeys.perspectives.lists(), { userId }] as const,
		details: () => [...queryKeys.perspectives.all(), 'detail'] as const,
		detail: (id: string) => [...queryKeys.perspectives.details(), id] as const,
	},
} as const;
