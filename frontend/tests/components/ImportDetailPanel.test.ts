import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ImportDetailPanel from '$lib/components/imports/ImportDetailPanel.svelte';
import type { ImportItem, ImportItemDetails } from '$lib/queries/imports';

const mocks = vi.hoisted(() => ({
	state: {
		isPending: false,
		isError: false,
		data: undefined as { importItemDetails: ImportItemDetails | null } | undefined,
	},
	lastId: '',
}));

vi.mock('$lib/queries/imports/useImportItemDetails', () => ({
	useImportItemDetails: vi.fn((id: () => string) => ({
		get isPending() {
			mocks.lastId = id();
			return mocks.state.isPending;
		},
		get isError() {
			return mocks.state.isError;
		},
		get data() {
			return mocks.state.data;
		},
	})),
}));

const now = new Date('2026-10-27T12:00:00Z');

function item(overrides: Partial<ImportItem> = {}): ImportItem {
	return {
		id: '5',
		sourceId: '10',
		destinationType: 'YOUTUBE_VIDEO',
		kind: 'VIDEO',
		externalId: 'abc',
		url: 'https://www.youtube.com/watch?v=abc',
		title: 'A Voice from Hell, Part 2',
		summary: null,
		publishedAt: '2026-10-25T12:00:00Z',
		durationSeconds: 1710,
		viewCount: 18_000,
		likeCount: null,
		commentCount: 32,
		rating: null,
		ratingCount: null,
		ratingSource: null,
		chapterCount: 0,
		hasCaptions: false,
		thumbnailUrl: null,
		position: 3,
		statsFetchedAt: '2026-10-27T12:00:00Z',
		inLibrary: false,
		contentId: null,
		importStatus: null,
		importError: null,
		importedAt: null,
		...overrides,
	};
}

function details(overrides: Partial<ImportItemDetails> = {}): ImportItemDetails {
	return {
		item: item(),
		description: 'For details about this sermon, click here.',
		tags: ['John MacArthur', 'Bible'],
		chapters: [
			{ startSeconds: 0, title: 'Intro' },
			{ startSeconds: 90, title: 'The rich man' },
		],
		links: ['gty.org'],
		people: [],
		genres: [],
		language: 'en',
		...overrides,
	};
}

describe('ImportDetailPanel', () => {
	beforeEach(() => {
		mocks.state = { isPending: false, isError: false, data: { importItemDetails: details() } };
	});

	it('asks for a row when nothing is focused, and loads nothing', () => {
		render(ImportDetailPanel, { props: { item: null, sourceTitle: '', now } });
		expect(screen.getByText(/Click a row to read its description/)).toBeInTheDocument();
		expect(mocks.lastId).toBe('');
	});

	it('shows the decision numbers, with hidden likes as "hidden", and loads that row', () => {
		render(ImportDetailPanel, { props: { item: item(), sourceTitle: 'Grace to You', now } });
		expect(mocks.lastId).toBe('5');
		expect(screen.getByRole('heading', { name: 'A Voice from Hell, Part 2' })).toBeInTheDocument();
		expect(screen.getByText(/Grace to You · Video · becomes YouTube Video/)).toBeInTheDocument();
		expect(screen.getByText('28:30')).toBeInTheDocument();
		expect(screen.getByText('18.0 K')).toBeInTheDocument();
		expect(screen.getByText('hidden')).toBeInTheDocument();
		expect(screen.getByText(/2 days ago/)).toBeInTheDocument();
		expect(screen.getByTestId('import-detail-status')).toHaveTextContent('Not imported');
		expect(screen.getByRole('link', { name: /Open source/ })).toHaveAttribute(
			'href',
			'https://www.youtube.com/watch?v=abc',
		);
	});

	it('shows the description, chapters, tags and link domains', () => {
		render(ImportDetailPanel, { props: { item: item(), sourceTitle: 'Grace to You', now } });
		expect(screen.getByTestId('import-detail-description')).toHaveTextContent('For details about this sermon');
		expect(screen.getByText('Chapters · 2')).toBeInTheDocument();
		expect(screen.getByText('The rich man')).toBeInTheDocument();
		expect(screen.getByText('1:30')).toBeInTheDocument();
		expect(screen.getByText('John MacArthur')).toBeInTheDocument();
		expect(screen.getByText('Links to gty.org')).toBeInTheDocument();
	});

	it('collapses a long description behind Show all', async () => {
		mocks.state.data = { importItemDetails: details({ description: 'x '.repeat(400) }) };
		render(ImportDetailPanel, { props: { item: item(), sourceTitle: 'Grace to You', now } });
		const toggle = screen.getByRole('button', { name: 'Show all' });
		expect(screen.getByTestId('import-detail-description')).toHaveClass('max-h-56');
		await fireEvent.click(toggle);
		expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument();
		expect(screen.getByTestId('import-detail-description')).not.toHaveClass('max-h-56');
	});

	it('shows a movie rating with its source, people and genres, and mutes a small sample', () => {
		const film = item({
			destinationType: 'MOVIE',
			kind: 'MOVIE',
			title: 'Following',
			viewCount: null,
			commentCount: null,
			rating: 6,
			ratingCount: 12,
			ratingSource: 'Metacritic',
		});
		mocks.state.data = {
			importItemDetails: details({
				item: film,
				chapters: [],
				tags: [],
				people: [{ name: 'Christopher Nolan', role: 'Director' }],
				genres: ['Neo-noir', 'Thriller'],
			}),
		};
		render(ImportDetailPanel, { props: { item: film, sourceTitle: 'Christopher Nolan', now } });
		expect(screen.getByText('Metacritic rating')).toBeInTheDocument();
		expect(screen.getByText('6.0 / 10')).toHaveClass('text-muted-foreground');
		expect(screen.getByText(/Few ratings so far/)).toBeInTheDocument();
		expect(screen.queryByText('Views')).toBeNull();
		expect(screen.getByText('Christopher Nolan (Director)')).toBeInTheDocument();
		expect(screen.getByText('Neo-noir, Thriller')).toBeInTheDocument();
	});

	it('links an imported row to its content and shows a failure reason', () => {
		const { unmount } = render(ImportDetailPanel, {
			props: { item: item({ inLibrary: true, importStatus: 'IMPORTED', contentId: '12' }), sourceTitle: 's', now },
		});
		expect(screen.getByRole('link', { name: 'View in Activity' })).toHaveAttribute('href', '/?open=12');
		unmount();
		render(ImportDetailPanel, {
			props: {
				item: item({ importStatus: 'FAILED', importError: 'The source API refused the request.' }),
				sourceTitle: 's',
				now,
			},
		});
		expect(screen.getByTestId('import-detail-status')).toHaveTextContent('Failed');
		expect(screen.getByText('The source API refused the request.')).toBeInTheDocument();
	});

	it('handles loading and error states', () => {
		mocks.state = { isPending: true, isError: false, data: undefined };
		const { unmount } = render(ImportDetailPanel, { props: { item: item(), sourceTitle: 's', now } });
		expect(screen.getByText('Loading…')).toBeInTheDocument();
		unmount();
		mocks.state = { isPending: false, isError: true, data: undefined };
		render(ImportDetailPanel, { props: { item: item(), sourceTitle: 's', now } });
		expect(screen.getByText(/Couldn't load the description/)).toBeInTheDocument();
	});
});
