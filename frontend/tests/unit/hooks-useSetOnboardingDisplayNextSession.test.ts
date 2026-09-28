import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	mockGraphql: vi.fn(),
	mockSetQueriesData: vi.fn(),
	capturedOptions: undefined as any,
}));

vi.mock('@tanstack/svelte-query', () => ({
	createMutation: vi.fn((optionsFn: () => any) => {
		mocks.capturedOptions = optionsFn();
		return {
			mutate: vi.fn(),
			isPending: false,
		};
	}),
	useQueryClient: vi.fn(() => ({
		setQueriesData: mocks.mockSetQueriesData,
	})),
}));

vi.mock('$lib/queries/client', () => ({
	graphqlRequest: (...args: unknown[]) => mocks.mockGraphql(...args),
}));

import { useSetOnboardingDisplayNextSession } from '$lib/queries/users/useSetOnboardingDisplayNextSession';
import { SET_ONBOARDING_DISPLAY_NEXT_SESSION } from '$lib/queries/users';

describe('useSetOnboardingDisplayNextSession', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.capturedOptions = undefined;
	});

	it('calls setOnboardingDisplayNextSession with the requested value', async () => {
		useSetOnboardingDisplayNextSession();
		expect(mocks.capturedOptions).toBeDefined();

		mocks.mockGraphql.mockResolvedValue({
			setOnboardingDisplayNextSession: { version: 1, displayNextSession: true, completedAt: null },
		});

		await mocks.capturedOptions.mutationFn(true);
		expect(mocks.mockGraphql).toHaveBeenCalledWith(SET_ONBOARDING_DISPLAY_NEXT_SESSION, {
			displayNextSession: true,
		});
	});

	it('forwards false to turn onboarding back off', async () => {
		useSetOnboardingDisplayNextSession();
		mocks.mockGraphql.mockResolvedValue({
			setOnboardingDisplayNextSession: { version: 1, displayNextSession: false, completedAt: '2026-01-01T00:00:00Z' },
		});

		await mocks.capturedOptions.mutationFn(false);
		expect(mocks.mockGraphql).toHaveBeenCalledWith(SET_ONBOARDING_DISPLAY_NEXT_SESSION, {
			displayNextSession: false,
		});
	});

	it('onSuccess patches the me cache with the returned onboarding state', () => {
		useSetOnboardingDisplayNextSession();
		const next = { version: 1, displayNextSession: true, completedAt: null };
		mocks.capturedOptions.onSuccess({ setOnboardingDisplayNextSession: next });

		expect(mocks.mockSetQueriesData).toHaveBeenCalledWith({ queryKey: ['me'] }, expect.any(Function));

		const patcher = mocks.mockSetQueriesData.mock.calls[0][1];
		const patched = patcher({
			me: {
				id: '1',
				username: 'u',
				role: 'DEFAULT',
				onboarding: { version: 1, displayNextSession: false, completedAt: '2025-01-01T00:00:00Z' },
			},
		});
		expect(patched.me.onboarding).toEqual(next);
	});

	it('onSuccess is a no-op on the cache when the response has no row', () => {
		useSetOnboardingDisplayNextSession();
		mocks.capturedOptions.onSuccess(undefined);
		expect(mocks.mockSetQueriesData).not.toHaveBeenCalled();
	});
});
