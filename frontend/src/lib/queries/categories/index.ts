import { gql } from 'graphql-request';
import type { ContentItem } from '../content';

export interface WikidataSearchResult {
	qid: string;
	label: string;
	description: string | null;
	entityType: string | null;
}

export interface WikidataSearchResponse {
	wikidataSearch: WikidataSearchResult[];
}

export interface CategoryItem {
	id: string;
	wikidataQid: string;
	label: string;
	description: string | null;
	entityType: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface SetPrimaryCategoryResponse {
	setPrimaryCategory: ContentItem;
}

export const WIKIDATA_SEARCH = gql`
	query WikidataSearch($query: String!, $language: String, $limit: Int) {
		wikidataSearch(query: $query, language: $language, limit: $limit) {
			qid
			label
			description
			entityType
		}
	}
`;

export const SET_PRIMARY_CATEGORY = gql`
	mutation SetPrimaryCategory($input: SetPrimaryCategoryInput!) {
		setPrimaryCategory(input: $input) {
			id
			name
			primaryCategory {
				id
				wikidataQid
				label
				description
				entityType
			}
		}
	}
`;
