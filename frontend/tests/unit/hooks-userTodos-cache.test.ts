/**
 * Cache-contract tests for the userTodos query domain (frontend/CLAUDE.md →
 * "Query caching & call budget"). Each hook runs for real except that
 * createQuery/createMutation return their options object, so the tests can drive
 * the hook's own queryFn/mutationFn/onSuccess against a REAL QueryClient.
 *
 * The network is mocked at graphqlRequest, so "fetches" counts real hook calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hashKey, type QueryClient, type QueryKey } from '@tanstack/svelte-query';
import { queryKeys } from '$lib/queries/keys';
import { invalidationOutcome, makeClient, mountConsumers, seed } from '../helpers/queryBudget';
import {
	TODO_ACTIONS_STALE_TIME_MS,
	USER_TODO_STALE_TIME_MS,
	type UserTodoItem,
	type UserTodosArgs,
} from '$lib/queries/userTodos';
import { useUserTodos } from '$lib/queries/userTodos/useUserTodos';
import { useFetchUserTodos } from '$lib/queries/userTodos/useFetchUserTodos';
import { useUserTodoLists } from '$lib/queries/userTodos/useUserTodoLists';
import { useTodoActions } from '$lib/queries/userTodos/useTodoActions';
import { useCreateUserTodo } from '$lib/queries/userTodos/useCreateUserTodo';
import { useUpdateUserTodo } from '$lib/queries/userTodos/useUpdateUserTodo';
import { useDeleteUserTodo } from '$lib/queries/userTodos/useDeleteUserTodo';
import { useCreateTodoAction } from '$lib/queries/userTodos/useCreateTodoAction';
import { useReorderUserTodoList } from '$lib/queries/userTodos/useReorderUserTodoList';
import { useCreateUserTodoList } from '$lib/queries/userTodos/useCreateUserTodoList';
import { useUpdateUserTodoList } from '$lib/queries/userTodos/useUpdateUserTodoList';
import { useDeleteUserTodoList } from '$lib/queries/userTodos/useDeleteUserTodoList';

const { graphqlRequest } = vi.hoisted(() => ({ graphqlRequest: vi.fn() }));

let client: QueryClient;

vi.mock('@tanstack/svelte-query', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@tanstack/svelte-query')>();
	return {
		...actual,
		// Return the options object itself so the hook's queryFn/mutationFn can be driven directly.
		createQuery: (optionsFn: () => unknown) => optionsFn(),
		createMutation: (optionsFn: () => unknown) => optionsFn(),
		useQueryClient: () => client,
	};
});
vi.mock('$lib/queries/client', () => ({ graphqlRequest }));

/** The subset of TanStack options these tests read. */
interface HookOptions {
	queryKey: QueryKey;
	queryFn: () => Promise<unknown>;
	staleTime?: number;
	enabled?: boolean;
}

interface HookMutation {
	mutationFn: (input: any) => Promise<any>;
	onSuccess: (data: any, variables: any) => void;
}

const asOptions = (hook: unknown) => hook as HookOptions;
const asMutation = (hook: unknown) => hook as HookMutation;

const PAGE: UserTodosArgs = { first: 10, sortBy: 'CREATED_AT', sortOrder: 'DESC' };

// Shared keys used across the eviction tests.
const LIST_A = queryKeys.userTodos.list({ first: 10 });
const LIST_B = queryKeys.userTodos.list({ first: 10, filter: { listId: 3 }, sortBy: 'LIST_POSITION' });
const ACTIONS = queryKeys.userTodos.actions();
const OWNER_LISTS = queryKeys.userTodos.todoLists(42);
const OTHER_OWNER_LISTS = queryKeys.userTodos.todoLists(7);
const DETAIL_9 = queryKeys.userTodos.detail('9');
const DETAIL_10 = queryKeys.userTodos.detail('10');
const DETAIL_11 = queryKeys.userTodos.detail('11');
const DETAIL_8 = queryKeys.userTodos.detail('8');
const CONTENT_DETAIL = queryKeys.content.detail('3');
const PERSPECTIVES_BY_USER = queryKeys.perspectives.listByUser(42);

beforeEach(() => {
	client = makeClient();
	graphqlRequest.mockReset();
	graphqlRequest.mockResolvedValue({});
});

describe('queryKeys.userTodos', () => {
	it('list(filters) is the lists prefix plus the exact variables', () => {
		expect(queryKeys.userTodos.list({ first: 10 })).toEqual(['app', 'userTodos', 'list', { first: 10 }]);
	});

	it('todoLists(userId) sits under todoListsAll() and never under lists()', () => {
		const key = queryKeys.userTodos.todoLists(42);
		expect(key.slice(0, queryKeys.userTodos.todoListsAll().length)).toEqual([...queryKeys.userTodos.todoListsAll()]);
		expect(key.slice(0, queryKeys.userTodos.lists().length)).not.toEqual([...queryKeys.userTodos.lists()]);
	});
});

