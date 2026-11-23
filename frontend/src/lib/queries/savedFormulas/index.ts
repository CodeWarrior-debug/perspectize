import { gql } from 'graphql-request';
import type { FormulaPayload } from '#lib/customColumns/types.js';

/**
 * Saved items ("one store for what a person saves"; formulas now). The list
 * queries are cached per viewer. Mutations evict exactly the keys they change
 * (see `./savedItemCache.ts` and `queryKeys.savedFormulas` in `../keys.ts`).
 */

/** The viewer's own lists are user-scoped, so they are cached for minutes. */
export const SAVED_FORMULA_STALE_TIME_MS = 2 * 60_000;

/** Shared lists mix in other people's public rows, so they go stale faster. */
export const SHARED_FORMULA_STALE_TIME_MS = 60_000;

/** Page size when the caller does not pass `first` (the SDL default). */
export const SAVED_FORMULA_PAGE_SIZE = 10;

// ---------------------------------------------------------------------------
// Enums and response models
// ---------------------------------------------------------------------------

export type SavedItemType = 'FORMULA' | 'THEME' | 'VIEW' | 'SETTING';
export type SavedItemOrigin = 'OWN' | 'COPY' | 'LINK';
export type SavedItemPrivacy = 'PUBLIC' | 'PRIVATE';

export interface SavedItemUser {
	id: string;
	username: string;
}

/** The fields every saved item has (the `SavedItem` interface in the SDL). */
export interface SavedItem {
	id: string;
	type: SavedItemType;
	name: string;
	privacy: SavedItemPrivacy;
	origin: SavedItemOrigin;
	/** The source of a copy or link. Null for an own item, or when the source is unreadable. */
	sourceId: string | null;
	/** False when a copy or link's source is private or deleted. */
	sourceAvailable: boolean;
	payloadVersion: number;
	user: SavedItemUser;
	/** ISO timestamp. */
	createdAt: string;
	/** ISO timestamp. */
	updatedAt: string;
}

/** A saved formula. `payload` is null for a link whose source is unreadable. */
export interface SavedFormula extends SavedItem {
	payload: FormulaPayload | null;
}

export interface SavedItemPageInfo {
	hasNextPage: boolean;
	hasPreviousPage: boolean;
	startCursor: string | null;
	endCursor: string | null;
}

export interface SavedFormulaPage {
	items: SavedFormula[];
	pageInfo: SavedItemPageInfo;
	totalCount: number | null;
}

// ---------------------------------------------------------------------------
// Query / mutation variables
// ---------------------------------------------------------------------------

/**
 * Every variable the list queries send; their queryKeys mirror this object exactly.
 * A type alias, not an interface: graphqlRequest takes Record<string, unknown>,
 * which an interface does not satisfy.
 */
export type SavedFormulaListArgs = {
	first?: number;
	after?: string | null;
	includeTotalCount?: boolean;
};

export type CreateSavedFormulaInput = {
	name: string;
	payload: FormulaPayload;
	/** Defaults to PRIVATE on the server. */
	privacy?: SavedItemPrivacy;
};

/** `id` is an IntID on this one mutation (the others take an ID string). Omit a field to leave it unchanged. */
export type UpdateSavedFormulaInput = {
	id: number;
	name?: string;
	payload?: FormulaPayload;
};

export interface MySavedFormulasResponse {
	mySavedFormulas: SavedFormulaPage;
}

export interface SharedFormulasResponse {
	sharedFormulas: SavedFormulaPage;
}

export interface CreateSavedFormulaResponse {
	createSavedFormula: SavedFormula;
}

export interface UpdateSavedFormulaResponse {
	updateSavedFormula: SavedFormula;
}

export interface DeleteSavedItemResponse {
	deleteSavedItem: boolean;
}

export interface RestoreSavedItemResponse {
	restoreSavedItem: SavedItem;
}

export interface SetSavedItemPrivacyResponse {
	setSavedItemPrivacy: SavedItem;
}

export interface CopySavedItemResponse {
	copySavedItem: SavedItem;
}

export interface LinkSavedItemResponse {
	linkSavedItem: SavedItem;
}

export interface ConvertLinkToCopyResponse {
	convertLinkToCopy: SavedItem;
}

// ---------------------------------------------------------------------------
// Fragments
// ---------------------------------------------------------------------------

// The interface fields. Generic (id-based) mutations return `SavedItem`, so they
// select only these; `payload` is on SavedFormula alone.
const SAVED_ITEM_FIELDS = gql`
	fragment SavedItemFields on SavedItem {
		id
		type
		name
		privacy
		origin
		sourceId
		sourceAvailable
		payloadVersion
		user {
			id
			username
		}
		createdAt
		updatedAt
	}
`;

const SAVED_FORMULA_FIELDS = gql`
	${SAVED_ITEM_FIELDS}
	fragment SavedFormulaFields on SavedFormula {
		...SavedItemFields
		payload
	}
`;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const MY_SAVED_FORMULAS = gql`
	${SAVED_FORMULA_FIELDS}
	query MySavedFormulas($first: Int, $after: String, $includeTotalCount: Boolean) {
		mySavedFormulas(first: $first, after: $after, includeTotalCount: $includeTotalCount) {
			items {
				...SavedFormulaFields
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

export const SHARED_FORMULAS = gql`
	${SAVED_FORMULA_FIELDS}
	query SharedFormulas($first: Int, $after: String, $includeTotalCount: Boolean) {
		sharedFormulas(first: $first, after: $after, includeTotalCount: $includeTotalCount) {
			items {
				...SavedFormulaFields
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

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export const CREATE_SAVED_FORMULA = gql`
	${SAVED_FORMULA_FIELDS}
	mutation CreateSavedFormula($input: CreateSavedFormulaInput!) {
		createSavedFormula(input: $input) {
			...SavedFormulaFields
		}
	}
`;

export const UPDATE_SAVED_FORMULA = gql`
	${SAVED_FORMULA_FIELDS}
	mutation UpdateSavedFormula($input: UpdateSavedFormulaInput!) {
		updateSavedFormula(input: $input) {
			...SavedFormulaFields
		}
	}
`;

export const DELETE_SAVED_ITEM = gql`
	mutation DeleteSavedItem($id: ID!) {
		deleteSavedItem(id: $id)
	}
`;

export const RESTORE_SAVED_ITEM = gql`
	${SAVED_ITEM_FIELDS}
	mutation RestoreSavedItem($id: ID!) {
		restoreSavedItem(id: $id) {
			...SavedItemFields
		}
	}
`;

export const SET_SAVED_ITEM_PRIVACY = gql`
	${SAVED_ITEM_FIELDS}
	mutation SetSavedItemPrivacy($id: ID!, $privacy: Privacy!) {
		setSavedItemPrivacy(id: $id, privacy: $privacy) {
			...SavedItemFields
		}
	}
`;

export const COPY_SAVED_ITEM = gql`
	${SAVED_ITEM_FIELDS}
	mutation CopySavedItem($id: ID!) {
		copySavedItem(id: $id) {
			...SavedItemFields
		}
	}
`;

export const LINK_SAVED_ITEM = gql`
	${SAVED_ITEM_FIELDS}
	mutation LinkSavedItem($id: ID!) {
		linkSavedItem(id: $id) {
			...SavedItemFields
		}
	}
`;

export const CONVERT_LINK_TO_COPY = gql`
	${SAVED_ITEM_FIELDS}
	mutation ConvertLinkToCopy($id: ID!) {
		convertLinkToCopy(id: $id) {
			...SavedItemFields
		}
	}
`;
