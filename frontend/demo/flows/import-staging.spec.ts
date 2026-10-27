import { test, expect } from '../fixtures';

// The import staging sheet against the seeded demo imports (backend/internal/demo/imports.json):
// list, open a sheet, pick a row, import it, and see the outcome land. e2e project only (no video).

const GRAPHQL_URL = process.env.DEMO_GRAPHQL_URL ?? 'http://localhost:8080/graphql';

test.describe('import staging', () => {
	test('lists the seeded imports with their sources and destination types', async ({ page, tour }) => {
		await tour.start({ persona: 'ben', path: '/import' });
		const list = page.getByTestId('import-job-list');
		await expect(list.getByRole('link', { name: 'Jordan Peterson channels' })).toBeVisible();
		await expect(list.getByRole('link', { name: 'Grace to You sermons' })).toBeVisible();
		await expect(list.getByRole('link', { name: 'Christopher Nolan films' })).toBeVisible();
		const nolan = list.locator(':scope > li').filter({ hasText: 'Christopher Nolan films' });
		await expect(nolan).toContainText('Films directed');
		await expect(nolan).toContainText('→ Movie · 14 rows');
		await expect(nolan).toContainText('Ready');
	});

	test('imports a picked film and shows it in the library', async ({ page, tour, request }) => {
		await tour.start({ persona: 'ben', path: '/import' });
		await page.getByRole('link', { name: 'Christopher Nolan films' }).click();
		await expect(page.getByRole('heading', { name: 'Christopher Nolan films' })).toBeVisible();

		// The pinned checkbox and the title live in different AG Grid containers; match them by row index.
		const titleCell = page.locator('.ag-pinned-left-cols-container .ag-row').filter({ hasText: 'Memento' });
		await expect(titleCell).toBeVisible();
		// Focus the row first: the detail panel reports its status (the Status column is
		// off screen and AG Grid doesn't render off-screen cells).
		await titleCell.getByText('Memento', { exact: true }).click();
		const status = page.getByTestId('import-detail-status');
		await expect(status).toHaveText('Not imported');
		await titleCell.locator('.ag-selection-checkbox input').check();

		const bar = page.getByTestId('import-selection-bar');
		await expect(bar).toContainText('1 selected');
		await expect(bar).toContainText('1 Movie');
		await bar.getByRole('button', { name: 'Import 1' }).click();
		await bar.getByRole('button', { name: 'Start import' }).click();

		// Polling picks up the background import.
		await expect(status).toHaveText('Imported', { timeout: 15_000 });
		await expect(page.getByRole('link', { name: 'View in Activity' })).toBeVisible();

		// Asking again is a no-op: the row is now in the library.
		const jobs = await request.post(GRAPHQL_URL, {
			headers: { Authorization: 'Bearer demo.ben' },
			data: { query: '{ importJobs { id name } }' },
		});
		const jobId = (await jobs.json()).data.importJobs.find(
			(j: { name: string }) => j.name === 'Christopher Nolan films',
		).id;
		const sheet = await request.post(GRAPHQL_URL, {
			headers: { Authorization: 'Bearer demo.ben' },
			data: {
				query: 'query($id: ID!) { importJob(id: $id) { items { id title inLibrary } } }',
				variables: { id: jobId },
			},
		});
		const memento = (await sheet.json()).data.importJob.items.find((i: { title: string }) => i.title === 'Memento');
		expect(memento.inLibrary).toBe(true);
		const again = await request.post(GRAPHQL_URL, {
			headers: { Authorization: 'Bearer demo.ben' },
			data: {
				query: 'mutation($input: ImportItemsInput!) { importItems(input: $input) { queued alreadyInLibrary } }',
				variables: { input: { jobId: Number(jobId), itemIds: [Number(memento.id)] } },
			},
		});
		expect((await again.json()).data.importItems).toEqual({ queued: 0, alreadyInLibrary: 1 });
	});

	test('only admins can create imports', async ({ request }) => {
		const res = await request.post(GRAPHQL_URL, {
			headers: { Authorization: 'Bearer demo.ben' },
			data: {
				query:
					'mutation { createImportJob(input: {name: "x", sources: [{sourceType: YOUTUBE_CHANNEL, ref: "@x"}]}) { id } }',
			},
		});
		const body = await res.json();
		expect(body.errors?.[0]?.message).toContain('only an admin may create imports');
	});
});