describe('query hooks: de-duplication, freshness and staleTime', () => {
	it('useUserTodos: three consumers of one page cost one network call', async () => {
		const opts = asOptions(useUserTodos(() => PAGE));
		await mountConsumers(client, opts, 3);
		expect(graphqlRequest).toHaveBeenCalledTimes(1);
	});

	it('useUserTodos: a remount inside staleTime costs no call', async () => {
		const opts = asOptions(useUserTodos(() => PAGE));
		(await mountConsumers(client, opts, 1))();
		(await mountConsumers(client, opts, 1))();
		expect(graphqlRequest).toHaveBeenCalledTimes(1);
	});

	it('useUserTodos: uses the 2-minute user-todo staleTime', () => {
		expect(asOptions(useUserTodos(() => PAGE)).staleTime).toBe(USER_TODO_STALE_TIME_MS);
		expect(USER_TODO_STALE_TIME_MS).toBe(120_000);
	});

	it('useUserTodoLists: three consumers cost one call and a remount inside staleTime costs none', async () => {
		const opts = asOptions(useUserTodoLists(() => 42));
		await mountConsumers(client, opts, 3);
		(await mountConsumers(client, opts, 1))();
		expect(graphqlRequest).toHaveBeenCalledTimes(1);
		expect(opts.staleTime).toBe(USER_TODO_STALE_TIME_MS);
	});

	it('useUserTodoLists: disabled while there is no user', () => {
		expect(asOptions(useUserTodoLists(() => null)).enabled).toBe(false);
		expect(asOptions(useUserTodoLists(() => 42)).enabled).toBe(true);
	});

	it('useTodoActions: 30-minute staleTime; a remount inside it costs no call', async () => {
		const opts = asOptions(useTodoActions());
		expect(opts.staleTime).toBe(TODO_ACTIONS_STALE_TIME_MS);
		expect(TODO_ACTIONS_STALE_TIME_MS).toBe(30 * 60_000);
		(await mountConsumers(client, opts, 2))();
		(await mountConsumers(client, opts, 1))();
		expect(graphqlRequest).toHaveBeenCalledTimes(1);
	});

	it('useTodoActions: honours the enabled gate', () => {
		expect(asOptions(useTodoActions(() => false)).enabled).toBe(false);
	});
});

describe('query key hygiene: every variable useUserTodos sends changes the key', () => {
	const base: UserTodosArgs = { first: 10, sortBy: 'CREATED_AT', sortOrder: 'DESC', includeTotalCount: false };

	it('the key hash is stable for equal variables', () => {
		const a = asOptions(useUserTodos(() => ({ ...base }))).queryKey;
		const b = asOptions(useUserTodos(() => ({ ...base }))).queryKey;
		expect(hashKey(a)).toBe(hashKey(b));
	});

	it.each([
		['first', { first: 20 }],
		['after', { after: 'cursor:9' }],
		['last', { last: 5 }],
		['before', { before: 'cursor:2' }],
		['sortBy', { sortBy: 'PRIORITY' as const }],
		['sortOrder', { sortOrder: 'ASC' as const }],
		['includeTotalCount', { includeTotalCount: true }],
		['filter.userId', { filter: { userId: 42 } }],
		['filter.contentId', { filter: { contentId: 3 } }],
		['filter.listId', { filter: { listId: 3 } }],
		['filter.unlisted', { filter: { unlisted: true } }],
		['filter.status', { filter: { status: ['DONE' as const] } }],
		['filter.actionId', { filter: { actionId: 2 } }],
	])('changing %s changes the key', (_name, change) => {
		const changed = asOptions(useUserTodos(() => ({ ...base, ...change }))).queryKey;
		const original = asOptions(useUserTodos(() => ({ ...base }))).queryKey;
		expect(hashKey(changed)).not.toBe(hashKey(original));
	});

	it('the key carries the same variables the queryFn sends', async () => {
		const opts = asOptions(useUserTodos(() => ({ ...base, filter: { listId: 3 } })));
		await opts.queryFn();
		expect(graphqlRequest.mock.calls[0][1]).toEqual({ ...base, filter: { listId: 3 } });
		expect(opts.queryKey).toEqual(queryKeys.userTodos.list({ ...base, filter: { listId: 3 } }));
	});

	it('the Unlisted view sends unlisted to the server and keys on it', async () => {
		const unlisted = { ...base, filter: { userId: 42, unlisted: true } };
		const opts = asOptions(useUserTodos(() => unlisted));
		await opts.queryFn();
		expect(graphqlRequest.mock.calls[0][1]).toEqual(unlisted);
		expect(opts.queryKey).toEqual(queryKeys.userTodos.list(unlisted));
	});

	it('useUserTodoLists: each owner gets its own entry', () => {
		const forOwner42 = asOptions(useUserTodoLists(() => 42)).queryKey;
		const forOwner7 = asOptions(useUserTodoLists(() => 7)).queryKey;
		expect(hashKey(forOwner42)).not.toBe(hashKey(forOwner7));
	});
});

