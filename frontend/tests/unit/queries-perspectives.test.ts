import { describe, it, expect } from 'vitest';
import {
	CREATE_PERSPECTIVE,
	UPDATE_PERSPECTIVE,
	LIST_PERSPECTIVES_BY_USER,
	type PerspectiveItem,
	type CreatePerspectiveResponse,
	type UpdatePerspectiveResponse,
	type ListPerspectivesByUserResponse,
} from '$lib/queries/perspectives';

describe('Perspective GraphQL query definitions', () => {
	describe('Type exports', () => {
		it('exports PerspectiveItem interface with all required fields', () => {
			const item: PerspectiveItem = {
				id: '1',
				userID: '42',
				contentID: '10',
				quality: 7500,
				agreement: 8000,
				importance: 6000,
				confidence: 9000,
				like: 'THUMBS_UP',
				review: 'Great content',
				privacy: 'PUBLIC',
				description: 'My take on this',
				primaryPerspectiveID: null,
				relatedPerspectiveIDs: [2, 3],
				customFields: { key: 'value' },
				feelings: null,
				createdAt: '2024-01-01T12:00:00Z',
				updatedAt: '2024-01-01T12:00:00Z',
			};
			expect(item).toBeDefined();
		});

		it('accepts null for optional fields in PerspectiveItem', () => {
			const item: PerspectiveItem = {
				id: '1',
				userID: '42',
				contentID: null,
				quality: null,
				agreement: null,
				importance: null,
				confidence: null,
				like: null,
				review: null,
				privacy: 'PUBLIC',
				description: null,
				primaryPerspectiveID: null,
				relatedPerspectiveIDs: null,
				customFields: null,
				feelings: null,
				createdAt: '2024-01-01T12:00:00Z',
				updatedAt: '2024-01-01T12:00:00Z',
			};
			expect(item).toBeDefined();
		});

		it('exports CreatePerspectiveResponse interface', () => {
			const response: CreatePerspectiveResponse = {
				createPerspective: {
					id: '1',
					userID: '42',
					contentID: null,
					quality: 7500,
					agreement: null,
					importance: null,
					confidence: null,
					like: null,
					review: null,
					privacy: 'PUBLIC',
					description: null,
					primaryPerspectiveID: null,
					relatedPerspectiveIDs: null,
					customFields: null,
					feelings: null,
					createdAt: '2024-01-01T12:00:00Z',
					updatedAt: '2024-01-01T12:00:00Z',
				},
			};
			expect(response).toBeDefined();
		});

		it('exports UpdatePerspectiveResponse interface', () => {
			const response: UpdatePerspectiveResponse = {
				updatePerspective: {
					id: '1',
					userID: '42',
					contentID: null,
					quality: 8000,
					agreement: null,
					importance: null,
					confidence: null,
					like: null,
					review: null,
					privacy: 'PUBLIC',
					description: null,
					primaryPerspectiveID: null,
					relatedPerspectiveIDs: null,
					customFields: null,
					feelings: null,
					createdAt: '2024-01-01T12:00:00Z',
					updatedAt: '2024-01-01T12:00:00Z',
				},
			};
			expect(response).toBeDefined();
		});

		it('exports ListPerspectivesByUserResponse interface', () => {
			const response: ListPerspectivesByUserResponse = {
				perspectives: {
					items: [],
				},
			};
			expect(response).toBeDefined();
		});
	});

	describe('CREATE_PERSPECTIVE', () => {
		it('is defined and is a non-empty string', () => {
			expect(CREATE_PERSPECTIVE).toBeDefined();
			expect(typeof CREATE_PERSPECTIVE).toBe('string');
			expect(CREATE_PERSPECTIVE.length).toBeGreaterThan(0);
		});

		it('is a mutation operation', () => {
			expect(CREATE_PERSPECTIVE).toContain('mutation');
		});

		it('contains the CreatePerspective operation name', () => {
			expect(CREATE_PERSPECTIVE).toContain('CreatePerspective');
		});

		it('takes CreatePerspectiveInput input type', () => {
			expect(CREATE_PERSPECTIVE).toContain('$input: CreatePerspectiveInput!');
		});

		it('calls createPerspective mutation', () => {
			expect(CREATE_PERSPECTIVE).toContain('createPerspective(input: $input)');
		});

		it('returns the full perspective row so the cache can be patched without a list refetch', () => {
			expect(CREATE_PERSPECTIVE).toContain('...PerspectiveFields');
			expect(CREATE_PERSPECTIVE).toContain('fragment PerspectiveFields on Perspective');
			expect(CREATE_PERSPECTIVE).toContain('userID');
			expect(CREATE_PERSPECTIVE).toContain('primaryPerspectiveID');
		});
	});

	describe('UPDATE_PERSPECTIVE', () => {
		it('is defined and is a non-empty string', () => {
			expect(UPDATE_PERSPECTIVE).toBeDefined();
			expect(typeof UPDATE_PERSPECTIVE).toBe('string');
			expect(UPDATE_PERSPECTIVE.length).toBeGreaterThan(0);
		});

		it('is a mutation operation', () => {
			expect(UPDATE_PERSPECTIVE).toContain('mutation');
		});

		it('contains the UpdatePerspective operation name', () => {
			expect(UPDATE_PERSPECTIVE).toContain('UpdatePerspective');
		});

		it('takes UpdatePerspectiveInput input type', () => {
			expect(UPDATE_PERSPECTIVE).toContain('$input: UpdatePerspectiveInput!');
		});

		it('calls updatePerspective mutation', () => {
			expect(UPDATE_PERSPECTIVE).toContain('updatePerspective(input: $input)');
		});

		it('returns the full perspective row so the cache can be patched without a list refetch', () => {
			expect(UPDATE_PERSPECTIVE).toContain('...PerspectiveFields');
			expect(UPDATE_PERSPECTIVE).toContain('fragment PerspectiveFields on Perspective');
		});
	});

	describe('LIST_PERSPECTIVES_BY_USER', () => {
		it('is defined and is a non-empty string', () => {
			expect(LIST_PERSPECTIVES_BY_USER).toBeDefined();
			expect(typeof LIST_PERSPECTIVES_BY_USER).toBe('string');
			expect(LIST_PERSPECTIVES_BY_USER.length).toBeGreaterThan(0);
		});

		it('is a query operation', () => {
			expect(LIST_PERSPECTIVES_BY_USER).toContain('query');
		});

		it('contains the ListPerspectivesByUser operation name', () => {
			expect(LIST_PERSPECTIVES_BY_USER).toContain('ListPerspectivesByUser');
		});

		it('filters by userID', () => {
			expect(LIST_PERSPECTIVES_BY_USER).toContain('userID');
		});

		it('requests items array', () => {
			expect(LIST_PERSPECTIVES_BY_USER).toContain('items');
		});
	});
});
