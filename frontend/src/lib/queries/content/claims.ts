import { gql } from 'graphql-request';

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
 * The viewer's claims. Claims are private, so the server returns only the
 * viewer's own; the caller still filters to `addedByUserID` as a guard.
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
