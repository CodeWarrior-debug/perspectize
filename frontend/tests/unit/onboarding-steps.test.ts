import { describe, it, expect } from 'vitest';
import { advanceCoachStep, skipCoachStep, coachStepTitle, coachStepBody } from '$lib/onboarding/steps';

describe('coach step machine', () => {
	it('advances from step 1 to step 2', () => {
		expect(advanceCoachStep(1)).toBe(2);
	});

	it('completes from step 2', () => {
		expect(advanceCoachStep(2)).toBe('complete');
	});

	it('skip step mirrors advance (UI-local only)', () => {
		expect(skipCoachStep(1)).toBe(2);
		expect(skipCoachStep(2)).toBe('complete');
	});

	it('exposes titles and body copy for both steps', () => {
		expect(coachStepTitle(1)).toMatch(/add a video/i);
		expect(coachStepTitle(2)).toMatch(/perspective/i);
		expect(coachStepBody(1).length).toBeGreaterThan(10);
		expect(coachStepBody(2).length).toBeGreaterThan(10);
	});
});
