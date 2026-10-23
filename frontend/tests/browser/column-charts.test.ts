/**
 * Column charts on the Activity grid, in a REAL browser.
 *
 * Movie type filter, "Loaded" mode: the chart icon is off by default, the
 * Columns picker turns it on per column, and the popover charts the rows the
 * grid shows.
 *
 * Run: pnpm run test:browser --browser.headless=true column-charts
 */
import { render } from 'vitest-browser-svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page as browserPage } from 'vitest/browser';

import ActivityTableHarness from './fixtures/ActivityTableHarness.svelte';
import { page as routerPage } from '$app/state';
import { CHART_SETTINGS_KEY } from '$lib/utils/columnChartSettings';

vi.hoisted(() => vi.stubEnv('VITE_DEMO_MODE', 'true'));

const movie = (id: number, revenue: number | null) => ({
	id: String(id),
	name: `Film ${id}`,
	addedByUserID: '1',
	url: `https://www.themoviedb.org/movie/${id}`,
	contentType: 'MOVIE',
	length: 6000,
	lengthUnits: 'seconds',
	viewCount: null,
	likeCount: null,
	channelTitle: null,
	publishedAt: '2020-01-01T00:00:00Z',
	tags: [],
	description: null,
	movie: { tmdbId: id, revenue, budget: 1_000_000, genres: ['Drama'] },
	primaryCategory: null,
	createdAt: '2024-01-01T00:00:00Z',
	updatedAt: '2024-01-01T00:00:00Z',
});

// Five films; one has no known box office, so the chart has 4 values out of 5 rows.
const ITEMS = [movie(1, 10_000_000), movie(2, 25_000_000), movie(3, 40_000_000), movie(4, 90_000_000), movie(5, null)];

function stubGraphql() {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => {
			const data = {
				content: {
					items: ITEMS,
					pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null },
					totalCount: ITEMS.length,
				},
				users: [],
			};
			return new Response(JSON.stringify({ data }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		}),
	);
}

// The mock's `url` is a plain value; the real `page` type is read-only, hence the cast.
const setUrl = (url: URL) => ((routerPage as { url: URL }).url = url);

const rowCount = () => document.querySelectorAll('.ag-center-cols-container .ag-row').length;
const takeHeader = () => document.querySelector('.ag-header-cell[col-id="boxOffice"]');
const chartButton = () => document.querySelector('[data-testid="column-chart-button-boxOffice"]');

beforeEach(() => {
	localStorage.clear();
	setUrl(new URL('http://localhost/activity?mode=loaded&f.type=MOVIE'));
	stubGraphql();
});

afterEach(async () => {
	// The grid debounces its filter-to-URL write by 500ms; let it fire while the grid is still mounted.
	await new Promise((r) => setTimeout(r, 600));
	localStorage.clear();
	vi.unstubAllGlobals();
});

describe('column charts on the activity grid', () => {
	it('shows no chart icon until the column picker turns it on, then charts the loaded rows', async () => {
		render(ActivityTableHarness);

		await expect.poll(rowCount).toBe(ITEMS.length);
		await expect.poll(() => takeHeader()).not.toBeNull();
		expect(chartButton()).toBeNull();

		await browserPage.getByRole('button', { name: 'Choose columns' }).click();
		await browserPage.getByRole('switch', { name: 'Take chart' }).click();
		await browserPage.getByRole('button', { name: 'Done' }).click();

		expect(localStorage.getItem(CHART_SETTINGS_KEY)).toContain('"boxOffice":true');
		await expect.poll(() => chartButton()).not.toBeNull();

		(chartButton() as HTMLElement).click();
		await expect.element(browserPage.getByText('based on 4 loaded movies')).toBeVisible();
		// 4 values out of the 5 rows the grid shows.
		expect(rowCount()).toBe(5);
	});

	it('shows the icon straight away when the flag was saved earlier, and turns it off again from the picker', async () => {
		localStorage.setItem(CHART_SETTINGS_KEY, JSON.stringify({ version: 1, flags: { boxOffice: true } }));
		render(ActivityTableHarness);

		await expect.poll(() => chartButton()).not.toBeNull();

		await browserPage.getByRole('button', { name: 'Choose columns' }).click();
		await browserPage.getByRole('switch', { name: 'Take chart' }).click();
		await browserPage.getByRole('button', { name: 'Done' }).click();

		await expect.poll(() => chartButton()).toBeNull();
		expect(localStorage.getItem(CHART_SETTINGS_KEY)).toContain('"boxOffice":false');
	});

	it('shows no chart icon outside the movie view', async () => {
		localStorage.setItem(CHART_SETTINGS_KEY, JSON.stringify({ version: 1, flags: { boxOffice: true } }));
		setUrl(new URL('http://localhost/activity?mode=loaded&f.type=movie,youtube_video'));
		render(ActivityTableHarness);

		await expect.poll(rowCount).toBe(ITEMS.length);
		expect(document.querySelector('[data-testid^="column-chart-button-"]')).toBeNull();
	});

	it('keeps the header sortable once it carries the chart icon', async () => {
		localStorage.setItem(CHART_SETTINGS_KEY, JSON.stringify({ version: 1, flags: { boxOffice: true } }));
		render(ActivityTableHarness);
		await expect.poll(() => chartButton()).not.toBeNull();

		const topRow = () => document.querySelector('.ag-center-cols-container .ag-row[row-index="0"]')?.textContent ?? '';
		const title = takeHeader()?.querySelector('span.font-semibold') as HTMLElement;
		title.click(); // ascending: lowest known take first
		await expect.poll(topRow).toContain('Film 1');
		title.click(); // descending: highest take first
		await expect.poll(topRow).toContain('Film 4');
	});
});
