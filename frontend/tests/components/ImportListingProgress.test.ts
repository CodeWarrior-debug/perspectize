import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import ImportListingProgress from '$lib/components/imports/ImportListingProgress.svelte';
import type {
	ImportListingProgress as Progress,
	ImportSource,
	ImportSourceListingProgress,
} from '$lib/queries/imports';

const mocks = vi.hoisted(() => ({
	isAdmin: true,
	progress: null as Progress | null,
	status: 'connected' as 'connecting' | 'connected' | 'closed',
	enabled: undefined as undefined | (() => boolean),
}));

vi.mock('$lib/queries/users/useMe.svelte', () => ({
	useMe: () => ({
		get isAdmin() {
			return mocks.isAdmin;
		},
	}),
}));
vi.mock('$lib/queries/imports/useImportListingProgress.svelte', () => ({
	useImportListingProgress: (_jobId: () => string | null, enabled: () => boolean) => {
		mocks.enabled = enabled;
		return {
			get progress() {
				return mocks.progress;
			},
			get status() {
				return mocks.status;
			},
		};
	},
}));

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

function snap(listing: boolean, sources: ImportSourceListingProgress[], updatedAt = '2026-11-04T12:00:00Z'): Progress {
	return { jobId: '7', listing, sources, updatedAt };
}

const TWO_SOURCES = [
	source({ id: '10', title: 'Jordan B Peterson' }),
	source({ id: '11', title: 'Jordan B Peterson shorts' }),
];

function renderPanel(sources: ImportSource[] = TWO_SOURCES) {
	return render(ImportListingProgress, { props: { jobId: '7', sources } });
}

beforeEach(() => {
	mocks.isAdmin = true;
	mocks.progress = null;
	mocks.status = 'connected';
	mocks.enabled = undefined;
});

describe('ImportListingProgress', () => {
	it('is hidden for a non-admin, and the hook is told not to open the subscription', () => {
		mocks.isAdmin = false;
		mocks.progress = snap(true, [
			{ sourceId: '10', staged: 80, batches: 3, status: 'LISTING' },
			{ sourceId: '11', staged: 40, batches: 1, status: 'LISTING' },
		]);
		renderPanel();
		expect(screen.queryByTestId(ROOT)).toBeNull();
		expect(mocks.enabled?.()).toBe(false);
	});

	it('is hidden when no source is listing and no snapshot is live', () => {
		mocks.progress = null;
		renderPanel();
		expect(screen.queryByTestId(ROOT)).toBeNull();
	});

	it('while listing: each source shows its staged rows and batches, and the aggregate counts them', () => {
		mocks.progress = snap(true, [
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
		mocks.progress = snap(true, [
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
		mocks.progress = snap(false, [
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
		mocks.progress = snap(false, [
			{ sourceId: '10', staged: 80, batches: 3, status: 'READY' },
			{ sourceId: '11', staged: 40, batches: 1, status: 'READY' },
		]);
		renderPanel();
		expect(screen.getByText('Built 120 rows')).toBeInTheDocument();
		expect(screen.queryByText(/^Building:/)).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
		expect(screen.queryByTestId(ROOT)).toBeNull();
	});

	it('socket disconnected: no live panel and no error banner (the sheet falls back to its 3 s poll)', () => {
		mocks.status = 'closed';
		mocks.progress = snap(true, [{ sourceId: '10', staged: 80, batches: 3, status: 'LISTING' }]);
		renderPanel([source({ id: '10' })]);
		expect(screen.queryByTestId(ROOT)).toBeNull();
		expect(screen.queryByRole('alert')).toBeNull();
		expect(screen.queryByText(/Building:/)).toBeNull();
	});
});
