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

function item(overrides: Partial<ImportItem> = {}): ImportItem {
	return {
		id: '5',
		sourceId: '10',
		destinationType: 'YOUTUBE_VIDEO',
		externalId: 'abc',
		url: 'https://www.youtube.com/watch?v=abc',
		title: 'A Voice from Hell, Part 2',
		facts: {
			kind: 'VIDEO',
			publishedAt: '2026-10-25T12:00:00Z',
			durationSeconds: 1710,
			viewCount: 18_000,
			commentCount: 32,
			chapterCount: 0,
			hasCaptions: false,
		},
		position: 3,
		excluded: false,
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
		render(ImportDetailPanel, { props: { item: null, sourceTitle: '' } });
		expect(screen.getByText(/Click a row to read its description/)).toBeInTheDocument();
		expect(mocks.lastId).toBe('');
	});

	it('shows every fact under its prettified key, leaves out unknown ones, and loads that row', () => {
		render(ImportDetailPanel, { props: { item: item(), sourceTitle: 'Grace to You' } });
		expect(mocks.lastId).toBe('5');
		expect(screen.getByRole('heading', { name: 'A Voice from Hell, Part 2' })).toBeInTheDocument();
		expect(screen.getByText('Grace to You · becomes YouTube Video')).toBeInTheDocument();
		expect(screen.getByText('Duration seconds')).toBeInTheDocument();
		expect(screen.getByText('28:30')).toBeInTheDocument();
		expect(screen.getByText('View count')).toBeInTheDocument();
		expect(screen.getByText('18.0 K').parentElement, 'exact figure on hover').toHaveAttribute('title', '18,000');
		expect(screen.getByText('Video')).toBeInTheDocument();
		expect(screen.getByText('Oct 25, 2026')).toBeInTheDocument();
		expect(screen.queryByText('Like count'), 'hidden likes are absent, not 0').toBeNull();
		expect(screen.getByTestId('import-detail-status')).toHaveTextContent('Not imported');
		expect(screen.getByRole('link', { name: /Open source/ })).toHaveAttribute(
			'href',
			'https://www.youtube.com/watch?v=abc',
		);
	});

	it('shows the description, chapters, tags and link domains', () => {
		render(ImportDetailPanel, { props: { item: item(), sourceTitle: 'Grace to You' } });
		expect(screen.getByTestId('import-detail-description')).toHaveTextContent('For details about this sermon');
		expect(screen.getByText('Chapters · 2')).toBeInTheDocument();
		expect(screen.getByText('The rich man')).toBeInTheDocument();
		expect(screen.getByText('1:30')).toBeInTheDocument();
		expect(screen.getByText('John MacArthur')).toBeInTheDocument();
		expect(screen.getByText('Links to gty.org')).toBeInTheDocument();
	});

	it('collapses a long description behind Show all', async () => {
		mocks.state.data = { importItemDetails: details({ description: 'x '.repeat(400) }) };
		render(ImportDetailPanel, { props: { item: item(), sourceTitle: 'Grace to You' } });
		const toggle = screen.getByRole('button', { name: 'Show all' });
		expect(screen.getByTestId('import-detail-description')).toHaveClass('max-h-56');
		await fireEvent.click(toggle);
		expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument();
		expect(screen.getByTestId('import-detail-description')).not.toHaveClass('max-h-56');
	});

	it("shows a film's facts, people and genres, with no video facts", () => {
		const film = item({
			destinationType: 'MOVIE',
			title: 'Following',
			facts: { kind: 'MOVIE', rating: 6.5, ratingCount: 6, ratingSource: 'Metacritic', topCast: ['Jeremy Theobald'] },
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
		render(ImportDetailPanel, { props: { item: film, sourceTitle: 'Christopher Nolan' } });
		expect(screen.getByText('Rating source')).toBeInTheDocument();
		expect(screen.getByText('Metacritic')).toBeInTheDocument();
		expect(screen.getByText('6.5')).toBeInTheDocument();
		expect(screen.getByText('Top cast')).toBeInTheDocument();
		expect(screen.getByText('Jeremy Theobald')).toBeInTheDocument();
		expect(screen.queryByText('View count')).toBeNull();
		expect(screen.getByText('Christopher Nolan (Director)')).toBeInTheDocument();
		expect(screen.getByText('Neo-noir, Thriller')).toBeInTheDocument();
	});

	it('says so when a row has no facts', () => {
		render(ImportDetailPanel, { props: { item: item({ facts: {} }), sourceTitle: 's' } });
		expect(screen.getByText('No facts listed for this row.')).toBeInTheDocument();
	});

	it('links an imported row to its content and shows a failure reason', () => {
		const { unmount } = render(ImportDetailPanel, {
			props: { item: item({ inLibrary: true, importStatus: 'IMPORTED', contentId: '12' }), sourceTitle: 's' },
		});
		expect(screen.getByRole('link', { name: 'View in Activity' })).toHaveAttribute('href', '/?open=12');
		unmount();
		render(ImportDetailPanel, {
			props: {
				item: item({ importStatus: 'FAILED', importError: 'The source API refused the request.' }),
				sourceTitle: 's',
			},
		});
		expect(screen.getByTestId('import-detail-status')).toHaveTextContent('Failed');
		expect(screen.getByText('The source API refused the request.')).toBeInTheDocument();
	});

	it('handles loading and error states', () => {
		mocks.state = { isPending: true, isError: false, data: undefined };
		const { unmount } = render(ImportDetailPanel, { props: { item: item(), sourceTitle: 's' } });
		expect(screen.getByText('Loading…')).toBeInTheDocument();
		unmount();
		mocks.state = { isPending: false, isError: true, data: undefined };
		render(ImportDetailPanel, { props: { item: item(), sourceTitle: 's' } });
		expect(screen.getByText(/Couldn't load the description/)).toBeInTheDocument();
	});
});
