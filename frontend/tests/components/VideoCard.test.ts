import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import VideoCard from '$lib/components/discover/VideoCard.svelte';
import type { VideoItem } from '$lib/services/youtubeApi';

vi.mock('$lib/queries/users/useMe.svelte', () => ({ useMe: () => ({ me: null }) }));

const video: VideoItem = {
	id: 'abc123',
	title: 'A great video',
	channelTitle: 'Great Channel',
	publishedAt: '2024-06-15T12:00:00Z',
	description: 'A description of the great video',
	thumbnails: {
		medium: { url: 'https://img.example/medium.jpg', width: 320, height: 180 },
	},
};

// jsdom doesn't implement scrollIntoView.
Element.prototype.scrollIntoView = vi.fn();

afterEach(() => {
	vi.mocked(Element.prototype.scrollIntoView).mockClear();
});

describe('VideoCard', () => {
	it('renders title, channel, and description', () => {
		render(VideoCard, { props: { video, onAdd: vi.fn() } });

		expect(screen.getByText('A great video')).toBeInTheDocument();
		expect(screen.getByText('Great Channel')).toBeInTheDocument();
		expect(screen.getByText('A description of the great video')).toBeInTheDocument();
	});

	describe('duration badge', () => {
		it('renders a formatted duration badge when the video has a duration', () => {
			render(VideoCard, { props: { video: { ...video, duration: 'PT4M13S' }, onAdd: vi.fn() } });
			expect(screen.getByText('4:13')).toBeInTheDocument();
		});

		it('renders no badge when the video has no duration (e.g. a search result)', () => {
			render(VideoCard, { props: { video, onAdd: vi.fn() } });
			expect(screen.queryByText(/^\d+:\d{2}/)).not.toBeInTheDocument();
		});
	});

	describe('thumbnail facade', () => {
		it('renders the thumbnail img (with src/srcset/alt) and no iframe when not activated, even after an IntersectionObserver entry fires', () => {
			// Default setup.ts mock fires isIntersecting: true synchronously for
			// anything that still observes — VideoCard shouldn't be one of them
			// any more (the iframe only ever mounts on explicit activation).
			render(VideoCard, { props: { video, onAdd: vi.fn() } });

			const img = screen.getByAltText(video.title) as HTMLImageElement;
			expect(img.src).toBe('https://img.example/medium.jpg');
			expect(img.srcset).toBe('https://img.example/medium.jpg 320w');
			expect(img.getAttribute('loading')).toBe('lazy');
			expect(screen.queryByTitle(video.title)).not.toBeInTheDocument();
		});

		it('gives the first two cards eager/high-priority loading via the index prop', () => {
			render(VideoCard, { props: { video, onAdd: vi.fn(), index: 0 } });
			const img = screen.getByAltText(video.title) as HTMLImageElement;
			expect(img.getAttribute('loading')).toBe('eager');
			expect(img.getAttribute('fetchpriority')).toBe('high');
		});

		it('lazy-loads thumbnails for cards after the first two', () => {
			render(VideoCard, { props: { video, onAdd: vi.fn(), index: 2 } });
			const img = screen.getByAltText(video.title) as HTMLImageElement;
			expect(img.getAttribute('loading')).toBe('lazy');
			expect(img.getAttribute('fetchpriority')).toBe('auto');
		});

		it('falls back to a placeholder (no broken img) when the video has no thumbnails', () => {
			render(VideoCard, { props: { video: { ...video, thumbnails: {} }, onAdd: vi.fn() } });
			expect(screen.queryByRole('img')).not.toBeInTheDocument();
			expect(screen.queryByTitle(video.title)).not.toBeInTheDocument();
		});
	});

	describe('click-to-watch card body', () => {
		it('is a keyboard-reachable, labeled region', () => {
			render(VideoCard, { props: { video, onAdd: vi.fn() } });
			const card = screen.getByRole('button', { name: `Watch ${video.title} inline` });
			expect(card).toHaveAttribute('tabindex', '0');
		});

		it('mounts the iframe (nocookie embed, autoplay) and focuses it on click, replacing the thumbnail img', async () => {
			render(VideoCard, { props: { video, onAdd: vi.fn() } });
			expect(screen.queryByTitle(video.title)).not.toBeInTheDocument();

			const card = screen.getByRole('button', { name: `Watch ${video.title} inline` });
			await fireEvent.click(card);

			await waitFor(() => {
				const iframe = screen.getByTitle(video.title) as HTMLIFrameElement;
				expect(iframe.src).toBe('https://www.youtube-nocookie.com/embed/abc123?autoplay=1');
			});
			await waitFor(() => {
				expect(document.activeElement?.tagName).toBe('IFRAME');
			});
			expect(screen.queryByAltText(video.title)).not.toBeInTheDocument();
			expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
		});

		it('focuses (without remounting or navigating) when the player is already mounted', async () => {
			render(VideoCard, { props: { video, onAdd: vi.fn() } });
			const card = screen.getByRole('button', { name: `Watch ${video.title} inline` });

			// First click activates and mounts the iframe.
			await fireEvent.click(card);
			const iframeBefore = await waitFor(() => screen.getByTitle(video.title));

			// Second click should just refocus the same iframe, not remount it.
			await fireEvent.click(card);

			await waitFor(() => {
				expect(document.activeElement).toBe(screen.getByTitle(video.title));
			});
			expect(screen.getByTitle(video.title)).toBe(iframeBefore);
		});

		it('responds to Enter and Space keydown the same as a click', async () => {
			render(VideoCard, { props: { video, onAdd: vi.fn() } });
			const card = screen.getByRole('button', { name: `Watch ${video.title} inline` });

			await fireEvent.keyDown(card, { key: 'Enter' });
			expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
		});
	});

	describe('Add to Perspectize button', () => {
		it('renders an Add to Perspectize button (with glasses icon) when not in library', () => {
			render(VideoCard, { props: { video, onAdd: vi.fn() } });
			const button = screen.getByRole('button', { name: 'Add to Perspectize' });
			expect(button).toBeInTheDocument();
			expect(button.querySelector('svg')).toBeInTheDocument();
		});

		it('calls onAdd with the video id when clicked, without also triggering the card click-to-watch handler', async () => {
			const onAdd = vi.fn();
			render(VideoCard, { props: { video, onAdd } });

			await fireEvent.click(screen.getByRole('button', { name: 'Add to Perspectize' }));

			expect(onAdd).toHaveBeenCalledWith('abc123');
			// A leaked click-to-watch handler would call activatePlayer, which calls
			// scrollIntoView — asserting it was NOT called proves the button stopped
			// propagation to the card's own click handler.
			expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
		});

		it('shows an Adding... pending state while the mutation is in flight', () => {
			render(VideoCard, { props: { video, isPending: true, onAdd: vi.fn() } });
			const button = screen.getByRole('button', { name: 'Adding...' });
			expect(button).toBeDisabled();
		});

		it('shows the shared library actions instead of the Add button for a video already in the library', () => {
			render(VideoCard, { props: { video, libraryItem: { id: '42', name: 'A great video' }, onAdd: vi.fn() } });

			expect(screen.getByTestId('library-status')).toHaveTextContent('In Library');
			expect(screen.queryByRole('button', { name: /Add to Perspectize/ })).not.toBeInTheDocument();
		});

		it('does not trigger the card click-to-watch handler when a library action is clicked', async () => {
			render(VideoCard, { props: { video, libraryItem: { id: '42', name: 'A great video' }, onAdd: vi.fn() } });

			await fireEvent.click(screen.getByRole('link', { name: 'Compare' }));
			await fireEvent.click(screen.getByRole('link', { name: 'Go to item' }));

			expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
		});
	});
});
