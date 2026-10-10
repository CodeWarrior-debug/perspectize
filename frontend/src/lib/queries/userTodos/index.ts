import { gql } from 'graphql-request';

/**
 * User todos ("Plan"). Todos and todo lists are user-scoped, so they are cached
 * for minutes, not seconds. Mutations evict only the keys they change (see the
 * `use*` hooks and `queryKeys.userTodos` in `../keys.ts`).
 */
export const USER_TODO_STALE_TIME_MS = 2 * 60_000;

/**
 * The action picker. Presets never change at runtime; a user's own actions
 * appear only when they add one, and `useCreateTodoAction` evicts this key.
 */
export const TODO_ACTIONS_STALE_TIME_MS = 30 * 60_000;

// ---------------------------------------------------------------------------
// Enums and scalars
// ---------------------------------------------------------------------------

export type UserTodoStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'DROPPED';
export type UserTodoSortBy = 'PRIORITY' | 'DUE_DATE' | 'CREATED_AT' | 'UPDATED_AT' | 'LIST_POSITION';
export type TodoPrivacy = 'PUBLIC' | 'PRIVATE';
export type TodoSortOrder = 'ASC' | 'DESC';

// ---------------------------------------------------------------------------
// Response models
// ---------------------------------------------------------------------------

export interface TodoActionItem {
	id: string;
	key: string;
	label: string;
	description: string;
	typicalSequence: number | null;
	isPreset: boolean;
}

export interface TodoUserRef {
	id: string;
	username: string;
}

export interface UserTodoListItem {
	id: string;
	user: TodoUserRef;
	name: string;
	description: string | null;
	privacy: TodoPrivacy;
	createdAt: string;
	updatedAt: string;
}

export interface UserTodoItem {
	id: string;
	user: TodoUserRef;
	content: { id: string; name: string } | null;
	/** Free-text name; only meaningful when `content` is null. */
	name: string | null;
	action: TodoActionItem;
	priority: number | null;
	status: UserTodoStatus;
	percentComplete: number;
	/** ISO date, YYYY-MM-DD. */
	startDate: string | null;
	endDate: string | null;
	dueDate: string | null;
	comments: string | null;
	privacy: TodoPrivacy;
	list: { id: string; name: string } | null;
	listPosition: number | null;
	createdAt: string;
	updatedAt: string;
}

export interface TodoPageInfo {
	hasNextPage: boolean;
	hasPreviousPage: boolean;
	startCursor: string | null;
	endCursor: string | null;
}

// ---------------------------------------------------------------------------
// Query / mutation variables
// ---------------------------------------------------------------------------

export interface UserTodoFilter {
	userId?: number;
	contentId?: number;
	listId?: number;
	status?: UserTodoStatus[];
	actionId?: number;
}

/**
 * Every variable `useUserTodos` sends; its queryKey mirrors this object exactly.
 * A type alias, not an interface: graphqlRequest takes Record<string, unknown>,
 * which an interface does not satisfy.
 */
export type UserTodosArgs = {
	first?: number;
	after?: string | null;
	last?: number;
	before?: string | null;
	sortBy?: UserTodoSortBy;
	sortOrder?: TodoSortOrder;
	includeTotalCount?: boolean;
	filter?: UserTodoFilter;
};

export interface CreateUserTodoInput {
	contentId?: number;
	name?: string;
	actionId: number;
	priority?: number;
	status?: UserTodoStatus;
	percentComplete?: number;
	startDate?: string;
	endDate?: string;
	dueDate?: string;
	comments?: string;
	privacy?: TodoPrivacy;
	listId?: number;
}

/** Omit a field to leave it unchanged; pass `null` to clear a clearable field. */
export interface UpdateUserTodoInput {
	id: number;
	contentId?: number | null;
	name?: string | null;
	actionId?: number;
	priority?: number | null;
	status?: UserTodoStatus;
	percentComplete?: number;
	startDate?: string | null;
	endDate?: string | null;
	dueDate?: string | null;
	comments?: string | null;
	privacy?: TodoPrivacy;
	listId?: number | null;
}

export interface CreateTodoActionInput {
	label: string;
	description?: string;
}

export interface CreateUserTodoListInput {
	name: string;
	description?: string;
	privacy?: TodoPrivacy;
}

export interface UpdateUserTodoListInput {
	id: number;
	name?: string;
	description?: string | null;
	privacy?: TodoPrivacy;
}

export interface UserTodosResponse {
	userTodos: {
		items: UserTodoItem[];
		pageInfo: TodoPageInfo;
		totalCount: number | null;
	};
}

export interface UserTodoByIDResponse {
	userTodoByID: UserTodoItem | null;
}

export interface UserTodoListsResponse {
	userTodoLists: UserTodoListItem[];
}

export interface TodoActionsResponse {
	todoActions: TodoActionItem[];
}

export interface CreateUserTodoResponse {
	createUserTodo: UserTodoItem;
}

export interface UpdateUserTodoResponse {
	updateUserTodo: UserTodoItem;
}

