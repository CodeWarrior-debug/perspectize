import { CURRENT_INTRO_VERSION } from './config';

/** Thin onboarding payload from `me.onboarding` (completedAt is RFC3339 string or null). */
export interface OnboardingState {
	version: number;
	displayNextSession: boolean;
	completedAt: string | null;
}

export interface CoachEligibilityInput {
	/** True only after ME settled successfully with onboarding present. */
	meLoaded: boolean;
	onboarding: OnboardingState | null | undefined;
}

/**
 * Whether the checklist coach may auto-show for a signed-in user.
 * Call only after ClerkLoaded + signed in; this helper does not check auth.
 */
export function isCoachEligible({ meLoaded, onboarding }: CoachEligibilityInput): boolean {
	if (!meLoaded || !onboarding) return false;
	return onboarding.displayNextSession === true || onboarding.version < CURRENT_INTRO_VERSION;
}

export interface QuietGraduateInput {
	eligible: boolean;
	ownedContentCount: number;
	perspectiveCount: number;
	/** When set, user already finished/skipped intro — do not quiet-graduate (Help replay). */
	completedAt?: string | null;
}

/**
 * Quiet graduate: auto-eligible users who never completed intro but already have
 * library activity are marked seen once without coach UI.
 * Never runs after a prior completion (keeps Help → Getting started replay intact).
 */
export function shouldQuietGraduate({
	eligible,
	ownedContentCount,
	perspectiveCount,
	completedAt = null,
}: QuietGraduateInput): boolean {
	if (completedAt) return false;
	return eligible && ownedContentCount >= 1 && perspectiveCount >= 1;
}
