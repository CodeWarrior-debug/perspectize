import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import LibraryCardList from '#lib/components/library/LibraryCardList.svelte';

// The "Add to plan" button reads the auth facade; the real module needs Clerk, so stub it.
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

const video = (overrides: Record<string, unknown> = {}) => ({
	id: '1',
	name: 'The Last Trumpet | Feast of Trumpets Worship Song',
	url: 'https://youtube.com/watch?v=abc123',
	channelTitle: 'Messianic Choir by Caleb Aviel',
	length: 319,
	lengthUnits: 'seconds',
	...overrides,
});

const factTexts = (row: HTMLElement) =>
	within(row)
		.getAllByTestId('card-fact')
		.map((item) => item.textContent?.replace('·', '').trim());

// A phone leaves a card about 150px of text beside a 96px thumbnail and two 36px buttons. These pin the
// layout choices that give that column back, since jsdom cannot measure a wrap.
describe('LibraryCardList layout on a narrow screen', () => {
	beforeEach(() => {
		authState.userId = null;
	});

	it('stacks the card actions in one column, so the title keeps the width the second button took', () => {
		authState.userId = 'user_1';
		render(LibraryCardList, { props: { rowData: [video()], onOpenDetails: vi.fn(), onAddToPlan: vi.fn() } });

		const actions = screen.getByTestId('card-actions-1');
		expect(actions.className).toContain('flex-col');
		expect(within(actions).getByRole('button', { name: 'Add a perspective' })).toBeInTheDocument();
		expect(within(actions).getByRole('button', { name: 'Add to plan' })).toBeInTheDocument();
	});

	it('keeps a lone action (signed out) in the same column wrapper', () => {
		render(LibraryCardList, { props: { rowData: [video()], onOpenDetails: vi.fn() } });
		const actions = screen.getByTestId('card-actions-1');
		expect(within(actions).getAllByRole('button')).toHaveLength(1);
	});

	it('puts a video channel on its own single line, so a long name cannot push the facts around', () => {
		render(LibraryCardList, { props: { rowData: [video()], onOpenDetails: vi.fn() } });
		const channel = screen.getByTestId('card-channel-1');
		expect(channel).toHaveTextContent('Messianic Choir by Caleb Aviel');
		expect(channel.className).toContain('line-clamp-1');
	});

	it('lists duration, category, views and likes as one facts line', () => {
		render(LibraryCardList, {
			props: {
				rowData: [video({ primaryCategory: { label: 'Philosophy' }, viewCount: 1300000, likeCount: 26500 })],
				onOpenDetails: vi.fn(),
			},
		});
		expect(factTexts(screen.getByTestId('card-facts-1'))).toEqual([
			'5:19',
			'Philosophy',
			'1.3 M views',
			'26.5 K likes',
		]);
	});

	it('does not repeat the channel inside the facts line', () => {
		render(LibraryCardList, { props: { rowData: [video({ viewCount: 5 })], onOpenDetails: vi.fn() } });
		expect(factTexts(screen.getByTestId('card-facts-1'))).not.toContain('Messianic Choir by Caleb Aviel');
	});

	it('shows views alone when that is all there is, with no separator before it', () => {
		render(LibraryCardList, {
			props: {
				rowData: [video({ length: null, lengthUnits: null, channelTitle: null, viewCount: 812 })],
				onOpenDetails: vi.fn(),
			},
		});
		const facts = screen.getByTestId('card-facts-1');
		expect(factTexts(facts)).toEqual(['812 views']);
		expect(facts.querySelector('[aria-hidden="true"]')).toBeNull();
	});

	it('renders no channel line and no facts line for a video with nothing to show', () => {
		render(LibraryCardList, {
			props: { rowData: [video({ length: null, lengthUnits: null, channelTitle: null })], onOpenDetails: vi.fn() },
		});
		expect(screen.queryByTestId('card-channel-1')).not.toBeInTheDocument();
		expect(screen.queryByTestId('card-facts-1')).not.toBeInTheDocument();
	});

	it('renders a claim (no channel, no length) with just its text and category', () => {
		render(LibraryCardList, {
			props: {
				rowData: [
					{
						id: '9',
						name: 'The glove did not fit',
						url: null,
						channelTitle: null,
						length: null,
						lengthUnits: null,
						contentType: 'CLAIM',
						primaryCategory: { label: 'Law' },
					},
				],
				onOpenDetails: vi.fn(),
			},
		});
		expect(screen.queryByTestId('card-channel-9')).not.toBeInTheDocument();
		expect(factTexts(screen.getByTestId('card-facts-9'))).toEqual(['Law']);
	});

	it('leaves room under the last card so the floating chat button never covers its actions', () => {
		render(LibraryCardList, { props: { rowData: [video()], onOpenDetails: vi.fn() } });
		expect(screen.getByTestId('activity-card-list').className).toContain('pb-20');
	});

	it('renders movie, book and webpage facts through the same wrap-safe row', () => {
		render(LibraryCardList, {
			props: {
				rowData: [
					{
						id: '5',
						name: 'Inception',
						url: null,
						channelTitle: null,
						length: null,
						lengthUnits: null,
						contentType: 'MOVIE',
						movie: { releaseDate: '2010-07-15', certification: 'PG-13' },
						primaryCategory: { label: 'Sci-Fi' },
					},
					{
						id: '6',
						name: 'East of Eden',
						url: null,
						channelTitle: null,
						length: null,
						lengthUnits: null,
						contentType: 'BOOK',
						book: { firstPublishYear: 1952, pageCountMedian: 611 },
					},
					{
						id: '7',
						name: 'A post',
						url: 'https://example.com/p',
						channelTitle: null,
						length: null,
						lengthUnits: null,
						contentType: 'WEB_PAGE',
						webPage: {
							siteName: 'Example Blog',
							domain: null,
							imageUrl: null,
							faviconUrl: null,
							publishedAt: '2024-03-05T12:00:00Z',
							author: null,
							webPageRoles: ['BLOG_POST'],
						},
					},
				],
				onOpenDetails: vi.fn(),
			},
		});
		expect(factTexts(screen.getByTestId('card-movie-facts-5'))).toEqual(['2010', 'PG-13', 'Sci-Fi']);
		expect(factTexts(screen.getByTestId('card-book-facts-6'))).toEqual(['1952', '611 pages']);
		expect(factTexts(screen.getByTestId('card-webpage-facts-7'))).toEqual(['Example Blog', '2024', 'Blog post']);
	});
});
