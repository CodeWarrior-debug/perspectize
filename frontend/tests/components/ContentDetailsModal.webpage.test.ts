import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ContentDetailsModal from '#lib/components/ContentDetailsModal.svelte';
import { formatDateTime } from '#lib/utils/formatting.js';
import { warmUpRender } from '../helpers/warmUp';

// Same mock shape as ContentDetailsModal.test.ts: the modal reads mutation and query hooks.
const mocks = vi.hoisted(() => ({
	mockMutate: vi.fn(),
	mockMutationState: { mutate: null as any, isPending: false },
	mockQueryState: { isLoading: false, data: undefined as any },
}));

vi.mock('@tanstack/svelte-query', () => ({
	createMutation: vi.fn((optionsFn: () => any) => {
		optionsFn();
		mocks.mockMutationState.mutate = mocks.mockMutate;
		return mocks.mockMutationState;
	}),
	createQuery: vi.fn((optionsFn: () => any) => {
		optionsFn();
		return mocks.mockQueryState;
	}),
	useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn(), setQueriesData: vi.fn() })),
}));

vi.mock('svelte-sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('#lib/queries/client.js', () => ({ graphqlRequest: vi.fn() }));

const authState = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock('#lib/auth/useAuthState.js', () => ({
	useAuthState: () => ({
		get isLoaded() {
			return true;
		},
		get userId() {
			return authState.userId;
		},
	}),
}));

const FETCHED_AT = '2026-11-10T12:30:00Z';

// Typed loosely: the fixture uses plain strings for the content type and roles.
function webPageContent(overrides: Record<string, unknown> = {}) {
	return {
		id: '77',
		name: 'Why the blog post matters',
		url: 'https://www.example.com/post',
		channelTitle: null,
		contentType: 'WEB_PAGE',
		primaryCategory: null,
		viewCount: null,
		likeCount: null,
		length: null,
		lengthUnits: null,
		publishedAt: null,
		createdAt: '2026-11-01T12:00:00Z',
		updatedAt: '2026-11-02T00:00:00Z',
		description: 'A short summary of the post.',
		tags: null,
		webPage: {
			siteName: 'Example Blog',
			domain: 'example.com',
			imageUrl: null,
			faviconUrl: null,
			publishedAt: null,
			author: null,
			webPageRoles: ['BLOG_POST'],
		},
		response: { fetch: { status: 'OK', httpStatus: 200, at: FETCHED_AT } },
		...overrides,
	} as never;
}

function tileValue(label: string): string {
	const tile = screen.getByText(label, { selector: 'div' }).parentElement;
	return tile?.lastElementChild?.textContent?.trim() ?? '';
}

// Pay the component's first-render cost before any test, not inside the first
// one: under full-suite load it alone can pass the 5 s testTimeout (#728).
warmUpRender(ContentDetailsModal, { content: webPageContent(), open: true, onClose: () => {} });

describe('ContentDetailsModal: webpage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.mockQueryState.data = undefined;
	});

	it('titles the dialog Webpage and shows the site under the title', () => {
		render(ContentDetailsModal, { props: { content: webPageContent(), open: true, onClose: vi.fn() } });
		expect(screen.getByText('Webpage')).toBeInTheDocument();
		// The site shows under the title and again in the Site tile.
		expect(screen.getAllByText('Example Blog').length).toBeGreaterThan(0);
	});

	it('shows the page description when it has one', () => {
		render(ContentDetailsModal, { props: { content: webPageContent(), open: true, onClose: vi.fn() } });
		expect(screen.getByText('A short summary of the post.')).toBeInTheDocument();
	});

	it('shows the no-description line when the page has none', () => {
		render(ContentDetailsModal, {
			props: { content: webPageContent({ description: null }), open: true, onClose: vi.fn() },
		});
		expect(screen.getByText('This page has no description.')).toBeInTheDocument();
	});

	it('shows the Type tile and the Fetched tile with date and time', () => {
		render(ContentDetailsModal, { props: { content: webPageContent(), open: true, onClose: vi.fn() } });
		expect(tileValue('Type')).toBe('Blog post');
		expect(tileValue('Fetched')).toBe(formatDateTime(FETCHED_AT));
	});

	it('has no related-content section and no source-data refresh for a webpage', () => {
		render(ContentDetailsModal, { props: { content: webPageContent(), open: true, onClose: vi.fn() } });
		expect(screen.queryByText(/related/i)).toBeNull();
		expect(screen.queryByRole('button', { name: /update source data/i })).toBeNull();
	});

	it('does not show the YouTube Views or Likes tiles', () => {
		render(ContentDetailsModal, { props: { content: webPageContent(), open: true, onClose: vi.fn() } });
		expect(screen.queryByText('Views', { selector: 'div' })).toBeNull();
		expect(screen.queryByText('Likes', { selector: 'div' })).toBeNull();
	});
});
