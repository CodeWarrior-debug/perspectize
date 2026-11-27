import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import ContentDetailsModal from '#lib/components/ContentDetailsModal.svelte';
import TestWrapper from '../helpers/TestWrapper.svelte';
import { makeClient } from '../helpers/queryBudget';
import { graphqlRequest } from '#lib/queries/client.js';
import { LIST_WEBSITE_PAGES } from '#lib/queries/content/index.js';

// The details modal's per-type facts come from the content-type registry: the title label, whether the
// row is a video (views, likes, duration, thumbnail) and whether "Update source data" is offered.

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

const HOUR_MS = 60 * 60 * 1000;

function row(overrides: Record<string, unknown> = {}) {
	return {
		id: '1',
		name: 'A row',
		url: 'https://example.com/x',
		channelTitle: 'Channel',
		contentType: 'YOUTUBE_VIDEO',
		primaryCategory: null,
		viewCount: 1200,
		likeCount: 80,
		length: 300,
		lengthUnits: 'SECONDS',
		publishedAt: '2026-01-01T12:00:00Z',
		createdAt: '2026-02-01T12:00:00Z',
		// Stale on purpose, so the refresh button is enabled wherever it is offered.
		updatedAt: new Date(Date.now() - 30 * 24 * HOUR_MS).toISOString(),
		description: null,
		tags: null,
		...overrides,
	} as never;
}

function mount(content: unknown) {
	return render(TestWrapper, {
		props: {
			queryClient: makeClient(),
			component: ContentDetailsModal,
			props: { content, open: true, onClose: vi.fn() },
		},
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	request.mockReset();
	request.mockImplementation(
		(doc: unknown) =>
			Promise.resolve(
				doc === LIST_WEBSITE_PAGES ? { content: { items: [], totalCount: 0 } } : { contentByID: null },
			) as never,
	);
	cleanup();
});

describe('details modal: a website', () => {
	const website = () =>
		row({
			id: '500',
			name: 'Jordan Journey',
			url: 'https://jordans-journey.com/',
			contentType: 'WEBSITE',
			viewCount: null,
			likeCount: null,
			length: null,
			lengthUnits: null,
		});

	it('is titled Website, not YouTube Video', () => {
		mount(website());
		expect(screen.getByText('Website')).toBeTruthy();
		expect(screen.queryByText('YouTube Video')).toBeNull();
	});

	it('shows no YouTube tiles (views, likes, duration)', () => {
		mount(website());
		expect(screen.queryByText('Views')).toBeNull();
		expect(screen.queryByText('Likes')).toBeNull();
		expect(screen.queryByText('Duration')).toBeNull();
	});

	it('does not offer "Update source data", even when stale', () => {
		mount(website());
		expect(screen.queryByRole('button', { name: 'Update source data' })).toBeNull();
	});
});

describe('details modal: a claim', () => {
	const claim = () =>
		row({
			id: '9',
			name: 'A claim',
			url: null,
			channelTitle: null,
			contentType: 'CLAIM',
			viewCount: null,
			likeCount: null,
			length: null,
			lengthUnits: null,
		});

	it('is titled Claim and offers no refresh, even when stale', () => {
		mount(claim());
		expect(screen.getByText('Claim')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Update source data' })).toBeNull();
	});

	it('shows no YouTube tiles', () => {
		mount(claim());
		expect(screen.queryByText('Views')).toBeNull();
	});
});

describe('details modal: a YouTube video', () => {
	it('keeps its YouTube tiles and the refresh button', () => {
		mount(row());
		expect(screen.getByText('Views')).toBeTruthy();
		expect(screen.getByText('Duration')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Update source data' })).toBeTruthy();
	});
});

describe('details modal: an unknown type', () => {
	it('gets a neutral label and no YouTube tiles or refresh', () => {
		mount(row({ id: '3', name: 'Mystery', contentType: 'SOMETHING_NEW' }));
		expect(screen.getByText('Something_new')).toBeTruthy();
		expect(screen.queryByText('Views')).toBeNull();
		expect(screen.queryByRole('button', { name: 'Update source data' })).toBeNull();
	});
});
