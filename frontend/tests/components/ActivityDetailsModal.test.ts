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
	viewCount: 1300000,
	likeCount: 26500,
	length: 59,
	lengthUnits: 'seconds',
	publishedAt: '2026-02-24T00:00:00Z',
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

	it('shows a loading indicator for perspectives and avg rating while the aggregates query is in flight', () => {
		mocks.mockQueryState.isLoading = true;
		render(ActivityDetailsModal, { props: { content, open: true, onClose: vi.fn() } });

		expect(screen.getByText('Perspectives')).toBeInTheDocument();
		expect(screen.getByText('Avg. Rating')).toBeInTheDocument();
		expect(screen.getAllByText('…').length).toBe(2);
	});

	it('renders the loaded perspective count and average rating', () => {
		mocks.mockQueryState.data = { contentByID: { id: content.id, perspectiveCount: 7, averageRating: 8234 } };
		render(ActivityDetailsModal, { props: { content, open: true, onClose: vi.fn() } });

		expect(screen.getByText('7')).toBeInTheDocument();
		expect(screen.getByText('8.234')).toBeInTheDocument();
	});

	it('shows a dash for average rating when no public perspective has a rating', () => {
		mocks.mockQueryState.data = { contentByID: { id: content.id, perspectiveCount: 0, averageRating: null } };
		render(ActivityDetailsModal, { props: { content, open: true, onClose: vi.fn() } });

		expect(screen.getByText('0')).toBeInTheDocument();
		expect(screen.getByText('—')).toBeInTheDocument();
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
});
