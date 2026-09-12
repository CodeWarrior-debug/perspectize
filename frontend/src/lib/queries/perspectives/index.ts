import { gql } from 'graphql-request';

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

// Activity feed: recent perspectives across all users, newest updated first.
// The backend's default read-authorization (RestrictToPublicOrOwner) already
// scopes this to public rows plus the signed-in viewer's own — passing an
// explicit `privacy: PUBLIC` filter additionally hides the viewer's own
// private perspectives, which is how the "include my private perspectives"
// toggle on the user-activity view is implemented client-side.
export interface ActivityPerspectiveItem {
	id: string;
	userID: string;
	contentID: string | null;
	privacy: string;
	description: string | null;
	content: { id: string; name: string } | null;
	createdAt: string;
	updatedAt: string;
}

export interface ListActivityPerspectivesResponse {
	perspectives: {
		items: ActivityPerspectiveItem[];
	};
}

export const LIST_ACTIVITY_PERSPECTIVES = gql`
	query ListActivityPerspectives($first: Int, $filter: PerspectiveFilter) {
		perspectives(first: $first, sortBy: UPDATED_AT, sortOrder: DESC, filter: $filter) {
			items {
				id
				userID
				contentID
				privacy
				description
				content {
					id
					name
				}
				createdAt
				updatedAt
			}
		}
	}
`;
