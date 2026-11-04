import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import type {
	ImportListingProgress as Progress,
	ImportSource,
	ImportSourceListingProgress,
} from '$lib/queries/imports';
import { liveMock, listingProps } from '../helpers/listingProgressMock.svelte';
import ImportListingHarness from '../helpers/ImportListingHarness.svelte';

const mocks = vi.hoisted(() => ({
	enabled: undefined as undefined | (() => boolean),
}));

vi.mock('$lib/queries/users/useMe.svelte', async () => {
	const { liveMock: live } = await import('../helpers/listingProgressMock.svelte');
	return {
		useMe: () => ({
			get isAdmin() {
				return live.isAdmin;
			},
		}),
	};
});
vi.mock('$lib/queries/imports/useImportListingProgress.svelte', async () => {
	const { liveMock: live } = await import('../helpers/listingProgressMock.svelte');
	return {
		useImportListingProgress: (_jobId: () => string | null, enabled: () => boolean) => {
			mocks.enabled = enabled;
			return {
				get progress() {
					return live.progress;
				},
				get status() {
					return live.status;
				},
			};
		},
	};
});

const ROOT = 'import-listing-progress';

function source(overrides: Partial<ImportSource> = {}): ImportSource {
	return {
		id: '10',
		sourceType: 'YOUTUBE_CHANNEL',
		sourceRef: '@JordanBPeterson',
		title: 'Jordan B Peterson',
		url: null,
		role: null,
		destinationType: 'YOUTUBE_VIDEO',
		status: 'LISTING',
		statusDetail: null,
		itemCount: 0,
		fetchedAt: null,
		...overrides,
	};
}

function snap(
	listing: boolean,
	sources: ImportSourceListingProgress[],
	updatedAt = '2026-11-04T12:00:00Z',
	jobId = '7',
): Progress {
	return { jobId, listing, sources, updatedAt };
}

const TWO_SOURCES = [
	source({ id: '10', title: 'Jordan B Peterson' }),
	source({ id: '11', title: 'Jordan B Peterson shorts' }),
];

/** Mounts the panel through the harness, so later prop changes hit the same instance. */
function renderPanel(sources: ImportSource[] = TWO_SOURCES, jobId = '7') {
	listingProps.jobId = jobId;
	listingProps.sources = sources;
	render(ImportListingHarness);
	flushSync();
}

beforeEach(() => {
	liveMock.isAdmin = true;
	liveMock.progress = null;
	liveMock.status = 'connected';
	listingProps.jobId = '7';
	listingProps.sources = [];
	mocks.enabled = undefined;
});