export interface DeleteUserTodoResponse {
	deleteUserTodo: boolean;
}

export interface CreateTodoActionResponse {
	createTodoAction: TodoActionItem;
}

export interface CreateUserTodoListResponse {
	createUserTodoList: UserTodoListItem;
}

export interface UpdateUserTodoListResponse {
	updateUserTodoList: UserTodoListItem;
}

export interface DeleteUserTodoListResponse {
	deleteUserTodoList: boolean;
}

export interface ReorderUserTodoListResponse {
	reorderUserTodoList: UserTodoItem[];
}

// ---------------------------------------------------------------------------
// Fragments
// ---------------------------------------------------------------------------

const TODO_ACTION_FIELDS = gql`
	fragment TodoActionFields on TodoAction {
		id
		key
		label
		description
		typicalSequence
		isPreset
	}
`;

const USER_TODO_LIST_FIELDS = gql`
	fragment UserTodoListFields on UserTodoList {
		id
		user {
			id
			username
		}
		name
		description
		privacy
		createdAt
		updatedAt
	}
`;

// One shape for list items, by-id and every mutation result, so a cached detail
// and a cached list row are interchangeable.
const USER_TODO_FIELDS = gql`
	${TODO_ACTION_FIELDS}
	fragment UserTodoFields on UserTodo {
		id
		user {
			id
			username
		}
		content {
			id
			name
		}
		name
		action {
			...TodoActionFields
		}
		priority
		status
		percentComplete
		startDate
		endDate
		dueDate
		comments
		privacy
		list {
			id
			name
		}
		listPosition
		createdAt
		updatedAt
	}
`;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const USER_TODOS = gql`
	${USER_TODO_FIELDS}
	query UserTodos(
		$first: Int
		$after: String
		$last: Int
		$before: String
		$sortBy: UserTodoSortBy
		$sortOrder: SortOrder
		$includeTotalCount: Boolean
		$filter: UserTodoFilter
	) {
		userTodos(
			first: $first
			after: $after
			last: $last
			before: $before
			sortBy: $sortBy
			sortOrder: $sortOrder
			includeTotalCount: $includeTotalCount
			filter: $filter
		) {
			items {
				...UserTodoFields
			}
			pageInfo {
				hasNextPage
				hasPreviousPage
				startCursor
				endCursor
			}
			totalCount
		}
	}
`;

export const USER_TODO_BY_ID = gql`
	${USER_TODO_FIELDS}
	query UserTodoByID($id: ID!) {
		userTodoByID(id: $id) {
			...UserTodoFields
		}
	}
`;

export const USER_TODO_LISTS = gql`
	${USER_TODO_LIST_FIELDS}
	query UserTodoLists($userId: IntID!) {
		userTodoLists(userId: $userId) {
			...UserTodoListFields
		}
	}
`;

export const TODO_ACTIONS = gql`
	${TODO_ACTION_FIELDS}
	query TodoActions {
		todoActions {
			...TodoActionFields
		}
	}
`;

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export const CREATE_USER_TODO = gql`
	${USER_TODO_FIELDS}
	mutation CreateUserTodo($input: CreateUserTodoInput!) {
		createUserTodo(input: $input) {
			...UserTodoFields
		}
	}
`;

export const UPDATE_USER_TODO = gql`
	${USER_TODO_FIELDS}
	mutation UpdateUserTodo($input: UpdateUserTodoInput!) {
		updateUserTodo(input: $input) {
			...UserTodoFields
		}
	}
`;

export const DELETE_USER_TODO = gql`
	mutation DeleteUserTodo($id: ID!) {
		deleteUserTodo(id: $id)
	}
`;

export const CREATE_TODO_ACTION = gql`
	${TODO_ACTION_FIELDS}
	mutation CreateTodoAction($input: CreateTodoActionInput!) {
		createTodoAction(input: $input) {
			...TodoActionFields
		}
	}
`;

export const CREATE_USER_TODO_LIST = gql`
	${USER_TODO_LIST_FIELDS}
	mutation CreateUserTodoList($input: CreateUserTodoListInput!) {
		createUserTodoList(input: $input) {
			...UserTodoListFields
		}
	}
`;

export const UPDATE_USER_TODO_LIST = gql`
	${USER_TODO_LIST_FIELDS}
	mutation UpdateUserTodoList($input: UpdateUserTodoListInput!) {
		updateUserTodoList(input: $input) {
			...UserTodoListFields
		}
	}
`;

export const DELETE_USER_TODO_LIST = gql`
	mutation DeleteUserTodoList($id: ID!) {
		deleteUserTodoList(id: $id)
	}
`;

export const REORDER_USER_TODO_LIST = gql`
	${USER_TODO_FIELDS}
	mutation ReorderUserTodoList($listId: IntID!, $todoIds: [IntID!]!) {
		reorderUserTodoList(listId: $listId, todoIds: $todoIds) {
			...UserTodoFields
		}
	}
`;
