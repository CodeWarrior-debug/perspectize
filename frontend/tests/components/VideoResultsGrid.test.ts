import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import VideoResultsGrid from '$lib/components/discover/VideoResultsGrid.svelte';
import { toWatchUrl, type VideoItem } from '$lib/services/youtubeApi';
import type { ContentItem } from '$lib/queries/content';

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
				libraryUrls: new Set<string>(),
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
				libraryUrls: new Set<string>(),
				onAdd: vi.fn(),
			},
		});

		expect(screen.getByText('Video 1')).toBeInTheDocument();
		expect(screen.getByText('Video 2')).toBeInTheDocument();
	});

	it('shows the trending empty state when there are no items and no query', () => {
		render(VideoResultsGrid, {
			props: { items: [], onLoadMore: vi.fn(), libraryUrls: new Set<string>(), onAdd: vi.fn() },
		});

		expect(screen.getByText('No trending content available right now')).toBeInTheDocument();
	});

	it('shows a query-specific empty state when there are no items and a query is active', () => {
		render(VideoResultsGrid, {
			props: { items: [], onLoadMore: vi.fn(), libraryUrls: new Set<string>(), onAdd: vi.fn(), query: 'svelte' },
		});

		expect(screen.getByText("No results found for 'svelte'")).toBeInTheDocument();
		expect(screen.getByText('Try different keywords or check your spelling')).toBeInTheDocument();
	});

	it('shows skeleton loading state instead of items/empty state when isLoading', () => {
		render(VideoResultsGrid, {
			props: {
				items: [],
				onLoadMore: vi.fn(),
				libraryUrls: new Set<string>(),
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
				libraryUrls: new Set<string>(),
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
				libraryUrls: new Set<string>(),
				onAdd: vi.fn(),
				isLoadingMore: true,
			},
		});

		expect(container.querySelectorAll('.animate-pulse')).toHaveLength(3);
		expect(screen.getByText('Video 1')).toBeInTheDocument();
		expect(screen.getByText('Video 2')).toBeInTheDocument();
	});

	it('marks items whose watch URL is already in libraryUrls as in-library', () => {
		const video = makeVideo('1');
		render(VideoResultsGrid, {
			props: {
				items: [video],
				onLoadMore: vi.fn(),
				libraryUrls: new Set([toWatchUrl('1')]),
				onAdd: vi.fn(),
			},
		});

		expect(screen.getByRole('button', { name: /In Library/ })).toBeDisabled();
	});

	it('renders a Load More button when nextPageToken is present and calls onLoadMore on click', async () => {
		const onLoadMore = vi.fn();
		render(VideoResultsGrid, {
			props: {
				items: [makeVideo('1')],
				nextPageToken: 'next-token',
				onLoadMore,
				libraryUrls: new Set<string>(),
				onAdd: vi.fn(),
			},
		});

		const button = screen.getByRole('button', { name: 'Load More' });
		await fireEvent.click(button);
		expect(onLoadMore).toHaveBeenCalledTimes(1);
	});

	it('does not render a Load More button when nextPageToken is absent', () => {
		render(VideoResultsGrid, {
			props: { items: [makeVideo('1')], onLoadMore: vi.fn(), libraryUrls: new Set<string>(), onAdd: vi.fn() },
		});

		expect(screen.queryByRole('button', { name: 'Load More' })).not.toBeInTheDocument();
	});

	it('passes each item its matching entry from addedContentByVideoId, rendering the details card for a freshly-added video', () => {
		const addedContent: ContentItem = {
			id: '99',
			name: 'Video 1',
			addedByUserID: '1',
			url: toWatchUrl('1'),
			contentType: 'YOUTUBE',
			length: 90,
			lengthUnits: 'seconds',
			viewCount: 10,
			likeCount: 2,
			channelTitle: 'Channel',
			publishedAt: '2024-01-01T12:00:00Z',
			tags: null,
			description: null,
			primaryCategory: null,
			createdAt: '2024-01-01T12:00:00Z',
			updatedAt: '2024-01-01T12:00:00Z',
		};

		render(VideoResultsGrid, {
			props: {
				items: [makeVideo('1'), makeVideo('2')],
				onLoadMore: vi.fn(),
				libraryUrls: new Set<string>(),
				onAdd: vi.fn(),
				addedContentByVideoId: new Map([['1', addedContent]]),
			},
		});

		expect(screen.getByText('Added to Perspectize')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Compare' })).toHaveAttribute('href', '/compare?contentId=99');
	});
});
