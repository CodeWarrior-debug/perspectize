import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ActivityCardList from '$lib/components/ActivityCardList.svelte';

const rowData = [
	{
		id: '1',
		name: 'Jordan Peterson: "Why Some People Never Change"',
		url: 'https://youtube.com/watch?v=abc123',
		channelTitle: 'Jordan Peterson',
		length: 2955,
		lengthUnits: 'seconds',
	},
	{
		id: '2',
		name: 'Stephen Paea breaking bench',
		url: null,
		channelTitle: 'TBD tribute',
		length: 59,
		lengthUnits: 'seconds',
	},
];

describe('ActivityCardList', () => {
	it('renders one card per row with title, channel, and duration', () => {
		render(ActivityCardList, { props: { rowData, onOpenDetails: vi.fn() } });

		expect(screen.getByText(rowData[0].name)).toBeInTheDocument();
		expect(screen.getByText('Jordan Peterson')).toBeInTheDocument();
		expect(screen.getByText('49:15')).toBeInTheDocument();
		expect(screen.getByText(rowData[1].name)).toBeInTheDocument();
	});

	it('has the activity-card-list test id at its root', () => {
		render(ActivityCardList, { props: { rowData, onOpenDetails: vi.fn() } });
		expect(screen.getByTestId('activity-card-list')).toBeInTheDocument();
	});

	it('opens the video in a new tab when the thumbnail is clicked, without opening details', () => {
		const onOpenDetails = vi.fn();
		const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

		render(ActivityCardList, { props: { rowData, onOpenDetails } });
		fireEvent.click(screen.getByTestId('card-thumb-1'));

		expect(openSpy).toHaveBeenCalledWith('https://youtube.com/watch?v=abc123', '_blank', 'noopener,noreferrer');
		expect(onOpenDetails).not.toHaveBeenCalled();
		openSpy.mockRestore();
	});

	it('opens details when the title/body area is clicked', async () => {
		const onOpenDetails = vi.fn();
		render(ActivityCardList, { props: { rowData, onOpenDetails } });

		await fireEvent.click(screen.getByText(rowData[0].name));
		expect(onOpenDetails).toHaveBeenCalledWith('1');
	});

	it('renders an add-perspective button per card and calls onAddPerspective with the row id, without opening details', async () => {
		const onOpenDetails = vi.fn();
		const onAddPerspective = vi.fn();
		render(ActivityCardList, { props: { rowData, onOpenDetails, onAddPerspective } });

		const buttons = screen.getAllByRole('button', { name: 'Add a perspective' });
		expect(buttons).toHaveLength(rowData.length);

		await fireEvent.click(screen.getByTestId('card-perspective-2'));
		expect(onAddPerspective).toHaveBeenCalledWith('2');
		expect(onOpenDetails).not.toHaveBeenCalled();
	});

	// Gap #13 in the UI gap audit: the card used to show only name/channel/
	// duration — 2 of the grid's DATA_COLUMNS. These cover the three added.
	it('shows category, views, and likes when present', () => {
		render(ActivityCardList, {
			props: {
				rowData: [
					{
						...rowData[0],
						primaryCategory: { label: 'Philosophy' },
						viewCount: 1300000,
						likeCount: 26500,
					},
				],
				onOpenDetails: vi.fn(),
			},
		});

		expect(screen.getByText('Philosophy')).toBeInTheDocument();
		expect(screen.getByText('1.3 M views')).toBeInTheDocument();
		expect(screen.getByText('26.5 K likes')).toBeInTheDocument();
	});

	it('omits category, views, and likes when absent, without leaving stray separators', () => {
		render(ActivityCardList, { props: { rowData, onOpenDetails: vi.fn() } });
		expect(screen.queryByText(/views/)).not.toBeInTheDocument();
		expect(screen.queryByText(/likes/)).not.toBeInTheDocument();
	});

	// Gap #13's duration inconsistency: the card used to always print a
	// duration segment, showing a bare "—" for missing length; UserActivityView
	// hides the whole segment instead. The card now matches that.
	it('hides the duration segment entirely (no "—") when length is missing, matching UserActivityView', () => {
		render(ActivityCardList, {
			props: {
				rowData: [{ ...rowData[0], length: null, lengthUnits: null }],
				onOpenDetails: vi.fn(),
			},
		});
		expect(screen.queryByText('—')).not.toBeInTheDocument();
	});

	it('shows the duration segment when length is present', () => {
		render(ActivityCardList, { props: { rowData, onOpenDetails: vi.fn() } });
		expect(screen.getByText('49:15')).toBeInTheDocument();
	});

	it('shows the "Edit your perspective" affordance for rows the user already has a perspective on', () => {
		render(ActivityCardList, {
			props: {
				rowData,
				onOpenDetails: vi.fn(),
				onAddPerspective: vi.fn(),
				perspectiveContentIds: new Set(['1']),
			},
		});

		expect(screen.getByRole('button', { name: 'Edit your perspective' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Add a perspective' })).toBeInTheDocument();
	});

	describe('Movie rows', () => {
		const movie = {
			id: '5',
			name: 'Inception',
			url: 'https://www.themoviedb.org/movie/27205',
			channelTitle: null,
			length: 8880,
			lengthUnits: 'seconds',
			contentType: 'MOVIE',
			viewCount: 999,
			likeCount: 888,
			response: {
				releaseDate: '2010-07-15',
				certification: 'PG-13',
				voteAverage: 8.364,
				voteCount: 35000,
			},
		};

		it('shows year, rating, runtime and TMDB score instead of channel/views/likes', () => {
			render(ActivityCardList, {
				props: { rowData: [{ ...movie, channelTitle: 'Some Channel' }], onOpenDetails: vi.fn() },
			});
			const facts = screen.getByTestId('card-movie-facts-5');
			expect(facts).toHaveTextContent('2010');
			expect(facts).toHaveTextContent('PG-13');
			expect(facts).toHaveTextContent('2:28:00');
			expect(facts).toHaveTextContent('TMDB 8.4');
			expect(screen.queryByText('Some Channel')).not.toBeInTheDocument();
			expect(screen.queryByText(/views/)).not.toBeInTheDocument();
			expect(screen.queryByText(/likes/)).not.toBeInTheDocument();
		});

		it('skips facts TMDB does not have (no stray separators or dashes)', () => {
			render(ActivityCardList, {
				props: {
					rowData: [{ ...movie, length: null, lengthUnits: null, response: { releaseDate: '1999-03-31' } }],
					onOpenDetails: vi.fn(),
				},
			});
			const facts = screen.getByTestId('card-movie-facts-5');
			expect(facts.textContent?.trim()).toBe('1999');
			expect(screen.queryByText('—')).not.toBeInTheDocument();
		});

		it('still renders YouTube rows with channel, views and likes', () => {
			render(ActivityCardList, {
				props: { rowData: [{ ...rowData[0], viewCount: 1300000, likeCount: 26500 }], onOpenDetails: vi.fn() },
			});
			expect(screen.queryByTestId(/card-movie-facts/)).not.toBeInTheDocument();
			expect(screen.getByText('Jordan Peterson')).toBeInTheDocument();
			expect(screen.getByText('1.3 M views')).toBeInTheDocument();
		});
	});

	describe('thumbnail states (poster, empty slot, video, passage)', () => {
		const film = {
			id: '6',
			name: 'Fellowship',
			url: 'https://www.themoviedb.org/movie/120',
			channelTitle: null,
			length: 10740,
			lengthUnits: 'seconds',
			contentType: 'MOVIE',
			response: { posterPath: '/poster.jpg' },
		};
		const thumb = (id: string) => screen.getByTestId(`card-thumb-${id}`);

		it('movie with a poster: TMDB poster fitted (not cropped), no play badge, no grey tile', () => {
			render(ActivityCardList, { props: { rowData: [film], onOpenDetails: vi.fn() } });
			const img = thumb('6').querySelector('img');
			expect(img?.getAttribute('src')).toBe('https://image.tmdb.org/t/p/w154/poster.jpg');
			expect(img?.className).toContain('object-contain');
			expect(screen.queryByTestId('card-play-badge')).not.toBeInTheDocument();
			expect(thumb('6').className).not.toContain('bg-muted');
		});

		it('movie without a poster: grey placeholder slot, no image, no play badge', () => {
			render(ActivityCardList, { props: { rowData: [{ ...film, response: {} }], onOpenDetails: vi.fn() } });
			expect(thumb('6').querySelector('img')).toBeNull();
			expect(screen.queryByTestId('card-play-badge')).not.toBeInTheDocument();
			expect(thumb('6').className).toContain('bg-muted');
		});

		it('video: YouTube thumbnail cropped to fill, with the play badge', () => {
			render(ActivityCardList, { props: { rowData: [rowData[0]], onOpenDetails: vi.fn() } });
			const img = thumb('1').querySelector('img');
			expect(img?.getAttribute('src')).toBe('https://i.ytimg.com/vi/abc123/hqdefault.jpg');
			expect(img?.className).toContain('object-cover');
			expect(screen.getByTestId('card-play-badge')).toBeInTheDocument();
		});

		it('passage: book icon on the card colour, no grey tile, no play badge', () => {
			render(ActivityCardList, {
				props: {
					rowData: [
						{
							id: '7',
							name: 'John 1:1-5',
							url: null,
							channelTitle: null,
							length: null,
							lengthUnits: null,
							contentType: 'BIBLE_PASSAGE',
						},
					],
					onOpenDetails: vi.fn(),
				},
			});
			expect(thumb('7').className).not.toContain('bg-muted');
			expect(screen.queryByTestId('card-play-badge')).not.toBeInTheDocument();
		});

		it('movie runtime shows to its reported precision (h:mm for MINUTES)', () => {
			render(ActivityCardList, {
				props: {
					rowData: [{ ...film, lengthDisplay: { source: 'tmdb', precision: 'MINUTES' } }],
					onOpenDetails: vi.fn(),
				},
			});
			expect(screen.getByTestId('card-movie-facts-6')).toHaveTextContent('2:59');
			expect(screen.getByTestId('card-movie-facts-6')).not.toHaveTextContent('2:59:00');
		});
	});

	describe('Bible passage rows', () => {
		const passage = {
			id: '3',
			name: 'John 3:16-18',
			url: 'https://www.biblegateway.com/passage/?search=John+3%3A16-18',
			channelTitle: null,
			length: null,
			lengthUnits: null,
			contentType: 'BIBLE_PASSAGE',
			displayTitle: null,
		};

		it('renders an icon tile with the reference as the title, not a video thumbnail', () => {
			render(ActivityCardList, { props: { rowData: [passage], onOpenDetails: vi.fn() } });

			const thumb = screen.getByTestId('card-thumb-3');
			expect(thumb.querySelector('[data-icon="bible-passage"]')).not.toBeNull();
			expect(thumb.querySelector('svg.lucide-play')).toBeNull();
			expect(thumb.querySelector('img')).toBeNull();
			expect(screen.getByText('John 3:16-18')).toBeInTheDocument();
			expect(screen.queryByTestId('card-subtitle-3')).not.toBeInTheDocument();
		});

		it('shows the display title as primary text with the reference as a subtitle once one is set', () => {
			render(ActivityCardList, {
				props: { rowData: [{ ...passage, displayTitle: 'For God so loved the world' }], onOpenDetails: vi.fn() },
			});

			expect(screen.getByText('For God so loved the world')).toBeInTheDocument();
			expect(screen.getByTestId('card-subtitle-3')).toHaveTextContent('John 3:16-18');
		});

		it('does not show a duration/channel line for a passage', () => {
			render(ActivityCardList, { props: { rowData: [passage], onOpenDetails: vi.fn() } });
			expect(screen.getByTestId('activity-card-list')).not.toHaveTextContent('—');
		});

		it('opens the passage source in a new tab from the icon tile, without opening details', async () => {
			const onOpenDetails = vi.fn();
			const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

			render(ActivityCardList, { props: { rowData: [passage], onOpenDetails } });
			await fireEvent.click(screen.getByTestId('card-thumb-3'));

			expect(openSpy).toHaveBeenCalledWith(passage.url, '_blank', 'noopener,noreferrer');
			expect(onOpenDetails).not.toHaveBeenCalled();
			openSpy.mockRestore();
		});

		it('leaves video rows unchanged when mixed in with passages', () => {
			render(ActivityCardList, { props: { rowData: [...rowData, passage], onOpenDetails: vi.fn() } });

			expect(screen.getByTestId('card-thumb-1').querySelector('[data-icon="bible-passage"]')).toBeNull();
			expect(screen.getByTestId('card-thumb-1').querySelector('svg.lucide-play')).not.toBeNull();
			expect(screen.getByText('49:15')).toBeInTheDocument();
		});
	});
});
