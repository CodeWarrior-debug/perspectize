import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ActivityDetailsModal from '$lib/components/ActivityDetailsModal.svelte';

// Hoisted mocks — shared pattern for useUpdateSourceData components (see AddVideoPopover.test.ts)
const mocks = vi.hoisted(() => ({
	mockMutate: vi.fn(),
	mockInvalidateQueries: vi.fn(),
	mockSetQueriesData: vi.fn(),
	mockToastSuccess: vi.fn(),
	mockToastError: vi.fn(),
	mockMutationState: { mutate: null as any, isPending: false },
	mockQueryState: { isLoading: false, data: undefined as any },
}));

vi.mock('@tanstack/svelte-query', () => ({
	createMutation: vi.fn((optionsFn: () => any) => {
		optionsFn();
		mocks.mockMutationState.mutate = mocks.mockMutate;
		return mocks.mockMutationState;
	}),
	createQuery: vi.fn((optionsFn: () => any) => {
		optionsFn();
		return mocks.mockQueryState;
	}),
	useQueryClient: vi.fn(() => ({
		invalidateQueries: mocks.mockInvalidateQueries,
		setQueriesData: mocks.mockSetQueriesData,
	})),
}));

vi.mock('svelte-sonner', () => ({
	toast: { success: mocks.mockToastSuccess, error: mocks.mockToastError },
}));

vi.mock('$lib/queries/client', () => ({ graphqlRequest: vi.fn() }));

function reset() {
	vi.clearAllMocks();
	mocks.mockMutationState.isPending = false;
	mocks.mockQueryState.isLoading = false;
	mocks.mockQueryState.data = undefined;
}

const content = {
	id: '42',
	name: 'Stephen Paea breaking bench',
	url: 'https://youtube.com/watch?v=abc123',
	channelTitle: 'TBD tribute',
	contentType: 'YOUTUBE',
	primaryCategory: { label: 'Powerlifting' },
	viewCount: 1300000,
	likeCount: 26500,
	length: 59,
	lengthUnits: 'seconds',
	publishedAt: '2026-02-24T00:00:00Z',
	createdAt: '2026-02-20T12:00:00Z',
	updatedAt: '2026-03-01T00:00:00Z',
	description: 'A record-setting rep, filmed ringside.',
	tags: ['tom brady', 'tom brady goat'],
};

