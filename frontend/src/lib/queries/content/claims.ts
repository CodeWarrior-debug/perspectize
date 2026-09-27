import { gql } from 'graphql-request';

export interface CreateClaimInput {
	text: string;
	/** 0 = derive from the Clerk session (the server always uses the session user). */
	userID: number;
	/** Optional: the content item this claim is about. */
	parentContentID?: number;
}

export interface CreateClaimResponse {
	createClaim: {
		id: string;
		name: string;
		contentType: string;
		privacy: 'PUBLIC' | 'PRIVATE';
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
			createdAt
		}
	}
`;
