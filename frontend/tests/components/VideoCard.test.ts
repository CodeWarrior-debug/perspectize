import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import VideoCard from '$lib/components/discover/VideoCard.svelte';
import type { VideoItem } from '$lib/services/youtubeApi';
import type { ContentItem } from '$lib/queries/content';

// The real PerspectivePopover needs a QueryClientProvider/Clerk context (for
// its useCreatePerspective/useUpdatePerspective mutations) that this test
// doesn't set up — swap in a lightweight stub so we can assert VideoCard's
// dynamic-import wiring (contentId/contentName/userId) without that.
vi.mock('$lib/components/PerspectivePopover.svelte', async () => {
	const mod = await import('../helpers/FakePerspectivePopover.svelte');
	return { default: mod.default };
});

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

const addedContent: ContentItem = {
	id: '42',
	name: 'A great video',
	addedByUserID: '1',
	url: 'https://www.youtube.com/watch?v=abc123',
	contentType: 'YOUTUBE',
	length: 253,
	lengthUnits: 'seconds',
	viewCount: 1_500_000,
	likeCount: 42_000,
	channelTitle: 'Great Channel',
	publishedAt: '2024-06-15T12:00:00Z',
	tags: null,
	description: 'A description of the great video',
	primaryCategory: {
		id: '1',
		wikidataQid: 'Q1',
		label: 'Music',
		description: null,
		entityType: null,
	},
	createdAt: '2024-06-16T00:00:00Z',
	updatedAt: '2024-06-16T00:00:00Z',
};

// jsdom doesn't implement scrollIntoView.
Element.prototype.scrollIntoView = vi.fn();

// Mirrors tests/setup.ts's default IntersectionObserver mock (fires
// isIntersecting: true synchronously) — re-installed after every test so a
// test that swaps in a PendingObserver doesn't leave later tests without any
// IntersectionObserver at all (vi.unstubAllGlobals would unwind all the way
// back to jsdom's real — nonexistent — implementation, not just this file's
// override).
class AutoIntersectObserverMock implements IntersectionObserver {
	readonly root = null;
	readonly rootMargin = '';
	readonly scrollMargin = '';
	readonly thresholds: ReadonlyArray<number> = [];
	private callback: IntersectionObserverCallback;
	constructor(callback: IntersectionObserverCallback) {
		this.callback = callback;
	}
	observe(target: Element) {
		this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this);
	}
	unobserve() {}
	disconnect() {}
	takeRecords(): IntersectionObserverEntry[] {
		return [];
	}
}

afterEach(() => {
	vi.stubGlobal('IntersectionObserver', AutoIntersectObserverMock);
	vi.mocked(Element.prototype.scrollIntoView).mockClear();
});

