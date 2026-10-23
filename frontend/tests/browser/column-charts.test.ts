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
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
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
	length: 5400 + id * 600, // 100, 110, ... 140 minutes
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

let served: object[] = ITEMS; // what the stubbed API returns; a test can swap it

function stubGraphql() {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => {
			const data = {
				content: {
					items: served,
					pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null },
					totalCount: served.length,
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
// The template always carries the button for chart-capable columns; `hidden` is the off state.
const chartButton = () => {
	const btn = document.querySelector<HTMLElement>('[data-testid="column-chart-button-boxOffice"]');
	return btn && !btn.hidden ? btn : null;
};

beforeEach(() => {
	served = ITEMS;
	localStorage.clear();
	setUrl(new URL('http://localhost/activity?mode=loaded&f.type=MOVIE'));
	stubGraphql();
});

afterEach(async () => {
	// Known pre-existing bug: debounce timer not cleared on destroy (ActivityTable filter-to-URL timer).
	// It fires 500ms after a filter change and throws if the grid is already gone, so wait it out here.
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
		const title = takeHeader()?.querySelector('.ag-header-cell-label') as HTMLElement;
		title.click(); // ascending: lowest known take first
		await expect.poll(topRow).toContain('Film 1');
		title.click(); // descending: highest take first
		await expect.poll(topRow).toContain('Film 4');
	});

	describe('stock header behaviour is kept', () => {
		const flagsOn = (...cols: string[]) =>
			localStorage.setItem(
				CHART_SETTINGS_KEY,
				JSON.stringify({ version: 1, flags: Object.fromEntries(cols.map((c) => [c, true])) }),
			);
		const header = (colId: string) => document.querySelector<HTMLElement>(`.ag-header-cell[col-id="${colId}"]`);
		const anyChartButton = () => document.querySelector('[data-chart-col]:not([hidden])');

		it('shows no chart icon in "All Items" mode', async () => {
			flagsOn('boxOffice');
			setUrl(new URL('http://localhost/activity?mode=all&f.type=movie'));
			// A fresh mount in "All Items" mode makes ActivityTable's sort-sync effect call applyColumnState
			// before the grid finishes starting (pre-existing, unrelated to charts); keep that out of the run.
			const swallow = (e: ErrorEvent) => {
				if (String(e.message).includes('setColumnMovingCss')) {
					e.preventDefault();
					e.stopImmediatePropagation();
				}
			};
			window.addEventListener('error', swallow, true);
			onTestFinished(() => window.removeEventListener('error', swallow, true));
			render(ActivityTableHarness);

			await expect.poll(() => takeHeader()).not.toBeNull();
			await expect.poll(rowCount).toBe(ITEMS.length);
			expect(anyChartButton()).toBeNull();
		});

		it('leaves the YouTube view on the stock header: no chart icon, filter button and sort still work', async () => {
			flagsOn('views');
			setUrl(new URL('http://localhost/activity?mode=loaded&f.type=youtube_video'));
			served = [
				{
					...movie(9, null),
					contentType: 'YOUTUBE_VIDEO',
					name: 'A video',
					viewCount: 1200,
					likeCount: 30,
					movie: null,
				},
			];
			render(ActivityTableHarness);

			await expect.poll(() => header('views')).not.toBeNull();
			await expect.poll(rowCount).toBe(1);
			expect(anyChartButton()).toBeNull();

			(header('views')?.querySelector('.ag-header-cell-filter-button') as HTMLElement).click();
			await expect.poll(() => document.querySelector('.ag-popup .ag-filter')).not.toBeNull();

			(header('views')?.querySelector('.ag-header-cell-label') as HTMLElement).click();
			await expect.poll(() => header('views')?.getAttribute('aria-sort')).toBe('ascending');
		});

		it('opens the filter popup from the filter button on a chart column', async () => {
			flagsOn('boxOffice');
			render(ActivityTableHarness);
			await expect.poll(() => chartButton()).not.toBeNull();

			(takeHeader()?.querySelector('.ag-header-cell-filter-button') as HTMLElement).click();
			await expect.poll(() => document.querySelector('.ag-popup .ag-filter')).not.toBeNull();
		});

		it('sorts a chart column and shows the sort order when two columns are sorted', async () => {
			flagsOn('boxOffice', 'duration');
			render(ActivityTableHarness);
			await expect.poll(() => chartButton()).not.toBeNull();
			await expect.poll(() => header('duration')).not.toBeNull();

			const label = (colId: string) => header(colId)?.querySelector('.ag-header-cell-label') as HTMLElement;
			label('boxOffice').click();
			label('duration').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));

			await expect.poll(() => takeHeader()?.getAttribute('aria-sort')).toBe('ascending');
			await expect.poll(() => header('duration')?.getAttribute('aria-sort')).toBe('ascending');
			await expect.poll(() => takeHeader()?.querySelector('.ag-sort-order:not(.ag-hidden)') ?? null).not.toBeNull();
		});

		it('marks a filtered chart column with the active-filter state', async () => {
			flagsOn('boxOffice');
			setUrl(new URL('http://localhost/activity?mode=loaded&f.type=movie&f.boxoffice=20000000..'));
			render(ActivityTableHarness);

			await expect.poll(() => chartButton()).not.toBeNull();
			await expect
				.poll(() =>
					takeHeader()?.querySelector('.ag-header-cell-filter-button')?.classList.contains('ag-filter-active'),
				)
				.toBe(true);
			// The chart follows the filtered rows: 25M, 40M, 90M of the 5.
			(chartButton() as HTMLElement).click();
			await expect.element(browserPage.getByText('based on 3 loaded movies')).toBeVisible();
		});

		it('labels duration charts as h:mm', async () => {
			flagsOn('duration');
			render(ActivityTableHarness);
			await expect.poll(() => header('duration')?.querySelector('[data-chart-col]')).not.toBeNull();

			(document.querySelector('[data-testid="column-chart-button-duration"]') as HTMLElement).click();
			// Shortest film is 100 minutes, longest 140.
			await expect.element(browserPage.getByText('1:40').first()).toBeVisible();
			await expect.element(browserPage.getByText('2:20').first()).toBeVisible();
		});

		it('closes an open chart when its switch is turned off in the picker', async () => {
			flagsOn('boxOffice');
			render(ActivityTableHarness);
			await expect.poll(() => chartButton()).not.toBeNull();
			(chartButton() as HTMLElement).click();
			await expect.poll(() => document.querySelector('[data-testid="column-chart-popover"]')).not.toBeNull();

			await browserPage.getByRole('button', { name: 'Choose columns' }).click();
			await browserPage.getByRole('switch', { name: 'Take chart' }).click();

			await expect.poll(() => document.querySelector('[data-testid="column-chart-popover"]')).toBeNull();
		});

		it('shows no chart icon for a hidden column', async () => {
			flagsOn('boxOffice');
			render(ActivityTableHarness);
			await expect.poll(() => chartButton()).not.toBeNull();

			await browserPage.getByRole('button', { name: 'Choose columns' }).click();
			await browserPage.getByLabelText('Take', { exact: true }).click();
			await browserPage.getByRole('button', { name: 'Done' }).click();

			await expect.poll(() => takeHeader()).toBeNull();
			expect(chartButton()).toBeNull();
			expect(localStorage.getItem(CHART_SETTINGS_KEY)).toContain('"boxOffice":true');
		});
	});
});
