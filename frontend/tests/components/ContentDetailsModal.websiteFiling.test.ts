import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/svelte';
import ContentDetailsModal from '#lib/components/ContentDetailsModal.svelte';
import TestWrapper from '../helpers/TestWrapper.svelte';
import { makeClient } from '../helpers/queryBudget';
import { GET_CONTENT_DETAILS, LIST_WEBSITE_PAGES } from '#lib/queries/content/index.js';
import { graphqlRequest } from '#lib/queries/client.js';
import { libraryContentHref } from '#lib/utils/contentLinks.js';

// Website filing on the details modal: "Part of <site>" on a page, "Pages in this site" on a website.
// A REAL QueryClient, so the request counts below are what the modal actually costs.

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

const request = vi.mocked(graphqlRequest);

const SITE = { id: '500', name: 'Jordan Journey', url: 'https://jordans-journey.com/' };

/** A list row (no parentContent: LIST_CONTENT never selects it). */
function listRow(overrides: Record<string, unknown> = {}) {
	return {
		id: '77',
		name: 'Why the blog post matters',
		url: 'https://jordans-journey.com/why',
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
		description: null,
		tags: null,
		webPage: {
			siteName: 'Jordan Journey',
			domain: 'jordans-journey.com',
			imageUrl: null,
			faviconUrl: null,
			publishedAt: null,
			author: null,
			webPageRoles: ['BLOG_POST'],
		},
		...overrides,
	} as never;
}

function websiteRow() {
	return listRow({
		id: '500',
		name: 'Jordan Journey',
		url: 'https://jordans-journey.com/',
		contentType: 'WEBSITE',
		webPage: null,
	});
}

const pagesResponse = (items: unknown[], totalCount = items.length) => ({
	content: { items, totalCount },
});

const page = (id: string, name: string, publishedAt: string | null, roles: string[] | null) => ({
	id,
	name,
	url: `https://jordans-journey.com/${id}`,
	contentType: 'WEB_PAGE',
	publishedAt,
	webPage: roles === null ? null : { webPageRoles: roles },
});

/** Answers the details and pages requests; anything else (aggregates) gets an empty result. */
function answer(opts: { details?: unknown; pages?: unknown } = {}) {
	request.mockImplementation((doc: unknown) => {
		if (doc === GET_CONTENT_DETAILS) return Promise.resolve(opts.details ?? { contentByID: null }) as never;
		if (doc === LIST_WEBSITE_PAGES) return Promise.resolve(opts.pages ?? pagesResponse([])) as never;
		return Promise.resolve({ contentByID: null }) as never;
	});
}

function callsFor(doc: unknown): number {
	return request.mock.calls.filter(([d]) => d === doc).length;
}

function mount(content: unknown, client = makeClient()) {
	return render(TestWrapper, {
		props: {
			queryClient: client,
			component: ContentDetailsModal,
			props: { content, open: true, onClose: vi.fn() },
		},
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	request.mockReset();
	cleanup();
});

describe('a page filed under a website', () => {
	it('shows "Part of <site>" linking to that website, from the details query', async () => {
		answer({
			details: { contentByID: { response: { description: null }, parentContent: SITE, parentContentID: 500 } },
		});
		mount(listRow());

		const link = await screen.findByRole('link', { name: SITE.name });
		expect(link.getAttribute('href')).toBe(libraryContentHref('500'));
		expect(screen.getByText('Part of')).toBeTruthy();
	});

	it('shows nothing about a site when the page is not filed under one', async () => {
		answer({ details: { contentByID: { response: { description: null }, parentContent: null } } });
		mount(listRow());

		await waitFor(() => expect(callsFor(GET_CONTENT_DETAILS)).toBe(1));
		expect(screen.queryByText('Part of')).toBeNull();
	});

	it('a page opened with its details already loaded uses the parent on the row', async () => {
		answer();
		mount(listRow({ response: { description: null }, parentContent: SITE }));

		expect(await screen.findByRole('link', { name: SITE.name })).toBeTruthy();
		expect(callsFor(GET_CONTENT_DETAILS)).toBe(0);
	});

	it('never shows the "Pages in this site" list', async () => {
		answer({ details: { contentByID: { response: { description: null }, parentContent: SITE } } });
		mount(listRow());

		await screen.findByRole('link', { name: SITE.name });
		expect(screen.queryByText('Pages in this site')).toBeNull();
		expect(callsFor(LIST_WEBSITE_PAGES)).toBe(0);
	});
});

describe('a website', () => {
	it('lists its pages with title, date and role, and the total', async () => {
		answer({
			pages: pagesResponse(
				[page('1', 'Newest post', '2026-10-02T12:00:00Z', ['BLOG_POST']), page('2', 'Older post', null, [])],
				120,
			),
		});
		mount(websiteRow());

		expect(await screen.findByRole('link', { name: 'Newest post' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Older post' })).toBeTruthy();
		expect(screen.getByText('Blog post')).toBeTruthy();
		expect(screen.getByText('120 pages in total')).toBeTruthy();
	});

	it('says so when no pages are filed under it yet', async () => {
		answer({ pages: pagesResponse([]) });
		mount(websiteRow());

		expect(await screen.findByText('No pages saved from this site yet')).toBeTruthy();
		expect(screen.queryByText(/in total/)).toBeNull();
	});

	it('does not show the "Part of" line', async () => {
		answer({ pages: pagesResponse([page('1', 'A post', null, null)]) });
		mount(websiteRow());

		await screen.findByRole('link', { name: 'A post' });
		expect(screen.queryByText('Part of')).toBeNull();
	});

	it('costs one pages request per opened website, however many times it renders', async () => {
		answer({ pages: pagesResponse([page('1', 'A post', null, null)]) });
		const client = makeClient();
		mount(websiteRow(), client);
		await screen.findByRole('link', { name: 'A post' });
		cleanup();
		mount(websiteRow(), client);
		await screen.findByRole('link', { name: 'A post' });

		expect(callsFor(LIST_WEBSITE_PAGES)).toBe(1);
	});

	it('a page row makes no pages request', async () => {
		answer();
		mount(listRow());

		await waitFor(() => expect(callsFor(GET_CONTENT_DETAILS)).toBe(1));
		expect(callsFor(LIST_WEBSITE_PAGES)).toBe(0);
	});
});
