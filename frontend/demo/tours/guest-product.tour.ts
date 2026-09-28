import { test, expect, activityRow } from '../fixtures';

// Recorded as the guest landing's "Watch how it works" video
// (ONBOARDING_VIDEOS.guestProduct).
test('guest product tour: sign in, browse activity, compare two takes', async ({ page, tour }) => {
	await tour.start({ persona: null, video: 'guest-product' });

	await expect(page.getByRole('heading', { name: 'Perspectize' })).toBeVisible();
	await tour.caption('Perspectize: collect perspectives on the videos you care about.');

	await tour.click(page.getByRole('region', { name: 'Perspectize' }).getByRole('button', { name: 'Sign in' }));
	await expect(page.getByTestId('demo-persona-dialog')).toBeVisible();
	await tour.caption('This is a demo — pick a sample account to look around.');
	await tour.click(page.getByTestId('demo-persona-alice'));

	await expect(activityRow(page, 'But what is a neural network?')).toBeVisible();
	await tour.caption('Activity shows everything added so far, with the numbers that matter.');

	await tour.click(activityRow(page, 'But what is a neural network?').getByText('But what is a neural network?'));
	const details = page.getByRole('dialog');
	await expect(details.getByRole('link', { name: 'Compare' })).toBeVisible();
	await tour.caption('Open any item for its details…');

	await tour.click(details.getByRole('link', { name: 'Compare' }));
	await expect(page.getByRole('heading', { name: 'Compare perspectives' })).toBeVisible();
	await expect(page.getByTestId('picker-left')).toBeVisible();
	await tour.caption('…and put two perspectives side by side to see exactly where people disagree.');

	await tour.hideCaption();
	await tour.pause(1200);
});
