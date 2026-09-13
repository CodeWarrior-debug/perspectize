import { describe, it, expect } from 'vitest';
import { isCoachEligible, shouldQuietGraduate, type OnboardingState } from '$lib/onboarding/eligibility';
import { CURRENT_INTRO_VERSION } from '$lib/onboarding/config';

function onboarding(partial: Partial<OnboardingState> = {}): OnboardingState {
	return {
		version: 0,
		displayNextSession: true,
		completedAt: null,
		...partial,
	};
}

describe('isCoachEligible', () => {
	it('is false when me is not loaded', () => {
		expect(isCoachEligible({ meLoaded: false, onboarding: onboarding() })).toBe(false);
	});

	it('is false when onboarding is missing', () => {
		expect(isCoachEligible({ meLoaded: true, onboarding: null })).toBe(false);
	});

	it('is true when displayNextSession is true', () => {
		expect(
			isCoachEligible({
				meLoaded: true,
				onboarding: onboarding({ displayNextSession: true, version: CURRENT_INTRO_VERSION }),
			}),
		).toBe(true);
	});

	it('is true when version is below CURRENT_INTRO_VERSION even if displayNextSession is false', () => {
		expect(
			isCoachEligible({
				meLoaded: true,
				onboarding: onboarding({ displayNextSession: false, version: 0 }),
			}),
		).toBe(true);
	});

	it('is false when already seen at current version and displayNextSession is false', () => {
		expect(
			isCoachEligible({
				meLoaded: true,
				onboarding: onboarding({
					displayNextSession: false,
					version: CURRENT_INTRO_VERSION,
					completedAt: '2026-01-01T00:00:00Z',
				}),
			}),
		).toBe(false);
	});
});

describe('shouldQuietGraduate', () => {
	it('is false when not eligible for coach', () => {
		expect(
			shouldQuietGraduate({
				eligible: false,
				ownedContentCount: 2,
				perspectiveCount: 2,
			}),
		).toBe(false);
	});

	it('is false when eligible but missing content or perspectives', () => {
		expect(
			shouldQuietGraduate({
				eligible: true,
				ownedContentCount: 1,
				perspectiveCount: 0,
			}),
		).toBe(false);
		expect(
			shouldQuietGraduate({
				eligible: true,
				ownedContentCount: 0,
				perspectiveCount: 1,
			}),
		).toBe(false);
	});

	it('is true when eligible and user already has content and a perspective', () => {
		expect(
			shouldQuietGraduate({
				eligible: true,
				ownedContentCount: 1,
				perspectiveCount: 1,
			}),
		).toBe(true);
	});

	it('is false when intro was already completed (Help replay must still show coach)', () => {
		expect(
			shouldQuietGraduate({
				eligible: true,
				ownedContentCount: 2,
				perspectiveCount: 2,
				completedAt: '2026-01-01T00:00:00Z',
			}),
		).toBe(false);
	});
});
