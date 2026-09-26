import { gql } from 'graphql-request';

/**
 * Backend cap on `perspectives(first: Int)` (see backend/schema.graphql /
 * perspective_service.go). The default is 10 -- every consumer of
 * LIST_PERSPECTIVES_BY_USER/LIST_PERSPECTIVES_BY_CONTENT must pass an explicit
 * `first` (this constant), or content/users with more than 10 perspectives
 * silently lose data: the +/glasses "already rated" affordance, the Compare
 * user picker, and onboarding's perspective counts all read past the cutoff
 * as "no perspective" (see the UI gap audit, gap #4).
 */
export const MAX_PERSPECTIVES_PER_LIST = 100;

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
	hermeneuticApproachID?: string | null;
	hermeneuticCustomText?: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface HermeneuticApproach {
	id: string;
	code: string;
	name: string;
	description: string | null;
}

export interface ListHermeneuticApproachesResponse {
	hermeneuticApproaches: HermeneuticApproach[];
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
		hermeneuticApproachID
		hermeneuticCustomText
		createdAt
		updatedAt
	}
`;

export const LIST_HERMENEUTIC_APPROACHES = gql`
	query ListHermeneuticApproaches {
		hermeneuticApproaches {
			id
			code
			name
			description
		}
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
	query ListPerspectivesByUser($userID: IntID, $first: Int) {
		perspectives(filter: { userID: $userID }, first: $first) {
			items {
				...PerspectiveFields
			}
		}
	}
`;

export interface ListPerspectivesByContentResponse {
	perspectives: {
		items: PerspectiveItem[];
	};
}

// Compare page: every perspective on one content row, public + viewer's own
// private (the backend's default RestrictToPublicOrOwner authorization does
// this scoping server-side — this is the whole privacy-gating enforcement
// point, no client-side filtering needed on top of it).
export const LIST_PERSPECTIVES_BY_CONTENT = gql`
	${PERSPECTIVE_FIELDS}
	query ListPerspectivesByContent($contentID: IntID, $first: Int) {
		perspectives(filter: { contentID: $contentID }, first: $first) {
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
	content: {
		id: string;
		name: string;
		url: string | null;
		channelTitle: string | null;
		length: number | null;
		lengthUnits: string | null;
	} | null;
	createdAt: string;
	updatedAt: string;
}

export interface ListActivityPerspectivesResponse {
	perspectives: {
		items: ActivityPerspectiveItem[];
	};
}

// Selects the same thumbnail-card fields as LIST_CONTENT (url/channelTitle/length/
// lengthUnits) on the nested content, so the by-user activity view can render a
// perspective event with the same card look as a content-added event.
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
					url
					channelTitle
					length
					lengthUnits
				}
				createdAt
				updatedAt
			}
		}
	}
`;
