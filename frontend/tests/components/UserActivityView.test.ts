import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import TestWrapper from '../helpers/TestWrapper.svelte';

const { mockRequest, clerkState } = vi.hoisted(() => ({
	mockRequest: vi.fn(),
	clerkState: { isLoaded: false, auth: { userId: null as string | null } },
}));

vi.mock('$lib/queries/client', () => ({
	graphqlRequest: mockRequest,
}));

vi.mock('svelte-clerk', () => ({
	useClerkContext: () => clerkState,
}));

import UserActivityView from '$lib/components/UserActivityView.svelte';

const usersResponse = {
	users: [
		{ id: '1', username: 'alice' },
		{ id: '2', username: 'bob' },
	],
};

const contentResponse = {
	content: {
		items: [
			{
				id: '10',
				name: 'Alice video',
				addedByUserID: '1',
				updatedAt: '2024-01-02T00:00:00Z',
				createdAt: '2024-01-01T00:00:00Z',
			},
		],
	},
};

const perspectivesResponse = {
	perspectives: {
		items: [
			{
				id: '100',
				userID: '2',
				contentID: '10',
				privacy: 'PUBLIC',
				description: null,
				content: { id: '10', name: 'Alice video' },
				createdAt: '2024-01-03T00:00:00Z',
				updatedAt: '2024-01-03T00:00:00Z',
			},
		],
	},
};

function renderView(queryClient?: QueryClient) {
	const client =
		queryClient ??
		new QueryClient({
			defaultOptions: {
				queries: { retry: false, gcTime: 0, staleTime: 0 },
				mutations: { retry: false },
			},
		});
	return render(TestWrapper, {
		props: { queryClient: client, component: UserActivityView, props: {} },
	});
}

describe('UserActivityView', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clerkState.isLoaded = false;
		clerkState.auth.userId = null;
		mockRequest.mockImplementation((query: string) => {
			if (query.includes('ListUsers')) return Promise.resolve(usersResponse);
			if (query.includes('ListContent')) return Promise.resolve(contentResponse);
			if (query.includes('ListActivityPerspectives')) return Promise.resolve(perspectivesResponse);
			return Promise.resolve({});
		});
	});

	it('groups activity by user, newest first, across both users', async () => {
		renderView();

		await waitFor(() => {
			expect(screen.getByTestId('user-activity-1')).toBeInTheDocument();
			expect(screen.getByTestId('user-activity-2')).toBeInTheDocument();
		});

		// Bob's perspective (Jan 3) is more recent than Alice's content add (Jan 2),
		// so bob's group should render before alice's.
		const testIds = screen.getAllByTestId(/user-activity-/).map((el) => el.getAttribute('data-testid'));
		expect(testIds.indexOf('user-activity-2')).toBeLessThan(testIds.indexOf('user-activity-1'));
	});

	it('does not show the private-perspectives toggle when signed out', async () => {
		renderView();
		await waitFor(() => {
			expect(screen.getByTestId('user-activity-1')).toBeInTheDocument();
		});
		expect(screen.queryByText('Include my private perspectives')).not.toBeInTheDocument();
	});
});
