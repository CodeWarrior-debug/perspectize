import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';

const state = vi.hoisted(() => ({ owned: 0, perspectives: 0, version: 0 }));
const markSeen = vi.hoisted(() => vi.fn());

vi.mock('#lib/queries/users/useMe.svelte.js', () => ({
	useMe: () => ({
		isSuccess: true,
		me: {
			id: '7',
			username: 'dana',
			onboarding: { version: state.version, displayNextSession: false, completedAt: null },
		},
	}),
}));
vi.mock('#lib/queries/users/useMarkOnboardingSeen.js', () => ({
	useMarkOnboardingSeen: () => ({ mutate: markSeen }),
}));
vi.mock('#lib/queries/content/useOwnedContentCount.js', () => ({
	useOwnedContentCount: () => ({ isSuccess: true, data: state.owned }),
}));
vi.mock('#lib/queries/perspectives/useMyPerspectives.js', () => ({
	useMyPerspectives: () => ({
		isSuccess: true,
		data: { perspectives: { items: Array.from({ length: state.perspectives }) } },
	}),
}));
vi.mock('#lib/components/onboarding/OnboardingCoach.svelte', async () => ({
	default: (await import('../helpers/CoachStub.svelte')).default,
}));

import OnboardingShell from '#lib/components/onboarding/OnboardingShell.svelte';
import { resetQuietGraduateAttempt, setCoachForceOpen } from '#lib/onboarding/coachGate.svelte.js';
import { CURRENT_INTRO_VERSION } from '#lib/onboarding/config.js';

describe('OnboardingShell', () => {
	beforeEach(() => {
		Object.assign(state, { owned: 0, perspectives: 0, version: 0 });
		markSeen.mockReset();
		resetQuietGraduateAttempt();
		setCoachForceOpen(false);
	});

	it('shows the coach to a new user', () => {
		render(OnboardingShell);
		expect(screen.getByTestId('coach-stub')).toBeTruthy();
		expect(markSeen).not.toHaveBeenCalled();
	});

	it('graduates a user with content and a perspective without showing the coach', () => {
		Object.assign(state, { owned: 1, perspectives: 1 });
		render(OnboardingShell);
		expect(screen.queryByTestId('coach-stub')).toBeNull();
		expect(markSeen).toHaveBeenCalledTimes(1);
		expect(markSeen).toHaveBeenCalledWith(CURRENT_INTRO_VERSION);
	});

	it('shows nothing to a user who has seen the current intro', () => {
		state.version = CURRENT_INTRO_VERSION;
		render(OnboardingShell);
		expect(screen.queryByTestId('coach-stub')).toBeNull();
	});

	it('shows the coach on a forced replay even after the intro was seen', () => {
		state.version = CURRENT_INTRO_VERSION;
		setCoachForceOpen(true);
		render(OnboardingShell);
		expect(screen.getByTestId('coach-stub')).toBeTruthy();
	});
});
