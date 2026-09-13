import { gql } from 'graphql-request';

export interface FeelingEntry {
	emoji: string;
	label: string | null;
	intensity: number;
	note: string | null;
}

export interface PerspectiveItem {
	id: string;
	userID: string;
	contentID: string | null;
	quality: number | null;
	agreement: number | null;
	importance: number | null;
	confidence: number | null;
	like: string | null;
	review: string | null;
	privacy: string;
	description: string | null;
	primaryPerspectiveID: string | null;
	relatedPerspectiveIDs: number[] | null;
	customFields: Record<string, unknown> | null;
	feelings: FeelingEntry[] | null;
	createdAt: string;
	updatedAt: string;
}

export interface CreatePerspectiveResponse {
	createPerspective: PerspectiveItem;
}

export interface UpdatePerspectiveResponse {
	updatePerspective: PerspectiveItem;
}

export interface ListPerspectivesByUserResponse {
	perspectives: {
		items: PerspectiveItem[];
	};
}

const PERSPECTIVE_FIELDS = gql`
	fragment PerspectiveFields on Perspective {
		id
		userID
		contentID
		quality
		agreement
		importance
		confidence
		like
		review
		privacy
		description
		primaryPerspectiveID
		relatedPerspectiveIDs
		customFields
		feelings {
			emoji
			label
			intensity
			note
		}
		createdAt
		updatedAt
	}
`;

// Both mutations return the full row so the caller can patch the cached
// ListPerspectivesByUser result in place (optimistic insert/edit reconciled
// with the server id + timestamps) instead of refetching the whole list.
export const CREATE_PERSPECTIVE = gql`
	${PERSPECTIVE_FIELDS}
	mutation CreatePerspective($input: CreatePerspectiveInput!) {
		createPerspective(input: $input) {
			...PerspectiveFields
		}
	}
`;

export const UPDATE_PERSPECTIVE = gql`
	${PERSPECTIVE_FIELDS}
	mutation UpdatePerspective($input: UpdatePerspectiveInput!) {
		updatePerspective(input: $input) {
			...PerspectiveFields
		}
	}
`;

export const LIST_PERSPECTIVES_BY_USER = gql`
	${PERSPECTIVE_FIELDS}
	query ListPerspectivesByUser($userID: IntID) {
		perspectives(filter: { userID: $userID }) {
			items {
				...PerspectiveFields
			}
		}
	}
`;
