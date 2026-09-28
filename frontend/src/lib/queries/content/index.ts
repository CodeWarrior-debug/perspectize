import { gql } from 'graphql-request';
import type { LyricsAvailability } from '$lib/utils/lyricsLinks';

export type { ContentFilterInput } from '$lib/utils/gridUrlState';

// Values the API returns in Content.contentType (a String, not a GraphQL enum).
export type ContentType = 'YOUTUBE' | 'CLAIM' | 'BIBLE_PASSAGE' | 'YOUTUBE_MUSIC';

export interface ContentItem {
	id: string;
	name: string;
	addedByUserID: string;
	url: string | null;
	contentType: string;
	// BIBLE_PASSAGE only: computed verse ordinals and the optional,
	// first-write-wins display title. Null/absent for other content types.
	verseStartID?: number | null;
	verseEndID?: number | null;
	displayTitle?: string | null;
	length: number | null;
	lengthUnits: string | null;
	viewCount: number | null;
	likeCount: number | null;
	channelTitle: string | null;
	publishedAt: string | null;
	tags: string[] | null;
	description: string | null;
	primaryCategory: {
		id: string;
		wikidataQid: string;
		label: string;
		description: string | null;
		entityType: string | null;
		wikipediaUrl: string | null;
	} | null;
	createdAt: string;
	updatedAt: string;
}

export interface ContentResponse {
	content: {
		items: ContentItem[];
		pageInfo: {
			hasNextPage: boolean;
			hasPreviousPage: boolean;
			startCursor: string | null;
			endCursor: string | null;
		};
		totalCount: number;
	};
}

export interface ContentSortInput {
	field: string; // ContentSortBy enum value
	order: 'ASC' | 'DESC';
}

export interface CreateContentResult {
	content: ContentItem;
	alreadyExisted: boolean;
}

export interface CreateContentResponse {
	createContentFromYouTube: CreateContentResult;
}

export interface CreateMusicContentResponse {
	createContentFromYouTubeMusic: CreateContentResult & {
		content: ContentItem & { relatedMedia: RelatedMedia[] };
	};
}

export type RelatedMediaKind = 'audio' | 'official_video' | 'lyric_video' | 'live' | 'other';

// A reference to another upload of the same song. Not a content row unless a
// user promoted it, in which case contentId is set.
export interface RelatedMedia {
	provider: string;
	videoId: string;
	kind: RelatedMediaKind | string;
	title: string | null;
	contentId: string | null;
	unavailable: boolean;
}

export type { LyricsAvailability };

// The details-modal view of a YOUTUBE_MUSIC row. `response` carries artist/album.
export interface MusicTrack {
	id: string;
	name: string;
	url: string | null;
	relatedMedia: RelatedMedia[];
	lyrics: LyricsAvailability | null;
	response: { artist?: string; album?: string; videoId?: string; coverImageUrl?: string } | null;
}

export interface UpdateContentSourceDataResponse {
	updateContentSourceData: ContentItem;
}

export const LIST_CONTENT = gql`
	query ListContent(
		$first: Int
		$after: String
		$sortBy: ContentSortBy = UPDATED_AT
		$sortOrder: SortOrder = DESC
		$sorts: [ContentSortInput!]
		$filter: ContentFilter
		$includeTotalCount: Boolean = true
	) {
		content(
			first: $first
			after: $after
			sortBy: $sortBy
			sortOrder: $sortOrder
			sorts: $sorts
			filter: $filter
			includeTotalCount: $includeTotalCount
		) {
			items {
				id
				name
				addedByUserID
				url
				contentType
				verseStartID
				verseEndID
				displayTitle
				length
				lengthUnits
				viewCount
				likeCount
				channelTitle
				publishedAt
				tags
				description
				primaryCategory {
					id
					wikidataQid
					label
					description
					entityType
					wikipediaUrl
				}
				createdAt
				updatedAt
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

// Compare page's "choose something to compare" picker: needs perspectiveCount
// per row to filter down to content that actually has 2+ perspectives to
// compare, which is why this is a separate query from LIST_CONTENT (see the
// cost comment on GET_CONTENT_AGGREGATES below) — capped at a modest `first`
// so the added per-row dataloader cost stays bounded to this one picker
// fetch, not every Activity grid page load.
export interface ComparePickerContentItem {
	id: string;
	name: string;
	contentType: string;
	channelTitle: string | null;
	url: string | null;
	perspectiveCount: number | null;
}

export interface ListComparableContentResponse {
	content: {
		items: ComparePickerContentItem[];
	};
}

export const LIST_COMPARABLE_CONTENT = gql`
	query ListComparableContent($first: Int = 40, $filter: ContentFilter) {
		content(first: $first, sortBy: UPDATED_AT, sortOrder: DESC, filter: $filter, includeTotalCount: false) {
			items {
				id
				name
				contentType
				channelTitle
				url
				perspectiveCount
			}
		}
	}
