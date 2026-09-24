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
});
