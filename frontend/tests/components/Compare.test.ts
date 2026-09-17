import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import TestWrapper from '../helpers/TestWrapper.svelte';

const { mockRequest, clerkState } = vi.hoisted(() => ({
	mockRequest: vi.fn(),
	clerkState: { isLoaded: true, auth: { userId: '1' as string | null } },
}));

vi.mock('$lib/queries/client', () => ({
	graphqlRequest: mockRequest,
}));

vi.mock('svelte-clerk', () => ({
	useClerkContext: () => clerkState,
}));

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import Compare from '$lib/components/Compare.svelte';

const meResponse = {
	me: {
		id: '1',
		username: 'me',
		role: 'DEFAULT',
		onboarding: { version: 1, displayNextSession: false, completedAt: null },
	},
};

const contentResponse = {
	contentByID: {
		id: '10',
		name: 'Video',
		url: null,
		contentType: 'YOUTUBE_VIDEO',
		length: null,
		lengthUnits: null,
		viewCount: null,
		likeCount: null,
		commentCount: null,
		response: null,
		createdAt: '2026-01-01T00:00:00Z',
		updatedAt: '2026-01-01T00:00:00Z',
	},
};

function renderCompare(props: { contentId: string; initialLeftId: string | null; initialRightId: string | null }) {
	return render(TestWrapper, {
		props: {
			queryClient: new QueryClient({
				defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
			}),
			// TestWrapper's `component` prop is typed as Component<{}> (no props) since
			// other callers here render prop-less components; Compare requires props,
			// so cast through `any` to satisfy the helper's narrower type.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			component: Compare as any,
			props,
		},
	});
}

describe('Compare', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clerkState.isLoaded = true;
		clerkState.auth.userId = '1';
	});

	it('shows an empty state when only one perspective exists on the content', async () => {
		mockRequest.mockImplementation((query: string) => {
			if (query.includes('ListUsers')) return Promise.resolve({ users: [{ id: '1', username: 'me' }] });
			if (query.includes('ListPerspectivesByContent')) {
				return Promise.resolve({
					perspectives: {
						items: [
							{
								id: 'p1',
								userID: '1',
								contentID: '10',
								quality: 8000,
								agreement: null,
								importance: null,
								confidence: null,
								like: null,
								review: 'x',
								privacy: 'PUBLIC',
								description: null,
								primaryPerspectiveID: null,
								relatedPerspectiveIDs: null,
								customFields: null,
								feelings: null,
								createdAt: '2026-01-01T00:00:00Z',
								updatedAt: '2026-01-01T00:00:00Z',
							},
						],
					},
				});
			}
			if (query.includes('GetContent')) return Promise.resolve(contentResponse);
			if (query.includes('query Me')) return Promise.resolve(meResponse);
			return Promise.resolve({});
		});

		renderCompare({ contentId: '10', initialLeftId: null, initialRightId: null });

		await waitFor(() => {
			expect(screen.getByText(/no other perspectives/i)).toBeInTheDocument();
		});
	});

	it('renders the comparison summary line when two perspectives exist', async () => {
		mockRequest.mockImplementation((query: string) => {
			if (query.includes('ListUsers'))
				return Promise.resolve({
					users: [
						{ id: '1', username: 'me' },
						{ id: '2', username: 'Jamie Lee' },
					],
				});
			if (query.includes('ListPerspectivesByContent')) {
				return Promise.resolve({
					perspectives: {
						items: [
							{
								id: 'p1',
								userID: '1',
								contentID: '10',
								quality: 8000,
								agreement: null,
								importance: null,
								confidence: null,
								like: 'THUMBS_UP',
								review: 'Great',
								privacy: 'PUBLIC',
								description: null,
								primaryPerspectiveID: null,
								relatedPerspectiveIDs: null,
								customFields: null,
								feelings: null,
								createdAt: '2026-01-01T00:00:00Z',
								updatedAt: '2026-01-02T00:00:00Z',
							},
							{
								id: 'p2',
								userID: '2',
								contentID: '10',
								quality: 7000,
								agreement: null,
								importance: null,
								confidence: null,
								like: 'THUMBS_UP',
								review: 'Good',
								privacy: 'PUBLIC',
								description: null,
								primaryPerspectiveID: null,
								relatedPerspectiveIDs: null,
								customFields: null,
								feelings: null,
								createdAt: '2026-01-01T00:00:00Z',
								updatedAt: '2026-01-01T00:00:00Z',
							},
						],
					},
				});
			}
			if (query.includes('GetContent')) return Promise.resolve(contentResponse);
			if (query.includes('query Me')) return Promise.resolve(meResponse);
			return Promise.resolve({});
		});

		renderCompare({ contentId: '10', initialLeftId: null, initialRightId: null });

		await waitFor(() => {
			expect(screen.getByText(/1 similar/i)).toBeInTheDocument();
		});
	});
});
