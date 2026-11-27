/**
 * The Plan grid in a REAL browser: column-API work must not run before AG Grid's
 * body controller exists, on first mount or after the list-mode remount.
 *
 * Run: pnpm run test:browser --browser.headless=true plan-grid-timing
 */
import { render } from 'vitest-browser-svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page as browserPage } from 'vitest/browser';

import PlanTable from '#lib/components/plan/PlanTable.svelte';

const props = (listMode: boolean) => ({
	rows: [],
	listMode,
	onOpen: () => {},
	onAddPerspective: () => {},
	onSortChange: () => {},
	onReorder: () => {},
});

const errors: string[] = [];
const record = (e: ErrorEvent) => errors.push(e.message);
window.addEventListener('error', record);

const settle = () => new Promise((r) => setTimeout(r, 100));
const headers = () => document.querySelectorAll('.ag-header-cell').length;

afterEach(() => {
	errors.length = 0;
	vi.restoreAllMocks();
});

describe('PlanTable column visibility timing', () => {
	it('applies on first mount and on every list-mode remount without a grid error', async () => {
		const consoleError = vi.spyOn(console, 'error');
		await browserPage.viewport(1280, 800);
		const screen = await render(PlanTable, props(false));
		await expect.poll(headers).toBeGreaterThan(0);
		await settle();
		await browserPage.viewport(880, 800);

		for (let i = 0; i < 20; i++) {
			await screen.rerender(props(i % 2 === 0));
			await settle();
		}

		const logged = consoleError.mock.calls.map((c) => c.map(String).join(' '));
		expect([...errors, ...logged].filter((m) => m.includes('setColumnMovingCss'))).toEqual([]);
	});
});
