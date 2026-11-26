/**
 * UI-local checklist coach step machine (not persisted).
 * Step 1 = add video, step 2 = leave a perspective.
 */

export type CoachStep = 1 | 2;

/** Advance after a successful real action (or per-step skip). */
export function advanceCoachStep(step: CoachStep): CoachStep | 'complete' {
	if (step === 1) return 2;
	return 'complete';
}

export function coachStepTitle(step: CoachStep): string {
	return step === 1 ? 'Add a video' : 'Leave a perspective';
}

export function coachStepBody(step: CoachStep): string {
	if (step === 1) {
		return 'Start your library with a YouTube link. You can skip and come back anytime.';
	}
	return 'Share what you notice on a video — ratings, thumbs, or a short note.';
}
