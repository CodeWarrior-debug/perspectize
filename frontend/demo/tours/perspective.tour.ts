import { test, expect, activityRow } from '../fixtures';

// Recorded as the coach's "how to write a perspective" clip
// (ONBOARDING_VIDEOS.howPerspective). Ben has no take on this video in the seed.
const TITLE = "Let's build GPT: from scratch, in code, spelled out.";

test('write a perspective with ratings', async ({ page, tour }) => {
	await tour.start({ persona: 'ben', video: 'perspective' });

	const row = activityRow(page, TITLE);
	await expect(row).toBeVisible();
	await tour.caption('Seen something worth a take? Add your perspective.');

	await tour.click(row.locator('[col-id="perspectize"]'));
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByText('Add perspective')).toBeVisible();

	await tour.click(dialog.getByRole('button', { name: 'Thumbs up' }));
	await tour.type(
		dialog.locator('[contenteditable="true"]'),
		'Dense but worth it — building the model yourself makes attention click.',
	);
	await tour.caption('Say what you noticed, not just a star rating.');

	await tour.type(dialog.getByLabel('Quality rating'), '9');
	await tour.type(dialog.getByLabel('Importance rating'), '8');
	await tour.caption('Rate what matters: quality, agreement, importance, confidence.');

	await tour.click(dialog.getByRole('button', { name: 'Save perspective' }));
	await expect(dialog).toBeHidden();

	// Persisted: reopening shows the saved take in edit mode.
	await tour.click(row.locator('[col-id="perspectize"]'));
	await expect(page.getByRole('dialog').getByText('building the model yourself')).toBeVisible();
	await tour.caption('Saved. Compare it with others any time.');

	await tour.hideCaption();
	await tour.pause(800);
});