describe('useFetchUserTodos: on-demand lookup shares the useUserTodos entry', () => {
	const LOOKUP: UserTodosArgs = {
		first: 50,
		filter: { userId: 42, contentId: 3, status: ['NOT_STARTED', 'IN_PROGRESS'] },
	};

	it('one lookup costs one call, and a second lookup inside staleTime costs none', async () => {
		graphqlRequest.mockResolvedValue({ userTodos: { items: [], pageInfo: {}, totalCount: null } });
		const lookup = useFetchUserTodos();
		expect(await lookup(LOOKUP)).toEqual([]);
		expect(await lookup(LOOKUP)).toEqual([]);
		expect(graphqlRequest).toHaveBeenCalledTimes(1);
		expect(graphqlRequest.mock.calls[0][1]).toEqual(LOOKUP);
	});

	it('fills the same cache entry that useUserTodos reads for those variables', async () => {
		const items = [{ id: '9' }] as unknown as UserTodoItem[];
		graphqlRequest.mockResolvedValue({ userTodos: { items, pageInfo: {}, totalCount: null } });
		await useFetchUserTodos()(LOOKUP);
		expect(client.getQueryData(queryKeys.userTodos.list(LOOKUP))).toEqual({
			userTodos: { items, pageInfo: {}, totalCount: null },
		});
	});
});

