import { describe, it, expect } from 'vitest';
import {
	LIST_CONTENT,
	GET_CONTENT,
	CREATE_CONTENT_FROM_YOUTUBE,
	CREATE_CONTENT_FROM_MOVIE,
	type ContentItem,
	type ContentResponse,
	type CreateContentResponse,
} from '$lib/queries/content';

describe('GraphQL query definitions', () => {
	describe('Type exports', () => {
		it('exports ContentItem interface', () => {
			const item: ContentItem = {
				id: '1',
				name: 'Test',
				addedByUserID: '7',
				url: 'https://example.com',
				contentType: 'VIDEO',
				length: 100,
				lengthUnits: 'SECONDS',
				viewCount: 1000,
				likeCount: 100,
				channelTitle: 'Test Channel',
				publishedAt: '2024-01-01',
				tags: ['test'],
				description: 'Test description',
				primaryCategory: null,
				createdAt: '2024-01-01',
				updatedAt: '2024-01-01',
			};
			expect(item).toBeDefined();
		});

		it('exports ContentResponse interface', () => {
			const response: ContentResponse = {
				content: {
					items: [],
					pageInfo: {
						hasNextPage: false,
						hasPreviousPage: false,
						startCursor: null,
						endCursor: null,
					},
					totalCount: 0,
				},
			};
			expect(response).toBeDefined();
		});

		it('exports CreateContentResponse interface', () => {
			const response: CreateContentResponse = {
				createContentFromYouTube: {
					content: {
						id: '1',
						name: 'Test',
						addedByUserID: '7',
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
						primaryCategory: null,
						createdAt: '2024-01-01',
						updatedAt: '2024-01-01',
					},
					alreadyExisted: false,
				},
			};
			expect(response).toBeDefined();
		});
	});

	describe('LIST_CONTENT', () => {
		it('is defined and is a string', () => {
			expect(LIST_CONTENT).toBeDefined();
			expect(typeof LIST_CONTENT).toBe('string');
		});

		it('contains the ListContent operation name', () => {
			expect(LIST_CONTENT).toContain('ListContent');
		});

		it('queries content with pagination params', () => {
			expect(LIST_CONTENT).toContain('$first: Int');
			expect(LIST_CONTENT).toContain('$after: String');
		});

		it('includes sorting parameters', () => {
			expect(LIST_CONTENT).toContain('$sortBy: ContentSortBy');
			expect(LIST_CONTENT).toContain('$sortOrder: SortOrder');
		});

		it('includes includeTotalCount parameter', () => {
			expect(LIST_CONTENT).toContain('$includeTotalCount: Boolean');
		});

		it('requests expected content fields', () => {
			expect(LIST_CONTENT).toContain('id');
			expect(LIST_CONTENT).toContain('name');
			expect(LIST_CONTENT).toContain('addedByUserID');
			expect(LIST_CONTENT).toContain('url');
			expect(LIST_CONTENT).toContain('contentType');
			expect(LIST_CONTENT).toContain('createdAt');
			expect(LIST_CONTENT).toContain('updatedAt');
		});

		it('requests length and lengthUnits fields', () => {
			expect(LIST_CONTENT).toContain('length');
			expect(LIST_CONTENT).toContain('lengthUnits');
		});

		it('includes pageInfo for cursor pagination', () => {
			expect(LIST_CONTENT).toContain('pageInfo');
			expect(LIST_CONTENT).toContain('hasNextPage');
			expect(LIST_CONTENT).toContain('endCursor');
		});

		it('includes totalCount', () => {
			expect(LIST_CONTENT).toContain('totalCount');
		});
	});

	describe('GET_CONTENT', () => {
		it('is defined and is a string', () => {
			expect(GET_CONTENT).toBeDefined();
			expect(typeof GET_CONTENT).toBe('string');
		});

		it('contains the GetContent operation name', () => {
			expect(GET_CONTENT).toContain('GetContent');
		});

		it('takes an id parameter', () => {
			expect(GET_CONTENT).toContain('$id: ID!');
		});

		it('uses contentByID query', () => {
			expect(GET_CONTENT).toContain('contentByID');
		});

		it('requests detailed content fields', () => {
			expect(GET_CONTENT).toContain('length');
			expect(GET_CONTENT).toContain('viewCount');
			expect(GET_CONTENT).toContain('likeCount');
			expect(GET_CONTENT).toContain('commentCount');
			expect(GET_CONTENT).toContain('response');
		});
	});

	describe('CREATE_CONTENT_FROM_MOVIE', () => {
		it('is a CreateContentFromMovie mutation taking CreateContentFromMovieInput', () => {
			expect(CREATE_CONTENT_FROM_MOVIE).toContain(
				'mutation CreateContentFromMovie($input: CreateContentFromMovieInput!)',
			);
			expect(CREATE_CONTENT_FROM_MOVIE).toContain('createContentFromMovie(input: $input)');
		});

		it('requests the fields the success toast and its Go-to action need', () => {
			for (const field of ['id', 'name', 'contentType', 'url']) {
				expect(CREATE_CONTENT_FROM_MOVIE).toContain(field);
			}
		});
	});

	describe('CREATE_CONTENT_FROM_YOUTUBE', () => {
		it('is defined and is a string', () => {
			expect(CREATE_CONTENT_FROM_YOUTUBE).toBeDefined();
			expect(typeof CREATE_CONTENT_FROM_YOUTUBE).toBe('string');
		});

		it('contains the CreateContentFromYouTube operation name', () => {
			expect(CREATE_CONTENT_FROM_YOUTUBE).toContain('CreateContentFromYouTube');
		});

		it('is a mutation operation', () => {
			expect(CREATE_CONTENT_FROM_YOUTUBE).toContain('mutation');
		});

		it('takes CreateContentFromYouTubeInput input type', () => {
			expect(CREATE_CONTENT_FROM_YOUTUBE).toContain('$input: CreateContentFromYouTubeInput!');
		});

		it('calls createContentFromYouTube mutation', () => {
			expect(CREATE_CONTENT_FROM_YOUTUBE).toContain('createContentFromYouTube(input: $input)');
		});

		it('requests essential content fields', () => {
			expect(CREATE_CONTENT_FROM_YOUTUBE).toContain('id');
			expect(CREATE_CONTENT_FROM_YOUTUBE).toContain('name');
			expect(CREATE_CONTENT_FROM_YOUTUBE).toContain('url');
			expect(CREATE_CONTENT_FROM_YOUTUBE).toContain('contentType');
		});

		it('requests YouTube-specific metadata fields', () => {
			expect(CREATE_CONTENT_FROM_YOUTUBE).toContain('viewCount');
			expect(CREATE_CONTENT_FROM_YOUTUBE).toContain('likeCount');
			expect(CREATE_CONTENT_FROM_YOUTUBE).toContain('channelTitle');
			expect(CREATE_CONTENT_FROM_YOUTUBE).toContain('publishedAt');
			expect(CREATE_CONTENT_FROM_YOUTUBE).toContain('tags');
			expect(CREATE_CONTENT_FROM_YOUTUBE).toContain('description');
		});

		it('requests length fields', () => {
			expect(CREATE_CONTENT_FROM_YOUTUBE).toContain('length');
			expect(CREATE_CONTENT_FROM_YOUTUBE).toContain('lengthUnits');
		});

		it('requests timestamp fields', () => {
			expect(CREATE_CONTENT_FROM_YOUTUBE).toContain('createdAt');
			expect(CREATE_CONTENT_FROM_YOUTUBE).toContain('updatedAt');
		});

		it('requests alreadyExisted field from CreateContentResult wrapper', () => {
			expect(CREATE_CONTENT_FROM_YOUTUBE).toContain('alreadyExisted');
		});

		it('wraps content fields inside content block', () => {
			expect(CREATE_CONTENT_FROM_YOUTUBE).toContain('content {');
		});
	});
});
