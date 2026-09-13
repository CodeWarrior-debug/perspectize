import { describe, it, expect, beforeEach } from 'vitest';
import {
	resolveShowCoach,
	resolveQuietGraduate,
	setCoachForceOpen,
	getCoachForceOpen,
	markQuietGraduateAttempted,
	resetQuietGraduateAttempt,
	getQuietGraduateAttempted,
} from '$lib/onboarding/coachGate.svelte';
import { CURRENT_INTRO_VERSION } from '$lib/onboarding/config';

describe('coachGate', () => {
	beforeEach(() => {
		setCoachForceOpen(false);
		resetQuietGraduateAttempt();
	});

	it('does not show coach when signed out', () => {
		expect(
			resolveShowCoach({
				signedIn: false,
				meLoaded: true,
				onboarding: { version: 0, displayNextSession: true, completedAt: null },
			}),
		).toBe(false);
	});

	it('shows coach when eligible', () => {
		expect(
			resolveShowCoach({
				signedIn: true,
				meLoaded: true,
				onboarding: { version: 0, displayNextSession: true, completedAt: null },
			}),
		).toBe(true);
	});

	it('force open shows coach even when not eligible', () => {
		setCoachForceOpen(true);
		expect(getCoachForceOpen()).toBe(true);
		expect(
			resolveShowCoach({
				signedIn: true,
				meLoaded: true,
				onboarding: {
					version: CURRENT_INTRO_VERSION,
					displayNextSession: false,
					completedAt: '2026-01-01T00:00:00Z',
				},
			}),
		).toBe(true);
	});

	it('quiet graduate only once per attempt flag', () => {
		expect(resolveQuietGraduate({ eligible: true, ownedContentCount: 1, perspectiveCount: 1 })).toBe(true);
		markQuietGraduateAttempted();
		expect(getQuietGraduateAttempted()).toBe(true);
		expect(resolveQuietGraduate({ eligible: true, ownedContentCount: 1, perspectiveCount: 1 })).toBe(false);
	});
});