describe('ImportListingProgress', () => {
	it('is hidden for a non-admin, and the hook is told not to open the subscription', () => {
		liveMock.isAdmin = false;
		liveMock.progress = snap(true, [
			{ sourceId: '10', staged: 80, batches: 3, status: 'LISTING' },
			{ sourceId: '11', staged: 40, batches: 1, status: 'LISTING' },
		]);
		renderPanel();
		expect(screen.queryByTestId(ROOT)).toBeNull();
		expect(mocks.enabled?.()).toBe(false);
	});

	it('an idle import (no source listing) opens no subscription, even for an admin', () => {
		renderPanel([source({ id: '10', status: 'READY' }), source({ id: '11', status: 'FAILED' })]);
		expect(mocks.enabled?.()).toBe(false);
	});

	it('an import with a listing source opens the subscription for an admin', () => {
		renderPanel(TWO_SOURCES);
		expect(mocks.enabled?.()).toBe(true);
	});

	it('is hidden when no source is listing and no snapshot is live', () => {
		liveMock.progress = null;
		renderPanel();
		expect(screen.queryByTestId(ROOT)).toBeNull();
	});

	it('while listing: each source shows its staged rows and batches, and the aggregate counts them', () => {
		liveMock.progress = snap(true, [
			{ sourceId: '10', staged: 80, batches: 3, status: 'LISTING' },
			{ sourceId: '11', staged: 40, batches: 1, status: 'LISTING' },
		]);
		renderPanel();
		expect(screen.getByTestId(ROOT)).toBeInTheDocument();
		expect(screen.getByText('Building: 120 rows from 2 sources')).toBeInTheDocument();
		expect(screen.getByText('80 staged · 3 batches')).toBeInTheDocument();
		expect(screen.getByText('40 staged · 1 batch')).toBeInTheDocument();
		expect(screen.getAllByTestId('listing-spinner')).toHaveLength(2);
		expect(screen.queryByText(/^Built /)).toBeNull();
	});

	it('one source ready while another still lists: the ready one stops spinning', () => {
		liveMock.progress = snap(true, [
			{ sourceId: '10', staged: 40, batches: 2, status: 'READY' },
			{ sourceId: '11', staged: 10, batches: 1, status: 'LISTING' },
		]);
		renderPanel();
		expect(screen.getByText('Building: 50 rows from 2 sources')).toBeInTheDocument();

		const ready = screen.getByTestId('listing-source-10');
		expect(ready).toHaveAttribute('data-status', 'READY');
		expect(within(ready).getByText('Ready · 40 rows')).toBeInTheDocument();
		expect(within(ready).queryByTestId('listing-spinner')).toBeNull();

		const listing = screen.getByTestId('listing-source-11');
		expect(within(listing).getByTestId('listing-spinner')).toBeInTheDocument();
		expect(within(listing).getByText('10 staged · 1 batch')).toBeInTheDocument();
	});

	it('a source failed: its reason is shown from the source, and its spinner stops', () => {
		liveMock.progress = snap(false, [
			{ sourceId: '10', staged: 40, batches: 2, status: 'READY' },
			{ sourceId: '11', staged: 0, batches: 0, status: 'FAILED' },
		]);
		renderPanel([
			source({ id: '10', status: 'READY' }),
			source({ id: '11', status: 'FAILED', statusDetail: 'Channel not found or private' }),
		]);
		expect(screen.getByText('Built 40 rows')).toBeInTheDocument();

		const failed = screen.getByTestId('listing-source-11');
		expect(within(failed).getByText('Failed')).toBeInTheDocument();
		expect(within(failed).getByText('Channel not found or private')).toBeInTheDocument();
		expect(screen.queryByTestId('listing-spinner')).toBeNull();
	});

	it('all done: shows "Built N rows" until it is dismissed', async () => {
		liveMock.progress = snap(false, [
			{ sourceId: '10', staged: 80, batches: 3, status: 'READY' },
			{ sourceId: '11', staged: 40, batches: 1, status: 'READY' },
		]);
		renderPanel();
		expect(screen.getByText('Built 120 rows')).toBeInTheDocument();
		expect(screen.queryByText(/^Building:/)).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
		expect(screen.queryByTestId(ROOT)).toBeNull();
	});

	it('a run that ends flips its sources to READY, and the "Built" panel stays until dismissed', async () => {
		liveMock.progress = snap(true, [
			{ sourceId: '10', staged: 80, batches: 3, status: 'LISTING' },
			{ sourceId: '11', staged: 40, batches: 1, status: 'LISTING' },
		]);
		renderPanel(TWO_SOURCES);
		expect(mocks.enabled?.()).toBe(true);
		expect(screen.getByText('Building: 120 rows from 2 sources')).toBeInTheDocument();

		// The run ends: the final snapshot arrives and the sheet's sources flip to READY, in place.
		liveMock.progress = snap(false, [
			{ sourceId: '10', staged: 80, batches: 3, status: 'READY' },
			{ sourceId: '11', staged: 40, batches: 1, status: 'READY' },
		]);
		listingProps.sources = [source({ id: '10', status: 'READY' }), source({ id: '11', status: 'READY' })];
		flushSync();

		expect(screen.getByText('Built 120 rows')).toBeInTheDocument();
		expect(mocks.enabled?.(), 'stays armed after the flip').toBe(true);
		await fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
		expect(screen.queryByTestId(ROOT)).toBeNull();
	});

	it('a dismissed panel does not carry over to another import', async () => {
		liveMock.progress = snap(false, [{ sourceId: '10', staged: 120, batches: 4, status: 'READY' }]);
		const ready = [source({ id: '10', status: 'READY' })];
		renderPanel(ready, '7');
		await fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
		expect(screen.queryByTestId(ROOT)).toBeNull();

		listingProps.jobId = '8';
		flushSync();
		expect(screen.getByText('Built 120 rows')).toBeInTheDocument();
	});

	it('a listing latch from one import does not arm another idle import', () => {
		liveMock.progress = snap(true, [{ sourceId: '10', staged: 5, batches: 1, status: 'LISTING' }]);
		renderPanel([source({ id: '10' })], '7');
		expect(mocks.enabled?.()).toBe(true);

		liveMock.progress = null;
		listingProps.jobId = '8';
		listingProps.sources = [source({ id: '10', status: 'READY' })];
		flushSync();
		expect(mocks.enabled?.()).toBe(false);
	});

	it('a source with no known status shows its raw status, and only WAITING says "Waiting for approval"', () => {
		liveMock.progress = snap(true, [
			{ sourceId: '10', staged: 5, batches: 1, status: 'LISTING' },
			{ sourceId: '11', staged: 0, batches: 0, status: 'WAITING' },
			{ sourceId: '12', staged: 0, batches: 0, status: 'MYSTERY' as ImportSourceListingProgress['status'] },
		]);
		renderPanel([source({ id: '10' }), source({ id: '11', status: 'WAITING' }), source({ id: '12', status: 'READY' })]);
		expect(within(screen.getByTestId('listing-source-11')).getByText('Waiting for approval')).toBeInTheDocument();
		const odd = screen.getByTestId('listing-source-12');
		expect(within(odd).getByText('MYSTERY')).toBeInTheDocument();
		expect(within(odd).queryByText('Waiting for approval')).toBeNull();
	});

	it('socket disconnected: no live panel and no error banner (the sheet falls back to its 3 s poll)', () => {
		liveMock.status = 'closed';
		liveMock.progress = snap(true, [{ sourceId: '10', staged: 80, batches: 3, status: 'LISTING' }]);
		renderPanel([source({ id: '10' })]);
		expect(screen.queryByTestId(ROOT)).toBeNull();
		expect(screen.queryByRole('alert')).toBeNull();
		expect(screen.queryByText(/Building:/)).toBeNull();
	});
});