describe('ActivityDetailsModal', () => {
	beforeEach(reset);

	it('renders nothing when closed', () => {
		render(ActivityDetailsModal, { props: { content, open: false, onClose: vi.fn() } });
		expect(screen.queryByText(content.name)).not.toBeInTheDocument();
	});

	it('renders the video title, channel, link, and stats when open', () => {
		render(ActivityDetailsModal, { props: { content, open: true, onClose: vi.fn() } });

		expect(screen.getByText(content.name)).toBeInTheDocument();
		expect(screen.getByText('TBD tribute')).toBeInTheDocument();
		expect(screen.getByText(content.url)).toBeInTheDocument();
		expect(screen.getByText('1.3 M')).toBeInTheDocument(); // views
		expect(screen.getByText('26.5 K')).toBeInTheDocument(); // likes
		expect(screen.getByText('0:59')).toBeInTheDocument(); // duration
	});

	// Gap #11 in the UI gap audit: the modal had no Category or Date Added, and
	// hard-coded "YouTube Video" regardless of content type -- even though all
	// three were already on the ContentItem rows both callers pass in.
	it('shows the primary category and the date added to Perspectize', () => {
		render(ActivityDetailsModal, { props: { content, open: true, onClose: vi.fn() } });

		expect(screen.getByText('Category')).toBeInTheDocument();
		expect(screen.getByText('Powerlifting')).toBeInTheDocument();
		expect(screen.getByText('Date Added')).toBeInTheDocument();
		expect(screen.getByText('Feb 20, 2026')).toBeInTheDocument();
	});

	it('shows an em dash for category and date added when the content has neither', () => {
		render(ActivityDetailsModal, {
			props: {
				content: { ...content, primaryCategory: null, createdAt: undefined },
				open: true,
				onClose: vi.fn(),
			},
		});

		const dashes = screen.getAllByText('—');
		expect(dashes.length).toBeGreaterThanOrEqual(2);
	});

	it('labels the header "YouTube Video" for a YOUTUBE content item', () => {
		render(ActivityDetailsModal, { props: { content, open: true, onClose: vi.fn() } });
		expect(screen.getByText('YouTube Video')).toBeInTheDocument();
	});

	it('labels the header "Claim" for a CLAIM content item', () => {
		render(ActivityDetailsModal, {
			props: { content: { ...content, contentType: 'CLAIM' }, open: true, onClose: vi.fn() },
		});
		expect(screen.getByText('Claim')).toBeInTheDocument();
		expect(screen.queryByText('YouTube Video')).not.toBeInTheDocument();
	});

	it('falls back to "YouTube Video" when contentType is not provided (backward compatibility)', () => {
		const { contentType, ...withoutType } = content;
		render(ActivityDetailsModal, { props: { content: withoutType, open: true, onClose: vi.fn() } });
		expect(screen.getByText('YouTube Video')).toBeInTheDocument();
	});

	it('shows a loading indicator for perspectives and avg rating while the aggregates query is in flight', () => {
		mocks.mockQueryState.isLoading = true;
		render(ActivityDetailsModal, { props: { content, open: true, onClose: vi.fn() } });

		expect(screen.getByText('Perspectives')).toBeInTheDocument();
		expect(screen.getByText('Avg. Rating')).toBeInTheDocument();
		expect(screen.getAllByText('…').length).toBe(2);
	});

	it('renders the loaded perspective count and average rating', () => {
		mocks.mockQueryState.data = {
			contentByID: { id: content.id, perspectiveCount: 7, averageRating: 8234, qualityRatingCount: 5 },
		};
		render(ActivityDetailsModal, { props: { content, open: true, onClose: vi.fn() } });

		expect(screen.getByText('7')).toBeInTheDocument();
		expect(screen.getByText('8.234')).toBeInTheDocument();
	});

	it('shows a dash for average rating when no public perspective has a rating', () => {
		mocks.mockQueryState.data = {
			contentByID: { id: content.id, perspectiveCount: 0, averageRating: null, qualityRatingCount: 0 },
		};
		render(ActivityDetailsModal, { props: { content, open: true, onClose: vi.fn() } });

		expect(screen.getByText('0')).toBeInTheDocument();
		expect(screen.getByText('—')).toBeInTheDocument();
	});

	it('shows the quality rating count in a tooltip on the avg rating tile', () => {
		mocks.mockQueryState.data = {
			contentByID: { id: content.id, perspectiveCount: 7, averageRating: 8234, qualityRatingCount: 5 },
		};
		render(ActivityDetailsModal, { props: { content, open: true, onClose: vi.fn() } });

		expect(screen.getByText('Avg. Rating').closest('[data-tooltip]')).toHaveAttribute(
			'data-tooltip',
			'5 quality ratings',
		);
	});

	it('singularizes the tooltip when there is exactly one quality rating', () => {
		mocks.mockQueryState.data = {
			contentByID: { id: content.id, perspectiveCount: 1, averageRating: 8234, qualityRatingCount: 1 },
		};
		render(ActivityDetailsModal, { props: { content, open: true, onClose: vi.fn() } });

		expect(screen.getByText('Avg. Rating').closest('[data-tooltip]')).toHaveAttribute(
			'data-tooltip',
			'1 quality rating',
		);
	});

	it('renders tags when present', () => {
		render(ActivityDetailsModal, { props: { content, open: true, onClose: vi.fn() } });
		expect(screen.getByText('tom brady, tom brady goat')).toBeInTheDocument();
	});

	it('renders the description above the tags when present', () => {
		render(ActivityDetailsModal, { props: { content, open: true, onClose: vi.fn() } });
		expect(screen.getByText('Description')).toBeInTheDocument();
		expect(screen.getByText(content.description)).toBeInTheDocument();
	});

	it('omits the description section when there is none', () => {
		render(ActivityDetailsModal, {
			props: { content: { ...content, description: null }, open: true, onClose: vi.fn() },
		});
		expect(screen.queryByText('Description')).not.toBeInTheDocument();
	});

	it('omits the tags section when there are none', () => {
		render(ActivityDetailsModal, {
			props: { content: { ...content, tags: null }, open: true, onClose: vi.fn() },
		});
		expect(screen.queryByText('Tags')).not.toBeInTheDocument();
	});

	it('renders an "Update source data" button that triggers the update mutation for this item', async () => {
		render(ActivityDetailsModal, { props: { content, open: true, onClose: vi.fn() } });
		const button = screen.getByRole('button', { name: 'Update source data' });
		expect(button).toBeInTheDocument();

		await fireEvent.click(button);

		expect(mocks.mockMutate).toHaveBeenCalledWith(content.id);
	});

	it('disables the Update source data button while the mutation is pending', () => {
		mocks.mockMutationState.isPending = true;
		render(ActivityDetailsModal, { props: { content, open: true, onClose: vi.fn() } });

		const button = screen.getByRole('button', { name: /update source data/i });
		expect(button).toBeDisabled();
	});

	it('calls onClose when the close button is clicked', async () => {
		const onClose = vi.fn();
		render(ActivityDetailsModal, { props: { content, open: true, onClose } });

		await fireEvent.click(screen.getByRole('button', { name: /close/i }));
		expect(onClose).toHaveBeenCalled();
	});

	it('renders a Compare link pointing at /compare for this content', () => {
		render(ActivityDetailsModal, { props: { content, open: true, onClose: vi.fn() } });
		const link = screen.getByRole('link', { name: /compare/i });
		expect(link).toHaveAttribute('href', `/compare?contentId=${content.id}`);
	});

	describe('BIBLE_PASSAGE content', () => {
		const passage = {
			id: '7',
			name: 'Genesis 1:1-3',
			url: 'https://www.biblegateway.com/passage/?search=Genesis+1%3A1-3',
			channelTitle: null,
			viewCount: null,
			likeCount: null,
			length: null,
			lengthUnits: null,
			publishedAt: null,
			updatedAt: '2026-03-01T00:00:00Z',
			description: null,
			tags: null,
			contentType: 'BIBLE_PASSAGE',
			displayTitle: null as string | null,
			verseStartID: 1,
			verseEndID: 3,
		};

		beforeEach(() => {
			mocks.mockQueryState.data = {
				passageText: {
					translation: 'BSB',
					copyright: 'Berean Standard Bible, public domain (CC0)',
					verses: [{ verseId: 1, chapter: 1, verse: 1, text: 'In the beginning God created' }],
				},
			};
		});

		it('shows the position bar, a versioned Bible Gateway link, and collapsed commentaries', () => {
			render(ActivityDetailsModal, { props: { content: passage, open: true, onClose: vi.fn() } });

			expect(screen.getByText(/Verses 1–3 of 31,102 · Genesis \(book 1 of 66\)/)).toBeInTheDocument();
			expect(screen.getByRole('link', { name: /read on bible gateway/i })).toHaveAttribute(
				'href',
				expect.stringContaining('&version='),
			);
			expect(screen.getByText(/commentaries/i).closest('details')!.open).toBe(false);
		});

		it('does not show the raw version-less Bible Gateway url as a link (it would serve a different translation)', () => {
			render(ActivityDetailsModal, { props: { content: passage, open: true, onClose: vi.fn() } });
			expect(screen.queryByText(passage.url)).not.toBeInTheDocument();
		});

		it('does not show passage links for a YouTube video', () => {
			render(ActivityDetailsModal, { props: { content, open: true, onClose: vi.fn() } });
			expect(screen.queryByRole('link', { name: /read on bible gateway/i })).not.toBeInTheDocument();
		});

		it('shows the passage header, reference, and passage text with no video stat tiles', () => {
			render(ActivityDetailsModal, { props: { content: passage, open: true, onClose: vi.fn() } });

			expect(screen.getByText('Bible Passage')).toBeInTheDocument();
			expect(screen.queryByText('YouTube Video')).not.toBeInTheDocument();
			expect(screen.getByTestId('passage-title')).toHaveTextContent('Genesis 1:1-3');
			expect(screen.getByText(/In the beginning God created/)).toBeInTheDocument();
			expect(screen.queryByText('Views')).not.toBeInTheDocument();
			expect(screen.queryByText('Likes')).not.toBeInTheDocument();
			expect(screen.queryByText('Duration')).not.toBeInTheDocument();
			expect(screen.queryByText('Published')).not.toBeInTheDocument();
			expect(screen.queryByRole('button', { name: /update source data/i })).not.toBeInTheDocument();
			// Perspective aggregates still apply to a passage
			expect(screen.getByText('Perspectives')).toBeInTheDocument();
		});

		it('offers a title form while untitled and submits the trimmed title', async () => {
			render(ActivityDetailsModal, { props: { content: passage, open: true, onClose: vi.fn() } });

			const save = screen.getByRole('button', { name: /save title/i });
			expect(save).toBeDisabled();

			await fireEvent.input(screen.getByLabelText('Passage title'), { target: { value: '  Creation  ' } });
			expect(save).not.toBeDisabled();
			await fireEvent.click(save);

			expect(mocks.mockMutate).toHaveBeenCalledWith({ contentID: '7', title: 'Creation' });
		});

		it('shows the display title with the reference as subtitle and hides the form once titled', () => {
			render(ActivityDetailsModal, {
				props: { content: { ...passage, displayTitle: 'Creation' }, open: true, onClose: vi.fn() },
			});

			expect(screen.getByTestId('passage-title')).toHaveTextContent('Creation');
			expect(screen.getByText('Genesis 1:1-3')).toBeInTheDocument();
			expect(screen.queryByLabelText('Passage title')).not.toBeInTheDocument();
			expect(screen.queryByRole('button', { name: /save title/i })).not.toBeInTheDocument();
		});

		it('disables Save title while the mutation is pending', async () => {
			mocks.mockMutationState.isPending = true;
			render(ActivityDetailsModal, { props: { content: passage, open: true, onClose: vi.fn() } });

			await fireEvent.input(screen.getByLabelText('Passage title'), { target: { value: 'Creation' } });
			expect(screen.getByRole('button', { name: /save title/i })).toBeDisabled();
		});

		it('offers original language for a passage', () => {
			render(ActivityDetailsModal, { props: { content: passage, open: true, onClose: vi.fn() } });
			expect(screen.getByRole('button', { name: /show original language/i })).toBeInTheDocument();
		});

		it('does not offer original language for a YouTube video', () => {
			render(ActivityDetailsModal, { props: { content, open: true, onClose: vi.fn() } });
			expect(screen.queryByRole('button', { name: /original language/i })).not.toBeInTheDocument();
		});
	});
});
