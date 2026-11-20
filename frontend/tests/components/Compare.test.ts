import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
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
import { goto } from '$app/navigation';

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

	// Usernames come from Perspective.user on the perspectives query; the page
	// must not download the whole users table (it used to, via ListUsers).
	afterEach(() => {
		const queries = mockRequest.mock.calls.map((c: unknown[]) => String(c[0]));
		expect(queries.some((q: string) => q.includes('ListUsers'))).toBe(false);
	});

	it('shows the loading state, not an empty state, while perspectives are still in flight', async () => {
		mockRequest.mockImplementation((query: string) => {
			if (query.includes('ListPerspectivesByContent')) return new Promise(() => {});
			if (query.includes('GetContent')) return Promise.resolve(contentResponse);
			if (query.includes('query Me')) return Promise.resolve(meResponse);
			return Promise.resolve({});
		});

		renderCompare({ contentId: '10', initialLeftId: null, initialRightId: null });

		expect(await screen.findByText(/loading comparison/i)).toBeInTheDocument();
		expect(screen.queryByText(/no one has shared a perspective/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/no other perspectives/i)).not.toBeInTheDocument();
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
								user: { id: '1', username: 'me' },
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
								user: { id: '1', username: 'me' },
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
								user: { id: '2', username: 'Jamie Lee' },
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

	// Three perspectives so "most recently updated (excluding left)" is actually
	// distinguishing: user 3's perspective is newer than user 2's, so the default
	// right side must be user 3, not simply "the other" user or list order.
	function threeUserFixture() {
		mockRequest.mockImplementation((query: string) => {
			if (query.includes('ListUsers'))
				return Promise.resolve({
					users: [
						{ id: '1', username: 'me' },
						{ id: '2', username: 'Jamie Lee' },
						{ id: '3', username: 'Sam Rivera' },
					],
				});
			if (query.includes('ListPerspectivesByContent')) {
				return Promise.resolve({
					perspectives: {
						items: [
							{
								id: 'p1',
								userID: '1',
								user: { id: '1', username: 'me' },
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
								updatedAt: '2026-01-01T00:00:00Z',
							},
							{
								id: 'p2',
								userID: '2',
								user: { id: '2', username: 'Jamie Lee' },
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
								updatedAt: '2026-01-02T00:00:00Z',
							},
							{
								id: 'p3',
								userID: '3',
								user: { id: '3', username: 'Sam Rivera' },
								contentID: '10',
								quality: 6000,
								agreement: null,
								importance: null,
								confidence: null,
								like: 'THUMBS_UP',
								review: 'Fine',
								privacy: 'PUBLIC',
								description: null,
								primaryPerspectiveID: null,
								relatedPerspectiveIDs: null,
								customFields: null,
								feelings: null,
								createdAt: '2026-01-01T00:00:00Z',
								updatedAt: '2026-01-03T00:00:00Z',
							},
						],
					},
				});
			}
			if (query.includes('GetContent')) return Promise.resolve(contentResponse);
			if (query.includes('query Me')) return Promise.resolve(meResponse);
			return Promise.resolve({});
		});
	}

	it('defaults the left picker to the viewer and the right picker to the most-recently-updated other user', async () => {
		threeUserFixture();

		renderCompare({ contentId: '10', initialLeftId: null, initialRightId: null });

		await waitFor(() => {
			expect(screen.getByTestId('picker-left')).toBeInTheDocument();
		});

		const leftSelect = screen.getByTestId('picker-left') as HTMLSelectElement;
		const rightSelect = screen.getByTestId('picker-right') as HTMLSelectElement;

		// Viewer (user 1) is signed in and has a perspective, so left defaults to them.
		expect(leftSelect.value).toBe('p1');
		// User 3's perspective (2026-01-03) is more recently updated than user 2's
		// (2026-01-02), so the right default must be user 3, not user 2 or list order.
		expect(rightSelect.value).toBe('p3');
	});

	it('calls goto with left/right reversed when the swap button is clicked', async () => {
		threeUserFixture();

		renderCompare({ contentId: '10', initialLeftId: null, initialRightId: null });

		await waitFor(() => {
			expect(screen.getByTestId('picker-left')).toBeInTheDocument();
		});

		const swapButton = screen.getByRole('button', { name: /swap sides/i });
		await swapButton.click();

		expect(vi.mocked(goto)).toHaveBeenCalledWith(
			expect.stringContaining('left=p3'),
			expect.objectContaining({ replaceState: true }),
		);
		const [calledUrl] = vi.mocked(goto).mock.calls[0];
		expect(calledUrl).toContain('left=p3');
		expect(calledUrl).toContain('right=p1');
	});

	// Regression test: picker options must come from the privacy-scoped
	// perspectives list (LIST_PERSPECTIVES_BY_CONTENT), never from the full
	// ListUsers result — otherwise a user with no visible perspective on this
	// content could be picked, defeating privacy gating.
	it('derives picker options from perspectives, not the full users list', async () => {
		mockRequest.mockImplementation((query: string) => {
			if (query.includes('ListUsers'))
				return Promise.resolve({
					users: [
						{ id: '1', username: 'me' },
						{ id: '2', username: 'Jamie Lee' },
						{ id: '3', username: 'Sam Rivera' },
					],
				});
			if (query.includes('ListPerspectivesByContent')) {
				return Promise.resolve({
					perspectives: {
						items: [
							{
								id: 'p1',
								userID: '1',
								user: { id: '1', username: 'me' },
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
								updatedAt: '2026-01-01T00:00:00Z',
							},
							{
								id: 'p2',
								userID: '2',
								user: { id: '2', username: 'Jamie Lee' },
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
								updatedAt: '2026-01-02T00:00:00Z',
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
			expect(screen.getByTestId('picker-left')).toBeInTheDocument();
		});

		const leftSelect = screen.getByTestId('picker-left') as HTMLSelectElement;
		const rightSelect = screen.getByTestId('picker-right') as HTMLSelectElement;

		// 3 users fetched, but only 2 have a fetched perspective. Each picker
		// excludes the other picker's current selection, so with only 2
		// perspective options each select shows exactly 1 option — if options
		// were wrongly derived from the full 3-user list, each would show 2.
		const leftValues = Array.from(leftSelect.options).map((o) => o.value);
		const rightValues = Array.from(rightSelect.options).map((o) => o.value);
		expect(leftValues).toHaveLength(1);
		expect(rightValues).toHaveLength(1);
		// Neither select ever offers user 3, who has no fetched perspective.
		expect(leftValues).not.toContain('3');
		expect(rightValues).not.toContain('3');
	});

	it("passes the viewer's id to ComparePickerRow so avatar color follows identity, not side", async () => {
		threeUserFixture();

		renderCompare({ contentId: '10', initialLeftId: null, initialRightId: null });

		await waitFor(() => {
			expect(screen.getByTestId('picker-left')).toBeInTheDocument();
		});

		// Viewer (user 1) defaults to the left picker and must be primary-colored.
		const leftSelect = screen.getByTestId('picker-left') as HTMLSelectElement;
		expect(leftSelect.value).toBe('p1');
		const leftAvatar = leftSelect.parentElement?.querySelector('span[style*="background-color"]');
		expect(leftAvatar).toHaveStyle({ backgroundColor: 'var(--color-primary)' });
	});

	it("prompts the signed-in viewer to add their own perspective when they haven't shared one", async () => {
		mockRequest.mockImplementation((query: string) => {
			if (query.includes('ListUsers'))
				return Promise.resolve({
					users: [
						{ id: '1', username: 'me' },
						{ id: '2', username: 'Jamie Lee' },
						{ id: '3', username: 'Sam Rivera' },
					],
				});
			if (query.includes('ListPerspectivesByContent')) {
				return Promise.resolve({
					perspectives: {
						items: [
							{
								id: 'p2',
								userID: '2',
								user: { id: '2', username: 'Jamie Lee' },
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
								updatedAt: '2026-01-01T00:00:00Z',
							},
							{
								id: 'p3',
								userID: '3',
								user: { id: '3', username: 'Sam Rivera' },
								contentID: '10',
								quality: 6000,
								agreement: null,
								importance: null,
								confidence: null,
								like: 'THUMBS_UP',
								review: 'Fine',
								privacy: 'PUBLIC',
								description: null,
								primaryPerspectiveID: null,
								relatedPerspectiveIDs: null,
								customFields: null,
								feelings: null,
								createdAt: '2026-01-01T00:00:00Z',
								updatedAt: '2026-01-02T00:00:00Z',
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
			expect(screen.getByTestId('add-perspective-cta')).toBeInTheDocument();
		});
		expect(screen.getByRole('link', { name: 'Add yours' })).toHaveAttribute('href', '/content-library');
	});

	it('does not prompt when the viewer already has a perspective on this content', async () => {
		threeUserFixture();

		renderCompare({ contentId: '10', initialLeftId: null, initialRightId: null });

		await waitFor(() => {
			expect(screen.getByTestId('picker-left')).toBeInTheDocument();
		});
		expect(screen.queryByTestId('add-perspective-cta')).not.toBeInTheDocument();
	});

	it("links the content banner to the content's source URL when one exists", async () => {
		mockRequest.mockImplementation((query: string) => {
			if (query.includes('ListUsers')) return Promise.resolve({ users: [{ id: '1', username: 'me' }] });
			if (query.includes('ListPerspectivesByContent')) {
				return Promise.resolve({
					perspectives: {
						items: [
							{
								id: 'p1',
								userID: '1',
								user: { id: '1', username: 'me' },
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
			if (query.includes('GetContent'))
				return Promise.resolve({ contentByID: { ...contentResponse.contentByID, url: 'https://youtu.be/abc123' } });
			if (query.includes('query Me')) return Promise.resolve(meResponse);
			return Promise.resolve({});
		});

		renderCompare({ contentId: '10', initialLeftId: null, initialRightId: null });

		await waitFor(() => {
			expect(screen.getByText('Video')).toBeInTheDocument();
		});
		expect(screen.getByRole('link', { name: /Video/ })).toHaveAttribute('href', 'https://youtu.be/abc123');
	});

	// Regression test for the reported repro: a second perspective that rated
	// nothing at all (every dimension one-sided, no thumbs verdict) must read
	// as an empty state, not "0 similar · 0 diverge · 0 conflict" (which looks
	// like either perfect agreement or a broken page).
	it('shows a plain empty-state message and no sort toggle when the two perspectives share no rated dimensions', async () => {
		mockRequest.mockImplementation((query: string) => {
			if (query.includes('ListUsers'))
				return Promise.resolve({
					users: [
						{ id: '1', username: 'me' },
						{ id: '2', username: 'jjagent' },
					],
				});
			if (query.includes('ListPerspectivesByContent')) {
				return Promise.resolve({
					perspectives: {
						items: [
							{
								id: 'p1',
								userID: '1',
								user: { id: '1', username: 'me' },
								contentID: '10',
								quality: 8000,
								agreement: 7000,
								importance: 6000,
								confidence: 9000,
								like: 'THUMBS_UP',
								review: 'Great',
								privacy: 'PUBLIC',
								description: null,
								primaryPerspectiveID: null,
								relatedPerspectiveIDs: null,
								customFields: null,
								feelings: null,
								createdAt: '2026-01-01T00:00:00Z',
								updatedAt: '2026-01-01T00:00:00Z',
							},
							{
								id: 'p2',
								userID: '2',
								user: { id: '2', username: 'jjagent' },
								contentID: '10',
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
								createdAt: '2026-01-01T00:00:00Z',
								updatedAt: '2026-01-02T00:00:00Z',
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
			expect(screen.getByText("jjagent didn't rate this.")).toBeInTheDocument();
		});
		expect(screen.queryByText(/similar/)).not.toBeInTheDocument();
		expect(screen.queryByText(/diverge/)).not.toBeInTheDocument();
		expect(screen.queryByTestId('sort-toggle')).not.toBeInTheDocument();
		expect(screen.getByText('Only You gave a verdict')).toBeInTheDocument();
	});

	it('shows a retry action when the comparison fails to load', async () => {
		mockRequest.mockImplementation((query: string) => {
			if (query.includes('ListUsers')) return Promise.reject(new Error('network error'));
			if (query.includes('ListPerspectivesByContent')) return Promise.reject(new Error('network error'));
			if (query.includes('GetContent')) return Promise.resolve(contentResponse);
			if (query.includes('query Me')) return Promise.resolve(meResponse);
			return Promise.resolve({});
		});

		renderCompare({ contentId: '10', initialLeftId: null, initialRightId: null });

		await waitFor(() => {
			expect(screen.getByText('Failed to load this comparison.')).toBeInTheDocument();
		});
		expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
	});

	it('shows a retry action for the content banner when only the content query fails', async () => {
		mockRequest.mockImplementation((query: string) => {
			if (query.includes('ListUsers')) return Promise.resolve({ users: [{ id: '1', username: 'me' }] });
			if (query.includes('ListPerspectivesByContent')) {
				return Promise.resolve({
					perspectives: {
						items: [
							{
								id: 'p1',
								userID: '1',
								user: { id: '1', username: 'me' },
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
			if (query.includes('GetContent')) return Promise.reject(new Error('network error'));
			if (query.includes('query Me')) return Promise.resolve(meResponse);
			return Promise.resolve({});
		});

		renderCompare({ contentId: '10', initialLeftId: null, initialRightId: null });

		await waitFor(() => {
			expect(screen.getByText("Couldn't load this content's details.")).toBeInTheDocument();
		});
		expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
	});

	// #738: the picker counts perspectives, but Compare used to key everything by
	// userID. A content whose perspectives all belong to one person (or where one
	// person has several) therefore showed "3 perspectives" in the picker and then
	// "No other perspectives" on Compare. These states pin the per-perspective model.
	describe('perspective-level selection (#738)', () => {
		type Row = { id: string; userID: string; username: string; updatedAt: string };

		function row({ id, userID, username, updatedAt }: Row) {
			return {
				id,
				userID,
				user: { id: userID, username },
				contentID: '10',
				quality: 5000,
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
				updatedAt,
			};
		}

		function mockPerspectives(rows: Row[]) {
			mockRequest.mockImplementation((query: string) => {
				if (query.includes('ListPerspectivesByContent'))
					return Promise.resolve({ perspectives: { items: rows.map(row) } });
				if (query.includes('GetContent')) return Promise.resolve(contentResponse);
				if (query.includes('query Me')) return Promise.resolve(meResponse);
				return Promise.resolve({});
			});
		}

		const mineThree: Row[] = [
			{ id: 'a1', userID: '1', username: 'me', updatedAt: '2026-01-01T00:00:00Z' },
			{ id: 'a2', userID: '1', username: 'me', updatedAt: '2026-01-02T00:00:00Z' },
			{ id: 'a3', userID: '1', username: 'me', updatedAt: '2026-01-03T00:00:00Z' },
		];

		it('initial load, all 3 perspectives by the viewer: renders a comparison, not the empty state', async () => {
			mockPerspectives(mineThree);
			renderCompare({ contentId: '10', initialLeftId: null, initialRightId: null });

			await waitFor(() => {
				expect(screen.getByTestId('picker-left')).toBeInTheDocument();
			});
			expect(screen.queryByText(/no other perspectives/i)).not.toBeInTheDocument();
			// Left defaults to the viewer's latest perspective, right to their next latest.
			expect((screen.getByTestId('picker-left') as HTMLSelectElement).value).toBe('a3');
			expect((screen.getByTestId('picker-right') as HTMLSelectElement).value).toBe('a2');
			// One person with several rows: labels carry the date so they can be told apart.
			const rightLabels = Array.from((screen.getByTestId('picker-right') as HTMLSelectElement).options).map(
				(o) => o.textContent,
			);
			expect(rightLabels).toHaveLength(2);
			expect(rightLabels.every((l) => l?.startsWith('You · '))).toBe(true);
			expect(new Set(rightLabels).size).toBe(rightLabels.length);
		});

		it('initial load, mixed authors [A, A, B]: both pickers list distinct perspectives, no duplicate-key failure', async () => {
			mockPerspectives([
				...mineThree.slice(0, 2),
				{ id: 'b1', userID: '2', username: 'Jamie Lee', updatedAt: '2026-01-05T00:00:00Z' },
			]);
			renderCompare({ contentId: '10', initialLeftId: null, initialRightId: null });

			await waitFor(() => {
				expect(screen.getByTestId('picker-left')).toBeInTheDocument();
			});
			// Right defaults to the most recently updated perspective that isn't left.
			expect((screen.getByTestId('picker-right') as HTMLSelectElement).value).toBe('b1');
			const leftValues = Array.from((screen.getByTestId('picker-left') as HTMLSelectElement).options).map(
				(o) => o.value,
			);
			expect(leftValues).toEqual(expect.arrayContaining(['a1', 'a2']));
			expect(leftValues).not.toContain('b1');
		});

		it('after changing the left side, navigates with that perspective id and keeps the right side', async () => {
			mockPerspectives(mineThree);
			renderCompare({ contentId: '10', initialLeftId: null, initialRightId: null });

			await waitFor(() => {
				expect(screen.getByTestId('picker-left')).toBeInTheDocument();
			});
			vi.mocked(goto).mockClear();
			await fireEvent.change(screen.getByTestId('picker-left'), { target: { value: 'a1' } });

			expect(vi.mocked(goto)).toHaveBeenCalledTimes(1);
			const [calledUrl] = vi.mocked(goto).mock.calls[0];
			expect(calledUrl).toContain('left=a1');
			expect(calledUrl).toContain('right=a2');
		});

		it('after changing the right side, navigates with that perspective id and keeps the left side', async () => {
			mockPerspectives(mineThree);
			renderCompare({ contentId: '10', initialLeftId: null, initialRightId: null });

			await waitFor(() => {
				expect(screen.getByTestId('picker-right')).toBeInTheDocument();
			});
			vi.mocked(goto).mockClear();
			await fireEvent.change(screen.getByTestId('picker-right'), { target: { value: 'a1' } });

			const [calledUrl] = vi.mocked(goto).mock.calls[0];
			expect(calledUrl).toContain('left=a3');
			expect(calledUrl).toContain('right=a1');
		});

		it('a legacy user-id URL param resolves to that user latest perspective', async () => {
			mockPerspectives([
				...mineThree,
				{ id: 'b1', userID: '2', username: 'Jamie Lee', updatedAt: '2026-01-05T00:00:00Z' },
			]);
			renderCompare({ contentId: '10', initialLeftId: '1', initialRightId: '2' });

			await waitFor(() => {
				expect(screen.getByTestId('picker-left')).toBeInTheDocument();
			});
			expect((screen.getByTestId('picker-left') as HTMLSelectElement).value).toBe('a3');
			expect((screen.getByTestId('picker-right') as HTMLSelectElement).value).toBe('b1');
		});

		it('an unknown URL id falls back to the computed defaults', async () => {
			mockPerspectives(mineThree);
			renderCompare({ contentId: '10', initialLeftId: 'gone', initialRightId: 'gone' });

			await waitFor(() => {
				expect(screen.getByTestId('picker-left')).toBeInTheDocument();
			});
			expect((screen.getByTestId('picker-left') as HTMLSelectElement).value).toBe('a3');
			expect((screen.getByTestId('picker-right') as HTMLSelectElement).value).toBe('a2');
		});

		it('empty state: no perspectives on the content shows the no-one-has-shared message', async () => {
			mockPerspectives([]);
			renderCompare({ contentId: '10', initialLeftId: null, initialRightId: null });

			expect(await screen.findByText(/no one has shared a perspective/i)).toBeInTheDocument();
			expect(screen.queryByTestId('picker-left')).not.toBeInTheDocument();
		});
	});

	// Privacy markers: "Private" is the only labelled state (public has no
	// marker). Option labels are text (native <select>), and each Take column
	// header carries the lock icon plus the visible word, so the state is never
	// conveyed by colour alone.
	describe('privacy markers', () => {
		type PrivacyRow = { id: string; userID: string; username: string; privacy: string; updatedAt: string };

		function privacyRow({ id, userID, username, privacy, updatedAt }: PrivacyRow) {
			return {
				id,
				userID,
				user: { id: userID, username },
				contentID: '10',
				quality: 5000,
				agreement: null,
				importance: null,
				confidence: null,
				like: null,
				review: 'x',
				privacy,
				description: null,
				primaryPerspectiveID: null,
				relatedPerspectiveIDs: null,
				customFields: null,
				feelings: null,
				createdAt: '2026-01-01T00:00:00Z',
				updatedAt,
			};
		}

		function mockPrivacyRows(rows: PrivacyRow[]) {
			mockRequest.mockImplementation((query: string) => {
				if (query.includes('ListPerspectivesByContent'))
					return Promise.resolve({ perspectives: { items: rows.map(privacyRow) } });
				if (query.includes('GetContent')) return Promise.resolve(contentResponse);
				if (query.includes('query Me')) return Promise.resolve(meResponse);
				return Promise.resolve({});
			});
		}

		function optionTexts(testId: string): (string | null)[] {
			return Array.from((screen.getByTestId(testId) as HTMLSelectElement).options).map((o) => o.textContent);
		}

		it('public only: no Private marker on the cards or in any option label', async () => {
			mockPrivacyRows([
				{ id: 'p1', userID: '1', username: 'me', privacy: 'PUBLIC', updatedAt: '2026-01-02T12:00:00Z' },
				{ id: 'p2', userID: '2', username: 'Jamie Lee', privacy: 'PUBLIC', updatedAt: '2026-01-01T12:00:00Z' },
			]);
			renderCompare({ contentId: '10', initialLeftId: null, initialRightId: null });

			await waitFor(() => {
				expect(screen.getByTestId('picker-left')).toBeInTheDocument();
			});
			expect(screen.queryByTestId('take-private')).not.toBeInTheDocument();
			expect(screen.queryByText('Private')).not.toBeInTheDocument();
			expect([...optionTexts('picker-left'), ...optionTexts('picker-right')].some((t) => t?.includes('Private'))).toBe(
				false,
			);
		});

		it('private only: both cards show the Private marker and both option labels carry it', async () => {
			mockPrivacyRows([
				{ id: 'p1', userID: '1', username: 'me', privacy: 'PRIVATE', updatedAt: '2026-01-02T12:00:00Z' },
				{ id: 'p2', userID: '2', username: 'Jamie Lee', privacy: 'PRIVATE', updatedAt: '2026-01-01T12:00:00Z' },
			]);
			renderCompare({ contentId: '10', initialLeftId: null, initialRightId: null });

			await waitFor(() => {
				expect(screen.getByTestId('picker-left')).toBeInTheDocument();
			});
			expect(screen.getAllByTestId('take-private')).toHaveLength(2);
			// Left is the viewer's own take, right the other author's; each select
			// offers only the opposite side's row, and both carry the marker.
			expect(optionTexts('picker-left')).toEqual(['You · Private']);
			expect(optionTexts('picker-right')).toEqual(['Jamie Lee · Private']);
		});

		it('one author, one public and one private: labels differ, both are shown, the marker sits on the private take only', async () => {
			mockPrivacyRows([
				{ id: 'a1', userID: '1', username: 'me', privacy: 'PRIVATE', updatedAt: '2026-01-02T12:00:00Z' },
				{ id: 'a2', userID: '1', username: 'me', privacy: 'PUBLIC', updatedAt: '2026-01-01T12:00:00Z' },
			]);
			renderCompare({ contentId: '10', initialLeftId: null, initialRightId: null });

			await waitFor(() => {
				expect(screen.getByTestId('picker-left')).toBeInTheDocument();
			});
			// Left defaults to the latest (the private one), right to the public one.
			expect((screen.getByTestId('picker-left') as HTMLSelectElement).value).toBe('a1');
			expect((screen.getByTestId('picker-right') as HTMLSelectElement).value).toBe('a2');

			const privateLabel = optionTexts('picker-left')[0] ?? '';
			const publicLabel = optionTexts('picker-right')[0] ?? '';
			expect(privateLabel).toContain('Private');
			expect(publicLabel).not.toContain('Private');
			expect(privateLabel).not.toBe(publicLabel);
			expect(privateLabel.startsWith('You · ')).toBe(true);
			expect(publicLabel.startsWith('You · ')).toBe(true);

			// Only the private take's column header carries the marker.
			expect(screen.getAllByTestId('take-private')).toHaveLength(1);
			expect(screen.getByTestId('take-private')).toHaveTextContent('Private');
		});
	});
});
