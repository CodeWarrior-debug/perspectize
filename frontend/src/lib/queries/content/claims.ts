import { gql } from 'graphql-request';

/** A claim is PUBLIC unless its owner keeps it PRIVATE. */
export type ClaimPrivacy = 'PUBLIC' | 'PRIVATE';

export interface CreateClaimInput {
	text: string;
	/** 0 = derive from the Clerk session (the server always uses the session user). */
	userID: number;
	/** Optional: the content item this claim is about. */
	parentContentID?: number;
	/** Optional YYYY-MM-DD; the server defaults it to today when omitted. */
	effectiveDate?: string;
	/** Optional YYYY-MM-DD; must not be before effectiveDate. */
	evaluateBy?: string | null;
	/** Optional; the server defaults to PUBLIC. */
	privacy?: ClaimPrivacy;
}

export interface CreateClaimResponse {
	createClaim: {
		id: string;
		name: string;
		contentType: string;
		privacy: 'PUBLIC' | 'PRIVATE';
		customFields: ClaimCustomFields | null;
		createdAt: string;
	};
}

export const CREATE_CLAIM = gql`
	mutation CreateClaim($input: CreateClaimInput!) {
		createClaim(input: $input) {
			id
			name
			contentType
			privacy
			customFields
			createdAt
		}
	}
`;

/** Content.customFields for a claim. Null on legacy claims that predate the dates. */
export interface ClaimCustomFields {
	effectiveDate?: string;
	evaluateBy?: string;
}

export interface UpdateClaimInput {
	text: string;
	/** Optional YYYY-MM-DD; omitted means the server keeps or defaults it. */
	effectiveDate?: string;
	/** YYYY-MM-DD; null or empty clears it. */
	evaluateBy?: string | null;
	/** Optional; omitted keeps the stored privacy. */
	privacy?: ClaimPrivacy;
}

export interface UpdateClaimResponse {
	updateClaim: {
		id: string;
		name: string;
		contentType: string;
		privacy: 'PUBLIC' | 'PRIVATE';
		customFields: ClaimCustomFields | null;
		createdAt: string;
		updatedAt: string;
	};
}

export const UPDATE_CLAIM = gql`
	mutation UpdateClaim($id: ID!, $input: UpdateClaimInput!) {
		updateClaim(id: $id, input: $input) {
			id
			name
			contentType
			privacy
			customFields
			createdAt
			updatedAt
		}
	}
`;

export interface DeleteClaimVariables {
	id: string;
	/** True hands the claim to the anonymous user instead of deleting it. */
	keepAnonymous?: boolean;
}

export interface DeleteClaimResponse {
	deleteClaim: boolean;
}

export const DELETE_CLAIM = gql`
	mutation DeleteClaim($id: ID!, $keepAnonymous: Boolean) {
		deleteClaim(id: $id, keepAnonymous: $keepAnonymous)
	}
`;

/**
 * True when the server refused the delete because other users have engaged with
 * the claim (extensions.code CLAIM_HAS_OTHERS). Reads the graphql-request ClientError
 * shape (`error.response.errors[0]`), like contentNotAllowedMessage in utils/movie.ts.
 */
export function claimHasOthersError(error: unknown): boolean {
	const first = (error as { response?: { errors?: unknown[] } } | null | undefined)?.response?.errors?.[0] as
		{ extensions?: { code?: unknown } } | undefined;
	return first?.extensions?.code === 'CLAIM_HAS_OTHERS';
}

/** One row of the viewer's own claims (the Declare page list). */
export interface ClaimRow {
	id: string;
	name: string;
	addedByUserID: string;
	privacy: 'PUBLIC' | 'PRIVATE';
	customFields: { effectiveDate?: string; evaluateBy?: string } | null;
	createdAt: string;
	updatedAt: string;
}

export interface ListMyClaimsResponse {
	content: {
		items: ClaimRow[];
	};
}

/**
 * The claims visible to the viewer: public ones plus their own private ones.
 * The caller still filters to `addedByUserID` to show only their own.
 */
export const LIST_MY_CLAIMS = gql`
	query ListMyClaims {
		content(
			first: 100
			sortBy: CREATED_AT
			sortOrder: DESC
			filter: { contentTypes: [CLAIM] }
			includeTotalCount: false
		) {
			items {
				id
				name
				addedByUserID
				privacy
				customFields
				createdAt
				updatedAt
			}
		}
	}
`;
