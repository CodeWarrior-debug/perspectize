import { describe, it, expect } from 'vitest';
import {
	WIKIDATA_SEARCH,
	SET_PRIMARY_CATEGORY,
	type WikidataSearchResult,
	type WikidataSearchResponse,
	type CategoryItem,
	type SetPrimaryCategoryResponse,
} from '$lib/queries/categories';

describe('Category GraphQL query definitions', () => {
	describe('Type exports', () => {
		it('exports WikidataSearchResult interface', () => {
			const result: WikidataSearchResult = {
				qid: 'Q5',
				label: 'human',
				description: 'common name of Homo sapiens',
				entityType: 'item',
			};
			expect(result).toBeDefined();
			expect(result.qid).toBe('Q5');
		});

		it('exports WikidataSearchResponse interface', () => {
			const response: WikidataSearchResponse = {
				wikidataSearch: [
					{
						qid: 'Q5',
						label: 'human',
						description: 'common name of Homo sapiens',
						entityType: 'item',
					},
				],
			};
			expect(response.wikidataSearch).toHaveLength(1);
		});

		it('exports CategoryItem interface', () => {
			const item: CategoryItem = {
				id: '1',
				wikidataQid: 'Q5',
				label: 'human',
				description: 'common name of Homo sapiens',
				entityType: 'item',
				wikipediaUrl: 'https://en.wikipedia.org/wiki/Human',
				createdAt: '2026-01-01T12:00:00Z',
				updatedAt: '2026-01-01T12:00:00Z',
			};
			expect(item).toBeDefined();
			expect(item.wikidataQid).toBe('Q5');
		});

		it('exports SetPrimaryCategoryResponse interface', () => {
			const response: SetPrimaryCategoryResponse = {
				setPrimaryCategory: {
					id: '1',
					addedByUserID: '1',
					name: 'Test Video',
					url: 'https://youtube.com/watch?v=test',
					contentType: 'VIDEO',
					length: 100,
					lengthUnits: 'SECONDS',
					viewCount: 1000,
					likeCount: 100,
					channelTitle: 'Test Channel',
					publishedAt: '2024-01-01',
					tags: ['test'],
					description: 'Test description',
					primaryCategory: {
						id: '1',
						wikidataQid: 'Q5',
						label: 'human',
						description: 'common name of Homo sapiens',
						entityType: 'item',
						wikipediaUrl: 'https://en.wikipedia.org/wiki/Human',
					},
					createdAt: '2024-01-01',
					updatedAt: '2024-01-01',
				},
			};
			expect(response.setPrimaryCategory.primaryCategory?.label).toBe('human');
		});
	});

	describe('WIKIDATA_SEARCH', () => {
		it('is defined and is a string', () => {
			expect(WIKIDATA_SEARCH).toBeDefined();
			expect(typeof WIKIDATA_SEARCH).toBe('string');
		});

		it('contains the WikidataSearch operation name', () => {
			expect(WIKIDATA_SEARCH).toContain('WikidataSearch');
		});

		it('is a query operation', () => {
			expect(WIKIDATA_SEARCH).toContain('query');
		});

		it('takes query, language, and limit parameters', () => {
			expect(WIKIDATA_SEARCH).toContain('$query: String!');
			expect(WIKIDATA_SEARCH).toContain('$language: String');
			expect(WIKIDATA_SEARCH).toContain('$limit: Int');
		});

		it('requests expected result fields', () => {
			expect(WIKIDATA_SEARCH).toContain('qid');
			expect(WIKIDATA_SEARCH).toContain('label');
			expect(WIKIDATA_SEARCH).toContain('description');
			expect(WIKIDATA_SEARCH).toContain('entityType');
		});

		it('calls wikidataSearch query', () => {
			expect(WIKIDATA_SEARCH).toContain('wikidataSearch(');
		});
	});

	describe('SET_PRIMARY_CATEGORY', () => {
		it('is defined and is a string', () => {
			expect(SET_PRIMARY_CATEGORY).toBeDefined();
			expect(typeof SET_PRIMARY_CATEGORY).toBe('string');
		});

		it('contains the SetPrimaryCategory operation name', () => {
			expect(SET_PRIMARY_CATEGORY).toContain('SetPrimaryCategory');
		});

		it('is a mutation operation', () => {
			expect(SET_PRIMARY_CATEGORY).toContain('mutation');
		});

		it('takes SetPrimaryCategoryInput input type', () => {
			expect(SET_PRIMARY_CATEGORY).toContain('$input: SetPrimaryCategoryInput!');
		});

		it('calls setPrimaryCategory mutation', () => {
			expect(SET_PRIMARY_CATEGORY).toContain('setPrimaryCategory(input: $input)');
		});

		it('requests content id and name in response', () => {
			expect(SET_PRIMARY_CATEGORY).toContain('id');
			expect(SET_PRIMARY_CATEGORY).toContain('name');
		});

		it('requests nested primaryCategory fields in response', () => {
			expect(SET_PRIMARY_CATEGORY).toContain('primaryCategory {');
			expect(SET_PRIMARY_CATEGORY).toContain('wikidataQid');
			expect(SET_PRIMARY_CATEGORY).toContain('label');
			expect(SET_PRIMARY_CATEGORY).toContain('description');
			expect(SET_PRIMARY_CATEGORY).toContain('entityType');
		});
	});
});