describe('VideoCard', () => {
	it('renders title, channel, description, and the embedded player', () => {
		render(VideoCard, { props: { video, onAdd: vi.fn() } });

		expect(screen.getByText('A great video')).toBeInTheDocument();
		expect(screen.getByText('Great Channel')).toBeInTheDocument();
		expect(screen.getByText('A description of the great video')).toBeInTheDocument();
		const iframe = screen.getByTitle('A great video') as HTMLIFrameElement;
		expect(iframe.src).toBe('https://www.youtube.com/embed/abc123');
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

	describe('inline player lazy-mount', () => {
		it('does not mount the iframe until intersection fires', () => {
			class PendingObserver implements IntersectionObserver {
				readonly root = null;
				readonly rootMargin = '';
				readonly scrollMargin = '';
				readonly thresholds: ReadonlyArray<number> = [];
				observe() {}
				unobserve() {}
				disconnect() {}
				takeRecords(): IntersectionObserverEntry[] {
					return [];
				}
			}
			vi.stubGlobal('IntersectionObserver', PendingObserver);

			render(VideoCard, { props: { video, onAdd: vi.fn() } });

			expect(screen.queryByTitle(video.title)).not.toBeInTheDocument();
		});

		it('mounts and focuses the iframe once intersection fires', () => {
			// Default setup.ts mock fires isIntersecting: true synchronously.
			render(VideoCard, { props: { video, onAdd: vi.fn() } });
			expect(screen.getByTitle(video.title)).toBeInTheDocument();
		});
	});

	describe('click-to-watch card body', () => {
		it('is a keyboard-reachable, labeled region', () => {
			render(VideoCard, { props: { video, onAdd: vi.fn() } });
			const card = screen.getByRole('button', { name: `Watch ${video.title} inline` });
			expect(card).toHaveAttribute('tabindex', '0');
		});

		it('mounts and focuses the iframe immediately on click, even before intersection fires', async () => {
			class PendingObserver implements IntersectionObserver {
				readonly root = null;
				readonly rootMargin = '';
				readonly scrollMargin = '';
				readonly thresholds: ReadonlyArray<number> = [];
				observe() {}
				unobserve() {}
				disconnect() {}
				takeRecords(): IntersectionObserverEntry[] {
					return [];
				}
			}
			vi.stubGlobal('IntersectionObserver', PendingObserver);

			render(VideoCard, { props: { video, onAdd: vi.fn() } });
			expect(screen.queryByTitle(video.title)).not.toBeInTheDocument();

			const card = screen.getByRole('button', { name: `Watch ${video.title} inline` });
			await fireEvent.click(card);

			await waitFor(() => {
				expect(screen.getByTitle(video.title)).toBeInTheDocument();
			});
			await waitFor(() => {
				expect(document.activeElement?.tagName).toBe('IFRAME');
			});
			expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
		});

		it('focuses (without remounting or navigating) when the player is already mounted', async () => {
			render(VideoCard, { props: { video, onAdd: vi.fn() } });
			const iframeBefore = screen.getByTitle(video.title);

			const card = screen.getByRole('button', { name: `Watch ${video.title} inline` });
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
			// The card is already "watching" (intersection fired on mount), so a
			// leaked click-to-watch handler would still call scrollIntoView again —
			// asserting it was NOT called proves the button stopped propagation.
			expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
		});

		it('shows an Adding... pending state while the mutation is in flight', () => {
			render(VideoCard, { props: { video, isPending: true, onAdd: vi.fn() } });
			const button = screen.getByRole('button', { name: 'Adding...' });
			expect(button).toBeDisabled();
		});

		it('shows a disabled In Library button for pre-existing tracked videos with no addedContent', () => {
			render(VideoCard, { props: { video, isInLibrary: true, onAdd: vi.fn() } });
			const button = screen.getByRole('button', { name: /In Library/ });
			expect(button).toBeDisabled();
		});
	});

	describe('content details card', () => {
		it('renders duration/views/likes/channel/category once addedContent is present', () => {
			render(VideoCard, { props: { video, onAdd: vi.fn(), addedContent } });

			expect(screen.getByText('Added to Perspectize')).toBeInTheDocument();
			expect(screen.getByText('4:13')).toBeInTheDocument();
			expect(screen.getByText('1.5 M')).toBeInTheDocument();
			expect(screen.getByText('42.0 K')).toBeInTheDocument();
			// "Great Channel" also appears in the card's own byline, so the details
			// card should push it to (at least) two occurrences.
			expect(screen.getAllByText('Great Channel').length).toBeGreaterThanOrEqual(2);
			expect(screen.getByText('Music')).toBeInTheDocument();
		});

		it('renders a working Compare link with the numeric contentId', () => {
			render(VideoCard, { props: { video, onAdd: vi.fn(), addedContent } });

			const compareLink = screen.getByRole('link', { name: 'Compare' });
			expect(compareLink).toHaveAttribute('href', '/compare?contentId=42');
		});

		it('does not trigger the card click-to-watch handler when the Compare link is clicked', async () => {
			render(VideoCard, { props: { video, onAdd: vi.fn(), addedContent } });

			await fireEvent.click(screen.getByRole('link', { name: 'Compare' }));

			expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
		});

		it('opens PerspectivePopover via the Add perspective button without triggering the card click-to-watch handler', async () => {
			render(VideoCard, { props: { video, onAdd: vi.fn(), addedContent, userId: 7 } });

			await fireEvent.click(screen.getByRole('button', { name: 'Add perspective' }));

			expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
			await waitFor(() => {
				const popover = screen.getByTestId('fake-perspective-popover');
				expect(popover).toHaveAttribute('data-content-id', '42');
				expect(popover).toHaveAttribute('data-user-id', '7');
			});
		});
	});
});
