/**
 * The Plan grid keeps its rows on screen while a header sort fetches (see `sortOnlyPlaceholder`).
 * Each state is named so a change to the rule fails on the state it breaks.
 */
import { describe, it, expect } from 'vitest';
import { queryKeys } from '#lib/queries/keys.js';
import { sortOnlyPlaceholder } from '#lib/queries/userTodos/useUserTodos.js';
import type { UserTodosArgs, UserTodosResponse } from '#lib/queries/userTodos/index.js';

const PAGE: UserTodosResponse = {
	userTodos: {
		items: [],
		pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null },
		totalCount: 0,
	},
};

const ALL: UserTodosArgs = {
	first: 100,
	includeTotalCount: true,
	sortBy: 'CREATED_AT',
	sortOrder: 'DESC',
	filter: { userId: 7 },
};

/** The query object TanStack passes as `previousQuery`: only its key is read. */
function previousQuery(variables: UserTodosArgs) {
	return { queryKey: queryKeys.userTodos.list(variables) };
}

describe('sortOnlyPlaceholder: which previous page stays on screen', () => {
	it('a header sort on the same filter keeps the previous page', () => {
		const next = { ...ALL, sortBy: 'PRIORITY' as const, sortOrder: 'DESC' as const };
		expect(sortOnlyPlaceholder(next)(PAGE, previousQuery(ALL))).toBe(PAGE);
	});

	it('clearing a sort (back to the default order) on the same filter keeps the previous page', () => {
		const sorted = { ...ALL, sortBy: 'DUE_DATE' as const, sortOrder: 'ASC' as const };
		expect(sortOnlyPlaceholder(ALL)(PAGE, previousQuery(sorted))).toBe(PAGE);
	});

	it('a change of filter (All to a list) gets no placeholder, so another selection never shows these rows', () => {
		const list: UserTodosArgs = { ...ALL, sortBy: 'LIST_POSITION', sortOrder: 'ASC', filter: { userId: 7, listId: 3 } };
		expect(sortOnlyPlaceholder(list)(PAGE, previousQuery(ALL))).toBeUndefined();
	});

	it('a change of filter to Unlisted gets no placeholder', () => {
		const unlisted: UserTodosArgs = { ...ALL, filter: { userId: 7, unlisted: true } };
		expect(sortOnlyPlaceholder(unlisted)(PAGE, previousQuery(ALL))).toBeUndefined();
	});

	it('the first load (no previous query) gets no placeholder, so the loading state shows', () => {
		expect(sortOnlyPlaceholder(ALL)(undefined, undefined)).toBeUndefined();
	});

	it('no previous data gets no placeholder', () => {
		const next = { ...ALL, sortBy: 'PRIORITY' as const };
		expect(sortOnlyPlaceholder(next)(undefined, previousQuery(ALL))).toBeUndefined();
	});
});
