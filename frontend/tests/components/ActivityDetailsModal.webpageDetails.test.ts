import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/svelte';
import ActivityDetailsModal from '$lib/components/ActivityDetailsModal.svelte';
import TestWrapper from '../helpers/TestWrapper.svelte';
import { makeClient } from '../helpers/queryBudget';
import { formatDateTime } from '$lib/utils/formatting';
import { GET_CONTENT_DETAILS } from '$lib/queries/content';
import { graphqlRequest } from '$lib/queries/client';

// A grid row for a webpage has the shaped list payload only: no `response`. The modal must load the
// details itself. These tests use a REAL QueryClient, so they also prove how many details requests a
// modal open costs.

vi.mock('$lib/queries/client', () => ({ graphqlRequest: vi.fn() }));

const authState = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock('$lib/auth/useAuthState', () => ({
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
const request = vi.mocked(graphqlRequest);

/** A list row: the shaped payload, no `response` (LIST_CONTENT never selects it). */
function listRow(overrides: Record<string, unknown> = {}) {
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
		description: null,
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
		...overrides,
	} as never;
}

/** The details row (GET_CONTENT_DETAILS): the same fields plus `response` (WebPageMeta). */
function detailsRow(response: Record<string, unknown>) {
	return { ...listRow(), response } as never;
}

const loadedResponse = (description: string | null) => ({
	description,
	fetch: { status: 'OK', httpStatus: 200, at: FETCHED_AT },
	webPageRoles: ['BLOG_POST'],
});

/** Answer the details request; every other request (aggregates) gets an empty result. */
function answerDetails(impl: () => Promise<unknown>) {
	request.mockImplementation((doc: unknown) => {
		if (doc === GET_CONTENT_DETAILS) return impl() as never;
		return Promise.resolve({ contentByID: null }) as never;
	});
}

function detailsCalls(): number {
	return request.mock.calls.filter(([doc]) => doc === GET_CONTENT_DETAILS).length;
}

function mount(content: unknown, client = makeClient()) {
	return render(TestWrapper, {
		props: {
			queryClient: client,
			component: ActivityDetailsModal,
			props: { content, open: true, onClose: vi.fn() },
		},
	});
}

function tileValue(label: string): string {
	const tile = screen.getByText(label, { selector: 'div' }).parentElement;
	return tile?.lastElementChild?.textContent?.trim() ?? '';
}

beforeEach(() => {
	vi.clearAllMocks();
	request.mockReset();
});

describe('webpage modal opened from a list row with no response', () => {
	it('loading: the Fetched tile is a placeholder and the description is not "no description" yet', async () => {
		answerDetails(() => new Promise(() => {}));
		mount(listRow());
		await waitFor(() => expect(detailsCalls()).toBe(1));
		expect(tileValue('Fetched')).toBe('…');
		expect(screen.getByRole('status').textContent).toMatch(/loading/i);
		expect(screen.queryByText('This page has no description.')).toBeNull();
	});

	it('loaded with a description: the description and the fetch time show', async () => {
		answerDetails(async () => ({ contentByID: detailsRow(loadedResponse('A summary from the page.')) }));
		mount(listRow());
		expect(await screen.findByText('A summary from the page.')).toBeInTheDocument();
		expect(tileValue('Fetched')).toBe(formatDateTime(FETCHED_AT));
	});

	it('loaded without a description: only then does the no-description line show', async () => {
		answerDetails(async () => ({ contentByID: detailsRow(loadedResponse(null)) }));
		mount(listRow());
		expect(await screen.findByText('This page has no description.')).toBeInTheDocument();
	});

	it('load error: the modal stays usable, the Fetched tile is a dash, and no-description is not claimed', async () => {
		answerDetails(() => Promise.reject(new Error('network down')));
		mount(listRow());
		expect(await screen.findByText(/couldn.t load/i)).toBeInTheDocument();
		expect(tileValue('Fetched')).toBe('—');
		expect(screen.queryByText('This page has no description.')).toBeNull();
		// Still usable: the dialog title and its close control are present.
		expect(screen.getByText('Webpage')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
	});
});

describe('webpage modal opened from a row that already has response', () => {
	it('makes no details request', async () => {
		answerDetails(async () => ({ contentByID: null }));
		mount(listRow({ response: loadedResponse('Already loaded.') }));
		expect(await screen.findByText('Already loaded.')).toBeInTheDocument();
		expect(detailsCalls()).toBe(0);
	});
});

describe('query budget: details for one page', () => {
	it('opening the modal costs exactly one details request, and re-opening within staleTime costs none', async () => {
		answerDetails(async () => ({ contentByID: detailsRow(loadedResponse('Cached summary.')) }));
		const client = makeClient();

		mount(listRow(), client);
		expect(await screen.findByText('Cached summary.')).toBeInTheDocument();
		expect(detailsCalls()).toBe(1);

		cleanup();
		mount(listRow(), client);
		expect(await screen.findByText('Cached summary.')).toBeInTheDocument();
		expect(detailsCalls()).toBe(1);
	});
});
