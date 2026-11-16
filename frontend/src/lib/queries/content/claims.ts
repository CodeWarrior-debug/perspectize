import { gql } from 'graphql-request';

export interface CreateClaimInput {
	text: string;
	userID: number;
	parentContentID: number;
}

export interface CreateClaimResponse {
	createClaim: {
		id: string;
		name: string;
		contentType: string;
		createdAt: string;
	};
}

export const CREATE_CLAIM = gql`
	mutation CreateClaim($input: CreateClaimInput!) {
		createClaim(input: $input) {
			id
			name
			contentType
			createdAt
		}
	}
`;
