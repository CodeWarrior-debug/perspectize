import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ActivityDetailsModal from '#lib/components/ActivityDetailsModal.svelte';
import { warmUpRender } from '../helpers/warmUp';

// The four states of an aged-out numbers tile: fresh, expired (signed in),
// expired (signed out) and refreshing.
const mocks = vi.hoisted(() => ({
	mockMutate: vi.fn(),
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
	useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn(), setQueriesData: vi.fn() })),
}));
vi.mock('svelte-sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('#lib/queries/client.js', () => ({ graphqlRequest: vi.fn() }));

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

const fresh = {
	id: '42',
	name: 'A video',
	url: 'https://youtube.com/watch?v=abc123',
	channelTitle: 'Chan',
	contentType: 'YOUTUBE_VIDEO',
	primaryCategory: null,
	viewCount: 1300000,
	likeCount: 26500,
	length: 59,
	lengthUnits: 'seconds',
	publishedAt: '2026-02-24T00:00:00Z',
	createdAt: '2026-02-20T12:00:00Z',
	// Updated just now, so the 6-hour refresh cooldown would apply to a fresh row.
	updatedAt: new Date().toISOString(),
	description: 'd',
	tags: [],
};
const expired = { ...fresh, viewCount: null, likeCount: null, sourceDataExpired: true };

warmUpRender(ActivityDetailsModal, { content: fresh, open: true, onClose: () => {} });

describe('ActivityDetailsModal source numbers', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.mockMutationState.isPending = false;
		authState.userId = null;
	});

	it('fresh: shows the numbers and no hint', () => {
		render(ActivityDetailsModal, { props: { content: fresh, open: true, onClose: vi.fn() } });
		expect(screen.getByText('1.3 M')).toBeInTheDocument();
		expect(screen.queryByText('Refresh to view')).not.toBeInTheDocument();
		expect(screen.queryByTestId('source-data-expired-hint')).not.toBeInTheDocument();
	});

	it('expired + signed in: placeholder, refresh hint, and an enabled refresh button that refreshes', async () => {
		authState.userId = 'user_1';
		render(ActivityDetailsModal, { props: { content: expired, open: true, onClose: vi.fn() } });

		expect(screen.getAllByText('Refresh to view')).toHaveLength(2); // views + likes
		expect(screen.getByText('Views').nextElementSibling).toHaveTextContent(/^Refresh to view$/); // never 0 or a dash
		expect(screen.getByTestId('source-data-expired-hint')).toHaveTextContent(/Refresh to see the latest/);

		const button = screen.getByRole('button', { name: /Refresh numbers/ });
		expect(button).toBeEnabled(); // not blocked by the recent-update cooldown
		await fireEvent.click(button);
		expect(mocks.mockMutate).toHaveBeenCalledWith('42');
	});

	it('expired + signed out: placeholder and a sign-in hint, no number', () => {
		render(ActivityDetailsModal, { props: { content: expired, open: true, onClose: vi.fn() } });
		expect(screen.getAllByText('Refresh to view')).toHaveLength(2);
		expect(screen.getByTestId('source-data-expired-hint')).toHaveTextContent(/Sign in to refresh/);
	});

	it('expired + refreshing: shows progress and disables the button', () => {
		authState.userId = 'user_1';
		mocks.mockMutationState.isPending = true;
		render(ActivityDetailsModal, { props: { content: expired, open: true, onClose: vi.fn() } });
		expect(screen.getAllByText('Refreshing…')).toHaveLength(2);
		expect(screen.getByRole('button', { name: /Refresh numbers/ })).toBeDisabled();
	});
});