describe('eviction: each mutation evicts exactly the keys it changes', () => {
	const seedAll = (keys: QueryKey[]) => {
		for (const k of keys) seed(client, k);
	};

	it('useCreateUserTodo: invalidates every todo list, nothing else', async () => {
		const todo = { id: '9', listId: 3 } as unknown as UserTodoItem;
		graphqlRequest.mockResolvedValueOnce({ createUserTodo: todo });
		const m = asMutation(useCreateUserTodo());
		const unrelated = [ACTIONS, OWNER_LISTS, DETAIL_8, CONTENT_DETAIL, PERSPECTIVES_BY_USER];
		seedAll([LIST_A, LIST_B, ...unrelated]);

		const data = await m.mutationFn({ actionId: 2, listId: 3 });
		m.onSuccess(data, { actionId: 2, listId: 3 });

		expect(data).toEqual(todo);
		const outcome = invalidationOutcome(client, [LIST_A, LIST_B, ...unrelated]);
		expect(outcome.invalidated).toEqual([LIST_A, LIST_B]);
		expect(outcome.untouched).toEqual(unrelated);
	});

	it('useUpdateUserTodo: invalidates this todo and the todo lists, not other todos', async () => {
		const todo = { id: '9' } as unknown as UserTodoItem;
		graphqlRequest.mockResolvedValueOnce({ updateUserTodo: todo });
		const m = asMutation(useUpdateUserTodo());
		const unrelated = [DETAIL_8, ACTIONS, OWNER_LISTS, CONTENT_DETAIL];
		seedAll([DETAIL_9, LIST_A, LIST_B, ...unrelated]);

		const input = { id: 9, status: 'DONE' };
		const data = await m.mutationFn(input);
		m.onSuccess(data, input);

		const outcome = invalidationOutcome(client, [DETAIL_9, LIST_A, LIST_B, ...unrelated]);
		expect(outcome.invalidated).toEqual([DETAIL_9, LIST_A, LIST_B]);
		expect(outcome.untouched).toEqual(unrelated);
	});

	it('useDeleteUserTodo: removes the deleted todo detail and invalidates the lists', async () => {
		graphqlRequest.mockResolvedValueOnce({ deleteUserTodo: true });
		const m = asMutation(useDeleteUserTodo());
		const unrelated = [DETAIL_8, ACTIONS, OWNER_LISTS, CONTENT_DETAIL];
		seedAll([DETAIL_9, LIST_A, LIST_B, ...unrelated]);

		const id = await m.mutationFn('9');
		m.onSuccess(id, '9');

		expect(client.getQueryState(DETAIL_9)).toBeUndefined();
		const outcome = invalidationOutcome(client, [LIST_A, LIST_B, ...unrelated]);
		expect(outcome.invalidated).toEqual([LIST_A, LIST_B]);
		expect(outcome.untouched).toEqual(unrelated);
	});

	it('useDeleteUserTodo: a server answer of false is an error, not a silent success', async () => {
		graphqlRequest.mockResolvedValueOnce({ deleteUserTodo: false });
		const m = asMutation(useDeleteUserTodo());
		await expect(m.mutationFn('9')).rejects.toThrow('Delete was not confirmed');
	});

	it('useCreateTodoAction: invalidates the action picker only', async () => {
		graphqlRequest.mockResolvedValueOnce({ createTodoAction: { id: '20', key: 'mentor', label: 'Mentor' } });
		const m = asMutation(useCreateTodoAction());
		const unrelated = [LIST_A, LIST_B, OWNER_LISTS, DETAIL_9, CONTENT_DETAIL];
		seedAll([ACTIONS, ...unrelated]);

		const input = { label: 'Mentor' };
		const data = await m.mutationFn(input);
		m.onSuccess(data, input);

		const outcome = invalidationOutcome(client, [ACTIONS, ...unrelated]);
		expect(outcome.invalidated).toEqual([ACTIONS]);
		expect(outcome.untouched).toEqual(unrelated);
	});

	it('useReorderUserTodoList: invalidates the lists and the reordered todos only', async () => {
		graphqlRequest.mockResolvedValueOnce({ reorderUserTodoList: [{ id: '10' }, { id: '9' }] });
		const m = asMutation(useReorderUserTodoList());
		const unrelated = [DETAIL_8, DETAIL_11, ACTIONS, OWNER_LISTS, CONTENT_DETAIL];
		seedAll([LIST_A, LIST_B, DETAIL_9, DETAIL_10, ...unrelated]);

		const input = { listId: 3, todoIds: [10, 9] };
		const data = await m.mutationFn(input);
		m.onSuccess(data, input);

		const outcome = invalidationOutcome(client, [LIST_A, LIST_B, DETAIL_9, DETAIL_10, ...unrelated]);
		expect(outcome.invalidated).toEqual([LIST_A, LIST_B, DETAIL_9, DETAIL_10]);
		expect(outcome.untouched).toEqual(unrelated);
	});

	it('useCreateUserTodoList: invalidates only the owner’s list collection, not todos', async () => {
		graphqlRequest.mockResolvedValueOnce({ createUserTodoList: { id: '5', user: { id: '42' } } });
		const m = asMutation(useCreateUserTodoList());
		const unrelated = [OTHER_OWNER_LISTS, LIST_A, LIST_B, DETAIL_9, ACTIONS, CONTENT_DETAIL];
		seedAll([OWNER_LISTS, ...unrelated]);

		const input = { name: 'Summer' };
		const data = await m.mutationFn(input);
		m.onSuccess(data, input);

		const outcome = invalidationOutcome(client, [OWNER_LISTS, ...unrelated]);
		expect(outcome.invalidated).toEqual([OWNER_LISTS]);
		expect(outcome.untouched).toEqual(unrelated);
	});

	it('useUpdateUserTodoList: invalidates the owner’s lists, todo lists and todo details', async () => {
		graphqlRequest.mockResolvedValueOnce({ updateUserTodoList: { id: '5', user: { id: '42' } } });
		const m = asMutation(useUpdateUserTodoList());
		const unrelated = [OTHER_OWNER_LISTS, ACTIONS, CONTENT_DETAIL, PERSPECTIVES_BY_USER];
		seedAll([OWNER_LISTS, LIST_A, LIST_B, DETAIL_9, ...unrelated]);

		const input = { id: 5, name: 'Autumn' };
		const data = await m.mutationFn(input);
		m.onSuccess(data, input);

		const outcome = invalidationOutcome(client, [OWNER_LISTS, LIST_A, LIST_B, DETAIL_9, ...unrelated]);
		expect(outcome.invalidated).toEqual([OWNER_LISTS, LIST_A, LIST_B, DETAIL_9]);
		expect(outcome.untouched).toEqual(unrelated);
	});

	it('useDeleteUserTodoList: sends the id and invalidates the owner’s caches it names', async () => {
		graphqlRequest.mockResolvedValueOnce({ deleteUserTodoList: true });
		const m = asMutation(useDeleteUserTodoList());
		const unrelated = [OTHER_OWNER_LISTS, ACTIONS, CONTENT_DETAIL];
		seedAll([OWNER_LISTS, LIST_A, LIST_B, DETAIL_9, ...unrelated]);

		const input = { id: '5', userId: 42 };
		await m.mutationFn(input);
		m.onSuccess(undefined, input);

		expect(graphqlRequest.mock.calls[0][1]).toEqual({ id: '5' });
		const outcome = invalidationOutcome(client, [OWNER_LISTS, LIST_A, LIST_B, DETAIL_9, ...unrelated]);
		expect(outcome.invalidated).toEqual([OWNER_LISTS, LIST_A, LIST_B, DETAIL_9]);
		expect(outcome.untouched).toEqual(unrelated);
	});
});
