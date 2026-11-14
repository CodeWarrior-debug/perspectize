import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import VideoResultsGrid from '$lib/components/discover/VideoResultsGrid.svelte';
import { toWatchUrl, type VideoItem } from '$lib/services/youtubeApi';

vi.mock('$lib/queries/users/useMe.svelte', () => ({ useMe: () => ({ me: null }) }));

function makeVideo(id: string): VideoItem {
	return {
		id,
		title: `Video ${id}`,
		channelTitle: 'Channel',
		publishedAt: '2024-01-01T12:00:00Z',
		description: `Description ${id}`,
		thumbnails: { medium: { url: `https://img.example/${id}.jpg`, width: 320, height: 180 } },
	};
}

describe('VideoResultsGrid', () => {
	it('renders the optional label above the grid', () => {
		render(VideoResultsGrid, {
			props: {
				items: [makeVideo('1')],
				onLoadMore: vi.fn(),
				library: new Map(),
				onAdd: vi.fn(),
				label: 'Showing Trending Content',
			},
		});

		expect(screen.getByText('Showing Trending Content')).toBeInTheDocument();
	});

	it('renders a VideoCard per item', () => {
		render(VideoResultsGrid, {
			props: {
				items: [makeVideo('1'), makeVideo('2')],
				onLoadMore: vi.fn(),
				library: new Map(),
				onAdd: vi.fn(),
			},
		});

		expect(screen.getByText('Video 1')).toBeInTheDocument();
		expect(screen.getByText('Video 2')).toBeInTheDocument();
	});

	it('gives only the first two cards a high-priority, eager-loaded thumbnail', () => {
		render(VideoResultsGrid, {
			props: {
				items: [makeVideo('1'), makeVideo('2'), makeVideo('3')],
				onLoadMore: vi.fn(),
				library: new Map(),
				onAdd: vi.fn(),
			},
		});

		const images = screen.getAllByRole('img') as HTMLImageElement[];
		expect(images.map((img) => img.getAttribute('fetchpriority'))).toEqual(['high', 'high', 'auto']);
		expect(images.map((img) => img.getAttribute('loading'))).toEqual(['eager', 'eager', 'lazy']);
	});

	it('shows the trending empty state when there are no items and no query', () => {
		render(VideoResultsGrid, {
			props: { items: [], onLoadMore: vi.fn(), library: new Map(), onAdd: vi.fn() },
		});

		expect(screen.getByText('No trending content available right now')).toBeInTheDocument();
	});

	it('shows a query-specific empty state when there are no items and a query is active', () => {
		render(VideoResultsGrid, {
			props: { items: [], onLoadMore: vi.fn(), library: new Map(), onAdd: vi.fn(), query: 'svelte' },
		});

		expect(screen.getByText("No results found for 'svelte'")).toBeInTheDocument();
		expect(screen.getByText('Try different keywords or check your spelling')).toBeInTheDocument();
	});

	it('shows skeleton loading state instead of items/empty state when isLoading', () => {
		render(VideoResultsGrid, {
			props: {
				items: [],
				onLoadMore: vi.fn(),
				library: new Map(),
				onAdd: vi.fn(),
				isLoading: true,
			},
		});

		expect(screen.queryByText('No trending content available right now')).not.toBeInTheDocument();
		expect(screen.getByLabelText('Loading videos')).toBeInTheDocument();
	});

	it('shows 6 skeleton cards during the initial fetch', () => {
		const { container } = render(VideoResultsGrid, {
			props: {
				items: [],
				onLoadMore: vi.fn(),
				library: new Map(),
				onAdd: vi.fn(),
				isLoading: true,
			},
		});

		expect(container.querySelectorAll('.animate-pulse')).toHaveLength(6);
	});

	it('shows 3 skeleton cards below existing items during a Load More fetch', () => {
		const { container } = render(VideoResultsGrid, {
			props: {
				items: [makeVideo('1'), makeVideo('2')],
				onLoadMore: vi.fn(),
				library: new Map(),
				onAdd: vi.fn(),
				isLoadingMore: true,
			},
		});

		expect(container.querySelectorAll('.animate-pulse')).toHaveLength(3);
		expect(screen.getByText('Video 1')).toBeInTheDocument();
		expect(screen.getByText('Video 2')).toBeInTheDocument();
	});

	it('shows the library actions for items whose watch URL is already in the library', () => {
		const video = makeVideo('1');
		render(VideoResultsGrid, {
			props: {
				items: [video],
				onLoadMore: vi.fn(),
				library: new Map([[toWatchUrl('1'), { id: '7', name: 'Tracked' }]]),
				onAdd: vi.fn(),
			},
		});

		expect(screen.getByTestId('library-status')).toHaveTextContent('In Library');
		expect(screen.getByRole('link', { name: 'Compare' })).toHaveAttribute('href', '/compare?contentId=7');
	});

	it('renders a Load More button when nextPageToken is present and calls onLoadMore on click', async () => {
		const onLoadMore = vi.fn();
		render(VideoResultsGrid, {
			props: {
				items: [makeVideo('1')],
				nextPageToken: 'next-token',
				onLoadMore,
				library: new Map(),
				onAdd: vi.fn(),
			},
		});

		const button = screen.getByRole('button', { name: 'Load More' });
		await fireEvent.click(button);
		expect(onLoadMore).toHaveBeenCalledTimes(1);
	});

	it('does not render a Load More button when nextPageToken is absent', () => {
		render(VideoResultsGrid, {
			props: { items: [makeVideo('1')], onLoadMore: vi.fn(), library: new Map(), onAdd: vi.fn() },
		});

		expect(screen.queryByRole('button', { name: 'Load More' })).not.toBeInTheDocument();
	});
});
