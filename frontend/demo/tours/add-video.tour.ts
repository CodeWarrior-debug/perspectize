import { test, expect, activityRow } from '../fixtures';

// Recorded as the coach's "how to add a video" clip (ONBOARDING_VIDEOS.howAddVideo).
// Runs offline: a DEMO_MODE backend serves YouTube metadata from fixtures.
test('add a video from a YouTube link', async ({ page, tour }) => {
	await tour.start({ persona: 'newbie', video: 'add-video' });

	await expect(activityRow(page, 'Me at the zoo')).toHaveCount(0);
	await tour.caption('Start your library by adding a video.');

	await tour.click(page.getByRole('banner').getByRole('button', { name: 'Add Content' }));
	await tour.type(
		page.getByPlaceholder('Paste a link or type a reference'),
		'https://www.youtube.com/watch?v=jNQXAC9IVRw',
	);
	await tour.caption('Paste any YouTube link — the title, channel and stats are filled in for you.');

	await tour.click(page.getByRole('button', { name: 'Add', exact: true }));
	await expect(page.getByText('Added: Me at the zoo')).toBeVisible();
	await expect(activityRow(page, 'Me at the zoo')).toBeVisible();
	await tour.caption('Done — it shows up in Activity for everyone.');

	await tour.hideCaption();
	await tour.pause(800);
});
