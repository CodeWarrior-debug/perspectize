/**
 * Layout-level coach gate store for step 3+.
 * Eligibility is computed from `me.onboarding`; open/forced replay can be set by Help later.
 */
import { isCoachEligible, shouldQuietGraduate, type OnboardingState } from './eligibility';

let forceOpen = $state(false);
let quietGraduateAttempted = $state(false);

export function getCoachForceOpen(): boolean {
	return forceOpen;
}

/** Help → Getting started (step 4) can force the coach open after setting displayNextSession. */
export function setCoachForceOpen(open: boolean): void {
	forceOpen = open;
}

/** Bumped on every replay so the shell can remount the coach fresh at step 1. */
let replayNonce = $state(0);

export function getCoachReplayNonce(): number {
	return replayNonce;
}

/** Settings → "Restart onboarding": show the coach right now, from step 1. No server round-trip. */
export function replayCoach(): void {
	replayNonce += 1;
	forceOpen = true;
}

export function resetQuietGraduateAttempt(): void {
	quietGraduateAttempted = false;
}

export function getQuietGraduateAttempted(): boolean {
	return quietGraduateAttempted;
}

export function markQuietGraduateAttempted(): void {
	quietGraduateAttempted = true;
}

export function resolveShowCoach(opts: {
	signedIn: boolean;
	meLoaded: boolean;
	onboarding: OnboardingState | null | undefined;
}): boolean {
	if (!opts.signedIn) return false;
	if (forceOpen) return true;
	return isCoachEligible({ meLoaded: opts.meLoaded, onboarding: opts.onboarding });
}

export function resolveQuietGraduate(opts: {
	eligible: boolean;
	ownedContentCount: number;
	perspectiveCount: number;
	completedAt?: string | null;
}): boolean {
	if (quietGraduateAttempted) return false;
	return shouldQuietGraduate(opts);
}
