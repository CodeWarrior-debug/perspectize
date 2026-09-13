import { gql } from 'graphql-request';

export type { ContentFilterInput } from '$lib/utils/gridUrlState';

export interface ContentItem {
	id: string;
	name: string;
	addedByUserID: string;
	url: string | null;
	contentType: string;
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

export interface CreateContentResponse {
	createContentFromYouTube: {
		content: ContentItem;
		alreadyExisted: boolean;
	};
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
		$filter: ContentFilter
		$includeTotalCount: Boolean = true
	) {
		content(
			first: $first
			after: $after
			sortBy: $sortBy
			sortOrder: $sortOrder
			filter: $filter
			includeTotalCount: $includeTotalCount
		) {
			items {
				id
				name
				addedByUserID
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

export const GET_CONTENT = gql`
	query GetContent($id: ID!) {
		contentByID(id: $id) {
			id
			name
			url
			contentType
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
				}
				createdAt
				updatedAt
			}
			alreadyExisted
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
