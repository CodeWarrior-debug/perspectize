import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CURRENT_INTRO_VERSION } from '$lib/onboarding/config';
import { setCoachForceOpen, getCoachForceOpen } from '$lib/onboarding/coachGate.svelte';

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

import { useMarkOnboardingSeen } from '$lib/queries/hooks/useMarkOnboardingSeen';
import { MARK_ONBOARDING_SEEN } from '$lib/queries/users';

describe('useMarkOnboardingSeen', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.capturedOptions = undefined;
		setCoachForceOpen(true);
	});

	it('registers mutation that calls markOnboardingSeen with version', async () => {
		useMarkOnboardingSeen();
		expect(mocks.capturedOptions).toBeDefined();

		mocks.mockGraphql.mockResolvedValue({
			markOnboardingSeen: {
				version: CURRENT_INTRO_VERSION,
				displayNextSession: false,
				completedAt: '2026-01-01T00:00:00Z',
			},
		});

		await mocks.capturedOptions.mutationFn(CURRENT_INTRO_VERSION);
		expect(mocks.mockGraphql).toHaveBeenCalledWith(MARK_ONBOARDING_SEEN, {
			version: CURRENT_INTRO_VERSION,
		});
	});

	it('onSuccess patches me cache and clears force-open', () => {
		useMarkOnboardingSeen();
		const next = {
			version: CURRENT_INTRO_VERSION,
			displayNextSession: false,
			completedAt: '2026-01-01T00:00:00Z',
		};
		mocks.capturedOptions.onSuccess({ markOnboardingSeen: next });

		expect(getCoachForceOpen()).toBe(false);
		expect(mocks.mockSetQueriesData).toHaveBeenCalledWith({ queryKey: ['me'] }, expect.any(Function));

		const patcher = mocks.mockSetQueriesData.mock.calls[0][1];
		const patched = patcher({
			me: {
				id: '1',
				username: 'u',
				role: 'DEFAULT',
				onboarding: { version: 0, displayNextSession: true, completedAt: null },
			},
		});
		expect(patched.me.onboarding).toEqual(next);
	});
});