`;

export const GET_CONTENT = gql`
	query GetContent($id: ID!) {
		contentByID(id: $id) {
			id
			name
			url
			contentType
			verseStartID
			verseEndID
			displayTitle
			length
			lengthUnits
			viewCount
			likeCount
			commentCount
			response
			createdAt
			updatedAt
		}
	}
`;

// Same fields as a LIST_CONTENT row, so the details modal can render an item
// that isn't in the currently loaded Activity page (deep link via `?open=<id>`).
export const GET_CONTENT_DETAILS = gql`
	query GetContentDetails($id: ID!) {
		contentByID(id: $id) {
			id
			name
			addedByUserID
			url
			contentType
			verseStartID
			verseEndID
			displayTitle
			length
			lengthUnits
			viewCount
			likeCount
			channelTitle
			publishedAt
			tags
			description
			primaryCategory {
				id
				wikidataQid
				label
				description
				entityType
				wikipediaUrl
			}
			createdAt
			updatedAt
		}
	}
`;

export interface ContentDetailsResponse {
	contentByID: ContentItem | null;
}

// perspectiveCount/averageRating are computed aggregates over a content's
// perspectives (see backend Content.perspectiveCount/averageRating resolvers)
// — too expensive to include on every row of LIST_CONTENT, so they're
// fetched lazily via this dedicated query only when the details modal opens.
export interface ContentAggregates {
	perspectiveCount: number | null;
	averageRating: number | null;
	// How many public perspectives set a Quality rating — i.e. how many
	// values averageRating was actually averaged over. Can be less than
	// perspectiveCount since Quality is optional. Shown in a tooltip on the
	// average rating tile.
	qualityRatingCount: number | null;
}

export interface ContentAggregatesResponse {
	contentByID: ({ id: string } & ContentAggregates) | null;
}

export const GET_CONTENT_AGGREGATES = gql`
	query GetContentAggregates($id: ID!) {
		contentByID(id: $id) {
			id
			perspectiveCount
			averageRating
			qualityRatingCount
		}
	}
`;

export const CREATE_CONTENT_FROM_YOUTUBE = gql`
	mutation CreateContentFromYouTube($input: CreateContentFromYouTubeInput!) {
		createContentFromYouTube(input: $input) {
			content {
				id
				name
				url
				contentType
				length
				lengthUnits
				viewCount
				likeCount
				channelTitle
				publishedAt
				tags
				description
				primaryCategory {
					id
					wikidataQid
					label
					description
					entityType
					wikipediaUrl
				}
				createdAt
				updatedAt
			}
			alreadyExisted
		}
	}
`;

export const CREATE_CONTENT_FROM_YOUTUBE_MUSIC = gql`
	mutation CreateContentFromYouTubeMusic($input: CreateContentFromYouTubeInput!) {
		createContentFromYouTubeMusic(input: $input) {
			content {
				id
				name
				url
				contentType
				length
				lengthUnits
				viewCount
				likeCount
				channelTitle
				publishedAt
				tags
				description
				primaryCategory {
					id
					wikidataQid
					label
					description
					entityType
				}
				relatedMedia {
					videoId
					kind
					contentId
				}
				createdAt
				updatedAt
			}
			alreadyExisted
		}
	}
`;

const MUSIC_TRACK_FIELDS = `
	id
	name
	url
	response
	relatedMedia {
		provider
		videoId
		kind
		title
		contentId
		unavailable
	}
	lyrics {
		available
		lrclibId
		hasSynced
		checkedAt
	}
`;

export const GET_MUSIC_TRACK = gql`
	query GetMusicTrack($id: ID!) {
		contentByID(id: $id) {
			${MUSIC_TRACK_FIELDS}
		}
	}
`;

export const REFRESH_LYRICS_AVAILABILITY = gql`
	mutation RefreshLyricsAvailability($contentId: IntID!) {
		refreshLyricsAvailability(contentId: $contentId) {
			${MUSIC_TRACK_FIELDS}
		}
	}
`;

export const MARK_RELATED_MEDIA_UNAVAILABLE = gql`
	mutation MarkRelatedMediaUnavailable($contentId: IntID!, $videoId: String!) {
		markRelatedMediaUnavailable(contentId: $contentId, videoId: $videoId) {
			${MUSIC_TRACK_FIELDS}
		}
	}
`;

export const PROMOTE_RELATED_MEDIA = gql`
	mutation PromoteRelatedMedia($contentId: IntID!, $videoId: String!) {
		promoteRelatedMedia(contentId: $contentId, videoId: $videoId) {
			id
			name
		}
	}
`;

export const UPDATE_CONTENT_SOURCE_DATA = gql`
	mutation UpdateContentSourceData($contentId: IntID!) {
		updateContentSourceData(contentId: $contentId) {
			id
			name
			url
			contentType
			length
			lengthUnits
			viewCount
			likeCount
			channelTitle
			publishedAt
			tags
			description
			createdAt
			updatedAt
		}
	}
`;
