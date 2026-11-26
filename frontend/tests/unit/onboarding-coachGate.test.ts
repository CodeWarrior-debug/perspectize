import { describe, it, expect, beforeEach } from 'vitest';
import {
	setCoachForceOpen,
	getCoachForceOpen,
	markQuietGraduateAttempted,
	resetQuietGraduateAttempt,
	getQuietGraduateAttempted,
	replayCoach,
	getCoachReplayNonce,
} from '#lib/onboarding/coachGate.svelte.js';

describe('coachGate', () => {
	beforeEach(() => {
		setCoachForceOpen(false);
		resetQuietGraduateAttempt();
	});

	it('replayCoach force-opens and bumps the nonce so the coach remounts', () => {
		const before = getCoachReplayNonce();
		replayCoach();
		expect(getCoachForceOpen()).toBe(true);
		expect(getCoachReplayNonce()).toBe(before + 1);
	});

	it('remembers a quiet graduate attempt until reset', () => {
		markQuietGraduateAttempted();
		expect(getQuietGraduateAttempted()).toBe(true);
		resetQuietGraduateAttempt();
		expect(getQuietGraduateAttempted()).toBe(false);
	});
});
