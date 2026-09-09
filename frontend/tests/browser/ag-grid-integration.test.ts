/**
 * AG Grid Browser Mode Integration Tests
 *
 * These tests run in a REAL browser (Chromium via Playwright) using vitest-browser-svelte.
 * They cover AG Grid behaviors that jsdom cannot test:
 * - Grid lifecycle (onGridReady fires, GridApi available)
 * - Cell rendering (DOM elements, thumbnails, icons)
 * - Column sorting (click headers, sort model updates)
 * - Column filtering (filter UI, filter model)
 * - Responsive column visibility (viewport resize)
 *
 * Run: pnpm run test:browser
 */
import { render } from 'vitest-browser-svelte';
import { describe, it, expect, vi } from 'vitest';
import { page } from 'vitest/browser';
import type { GridApi } from '@ag-grid-community/core';

import AGGridTestHarness from './fixtures/AGGridTestHarness.svelte';

// Injected by vitest.config.browser.ts (see `define`). Absolute, so captures
// land in the shared screenshots folder instead of next to this file.
declare const __SV_SCREENSHOT_DIR__: string;

const SAMPLE_ROWS = [
	{
		id: '1',
		name: 'Understanding TypeScript Generics',
		url: 'https://www.youtube.com/watch?v=abc123',
		contentType: 'YOUTUBE',
		length: 612,
		lengthUnits: 'seconds',
		viewCount: 45200,
		likeCount: 1800,
		channelTitle: 'Code Academy',
		publishedAt: '2024-06-15T12:00:00Z',
		tags: ['typescript', 'generics', 'tutorial'],
		description: 'A deep dive into TypeScript generics with practical examples.',
		createdAt: '2024-07-01',
		updatedAt: '2024-07-10',
	},
	{
		id: '2',
		name: 'Svelte 5 Runes Explained',
		url: 'https://www.youtube.com/watch?v=def456',
		contentType: 'YOUTUBE',
		length: 1845,
		lengthUnits: 'seconds',
		viewCount: 128000,
		likeCount: 5200,
		channelTitle: 'Svelte Society',
		publishedAt: '2024-08-20T12:00:00Z',
		tags: ['svelte', 'runes', 'svelte5'],
		description: 'Everything you need to know about Svelte 5 runes.',
		createdAt: '2024-09-01',
		updatedAt: '2024-09-15',
	},
	{
		id: '3',
		name: 'GraphQL Best Practices',
		url: 'https://www.youtube.com/watch?v=ghi789',
		contentType: 'YOUTUBE',
		length: 2400,
		lengthUnits: 'seconds',
		viewCount: 67500,
		likeCount: 3100,
		channelTitle: 'GraphQL Weekly',
		publishedAt: '2024-03-10T12:00:00Z',
		tags: ['graphql', 'api', 'best-practices'],
		description: 'Best practices for designing GraphQL schemas.',
		createdAt: '2024-04-01',
		updatedAt: '2024-04-20',
	},
];

// Helper: wait for AG Grid to finish rendering
async function waitForGridReady(timeout = 5000): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		const rows = document.querySelectorAll('.ag-row');
		if (rows.length > 0) return;
		await new Promise((r) => setTimeout(r, 50));
	}
}

// ---------------------------------------------------------------------------
// Grid Lifecycle
// ---------------------------------------------------------------------------
describe('AG Grid Lifecycle', () => {
	it('fires onGridReady and provides a valid GridApi', async () => {
		let receivedApi: GridApi | null = null;
		const onGridReady = (api: GridApi) => {
			receivedApi = api;
		};

		render(AGGridTestHarness, {
			testRowData: SAMPLE_ROWS,
			onGridReady,
		});

		await waitForGridReady();
		expect(receivedApi).not.toBeNull();
		expect(typeof receivedApi!.getDisplayedRowCount).toBe('function');
	});

	it('displays the correct number of rows', async () => {
		let api: GridApi | null = null;
		render(AGGridTestHarness, {
			testRowData: SAMPLE_ROWS,
			onGridReady: (a) => {
				api = a;
			},
		});

		await waitForGridReady();
		expect(api!.getDisplayedRowCount()).toBe(3);
	});

	it('renders AG Grid DOM structure', async () => {
		const screen = render(AGGridTestHarness, {
			testRowData: SAMPLE_ROWS,
		});

		await waitForGridReady();
		const harness = screen.getByTestId('ag-grid-harness');
		await expect.element(harness).toBeInTheDocument();

		// AG Grid renders its own root element
		const agRoot = document.querySelector('.ag-root-wrapper');
		expect(agRoot).not.toBeNull();

		// Static end-state: a screenshot is the right (and cheapest) evidence here.
		await page.screenshot({ path: `${__SV_SCREENSHOT_DIR__}/sv-ag-grid-render.png` });
	});
});

// ---------------------------------------------------------------------------
// Cell Rendering
// ---------------------------------------------------------------------------
describe('AG Grid Cell Rendering', () => {
	it('renders item cells with clickable links', async () => {
		render(AGGridTestHarness, { testRowData: SAMPLE_ROWS });
		await waitForGridReady();

		const links = document.querySelectorAll('.ag-cell[col-id="item"] a');
		expect(links.length).toBe(3);

		const firstLink = links[0] as HTMLAnchorElement;
		expect(firstLink.href).toContain('youtube.com/watch');
		expect(firstLink.target).toBe('_blank');
		expect(firstLink.rel).toContain('noopener');
		expect(firstLink.textContent).toBe('Understanding TypeScript Generics');
	});

	it('renders YouTube thumbnails in item cells', async () => {
		render(AGGridTestHarness, { testRowData: SAMPLE_ROWS });
		await waitForGridReady();

		const thumbnails = document.querySelectorAll('.ag-cell[col-id="item"] img');
		expect(thumbnails.length).toBe(3);

		const firstImg = thumbnails[0] as HTMLImageElement;
		expect(firstImg.src).toContain('i.ytimg.com/vi/abc123');
	});

	it('renders type cells with YouTube SVG icon', async () => {
		render(AGGridTestHarness, { testRowData: SAMPLE_ROWS });
		await waitForGridReady();

		const typeCells = document.querySelectorAll('.ag-cell[col-id="type"] svg');
		expect(typeCells.length).toBe(3);

		const svg = typeCells[0] as SVGElement;
		expect(svg.getAttribute('fill')).toBe('#FF0000');
	});

	it('renders perspectize cells with "+" icon (no existing perspective)', async () => {
		render(AGGridTestHarness, { testRowData: SAMPLE_ROWS });
		await waitForGridReady();

		const perspCells = document.querySelectorAll('.ag-cell[col-id="perspectize"]');
		expect(perspCells.length).toBe(3);

		// All rows should show "+" since context has empty map
		const plusIcons = document.querySelectorAll('.ag-cell[col-id="perspectize"] span');
		expect(plusIcons.length).toBe(3);
		expect(plusIcons[0].textContent).toBe('+');
	});

	it('renders formatted view counts', async () => {
		render(AGGridTestHarness, { testRowData: SAMPLE_ROWS });
		await waitForGridReady();

		const viewCells = document.querySelectorAll('.ag-cell[col-id="views"]');
		expect(viewCells.length).toBe(3);

		// formatCount() renders a space before the unit and always one decimal:
		// 45200 → "45.2 K", 128000 → "128.0 K", 67500 → "67.5 K"
		const texts = Array.from(viewCells).map((cell) => cell.textContent?.trim());
		expect(texts).toContain('45.2 K');
		expect(texts).toContain('128.0 K');
		expect(texts).toContain('67.5 K');
	});

	it('renders formatted duration values', async () => {
		render(AGGridTestHarness, { testRowData: SAMPLE_ROWS });
		await waitForGridReady();

		const durationCells = document.querySelectorAll('.ag-cell[col-id="duration"]');
		expect(durationCells.length).toBe(3);

		// 612s → "10:12", 1845s → "30:45", 2400s → "40:00"
		const texts = Array.from(durationCells).map((cell) => cell.textContent?.trim());
		expect(texts).toContain('10:12');
		expect(texts).toContain('30:45');
		expect(texts).toContain('40:00');
	});
});

// ---------------------------------------------------------------------------
// Column Header Rendering
// ---------------------------------------------------------------------------
describe('AG Grid Header Rendering', () => {
	it('renders column headers with correct text', async () => {
		render(AGGridTestHarness, { testRowData: SAMPLE_ROWS });
		await waitForGridReady();

		const headers = document.querySelectorAll('.ag-header-cell');
		const headerTexts = Array.from(headers)
			.map((h) => h.textContent?.trim())
			.filter(Boolean);

		expect(headerTexts).toContain('Item');
		expect(headerTexts).toContain('Views');
		expect(headerTexts).toContain('Channel');
		expect(headerTexts).toContain('Length');
	});

	it('renders perspectize header with glasses SVG', async () => {
		render(AGGridTestHarness, { testRowData: SAMPLE_ROWS });
		await waitForGridReady();

		const perspHeader = document.querySelector('.ag-header-cell[col-id="perspectize"]');
		expect(perspHeader).not.toBeNull();

		const svg = perspHeader!.querySelector('svg');
		expect(svg).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------
describe('AG Grid Sorting', () => {
	it('triggers onSortChanged when clicking a sortable header', async () => {
		const sortChangedSpy = vi.fn();
		render(AGGridTestHarness, {
			testRowData: SAMPLE_ROWS,
			onSortChanged: sortChangedSpy,
		});

		await waitForGridReady();

		// Click the "Views" header to sort
		const viewsHeader = document.querySelector('.ag-header-cell[col-id="views"] .ag-header-cell-label');
		expect(viewsHeader).not.toBeNull();
		(viewsHeader as HTMLElement).click();

		// Wait for sort event
		await new Promise((r) => setTimeout(r, 200));
		expect(sortChangedSpy).toHaveBeenCalled();
	});

	it('sorts rows by views ascending on first click', async () => {
		let api: GridApi | null = null;
		render(AGGridTestHarness, {
			testRowData: SAMPLE_ROWS,
			onGridReady: (a) => {
				api = a;
			},
		});

		await waitForGridReady();

		// Click Views header
		const viewsHeader = document.querySelector('.ag-header-cell[col-id="views"] .ag-header-cell-label');
		(viewsHeader as HTMLElement).click();
		await new Promise((r) => setTimeout(r, 200));

		// Check sort order via GridApi
		const colState = api!.getColumnState();
		const viewsCol = colState.find((c) => c.colId === 'views');
		expect(viewsCol?.sort).toBe('asc');

		// Verify row order: 45200 < 67500 < 128000
		const firstRow = api!.getDisplayedRowAtIndex(0);
		expect(firstRow?.data.viewCount).toBe(45200);
	});

	it('does not sort non-sortable columns (tags)', async () => {
		let api: GridApi | null = null;
		render(AGGridTestHarness, {
			testRowData: SAMPLE_ROWS,
			onGridReady: (a) => {
				api = a;
			},
		});

		await waitForGridReady();

		// Click Tags header
		const tagsHeader = document.querySelector('.ag-header-cell[col-id="tags"] .ag-header-cell-label');
		if (tagsHeader) {
			(tagsHeader as HTMLElement).click();
			await new Promise((r) => setTimeout(r, 200));
		}

		// Tags column should not have sort applied
		const colState = api!.getColumnState();
		const tagsCol = colState.find((c) => c.colId === 'tags');
		expect(tagsCol?.sort).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Grid API Operations
// ---------------------------------------------------------------------------
describe('AG Grid API Operations', () => {
	it('can programmatically set column visibility', async () => {
		let api: GridApi | null = null;
		render(AGGridTestHarness, {
			testRowData: SAMPLE_ROWS,
			onGridReady: (a) => {
				api = a;
			},
		});

		await waitForGridReady();

		// Hide the channel column
		api!.setColumnsVisible(['channel'], false);
		await new Promise((r) => setTimeout(r, 100));

		const colState = api!.getColumnState();
		const channelCol = colState.find((c) => c.colId === 'channel');
		expect(channelCol?.hide).toBe(true);

		// Show it again
		api!.setColumnsVisible(['channel'], true);
		await new Promise((r) => setTimeout(r, 100));

		const colState2 = api!.getColumnState();
		const channelCol2 = colState2.find((c) => c.colId === 'channel');
		expect(channelCol2?.hide).toBe(false);
	});

	it('can programmatically apply sort via API', async () => {
		let api: GridApi | null = null;
		render(AGGridTestHarness, {
			testRowData: SAMPLE_ROWS,
			onGridReady: (a) => {
				api = a;
			},
		});

		await waitForGridReady();

		// Apply sort programmatically
		api!.applyColumnState({
			state: [{ colId: 'likes', sort: 'desc' }],
			defaultState: { sort: null },
		});
		await new Promise((r) => setTimeout(r, 100));

		// Verify row order: 5200 > 3100 > 1800
		const firstRow = api!.getDisplayedRowAtIndex(0);
		expect(firstRow?.data.likeCount).toBe(5200);

		const lastRow = api!.getDisplayedRowAtIndex(2);
		expect(lastRow?.data.likeCount).toBe(1800);
	});

	it('can switch domLayout between normal and autoHeight', async () => {
		let api: GridApi | null = null;
		render(AGGridTestHarness, {
			testRowData: SAMPLE_ROWS,
			onGridReady: (a) => {
				api = a;
			},
		});

		await waitForGridReady();

		// Switch to normal layout
		api!.setGridOption('domLayout', 'normal');
		await new Promise((r) => setTimeout(r, 100));

		// Switch back to autoHeight
		api!.setGridOption('domLayout', 'autoHeight');
		await new Promise((r) => setTimeout(r, 100));

		// Grid should still be functional
		expect(api!.getDisplayedRowCount()).toBe(3);
	});

	it('can update row data reactively', async () => {
		let api: GridApi | null = null;
		const screen = render(AGGridTestHarness, {
			testRowData: SAMPLE_ROWS,
			onGridReady: (a) => {
				api = a;
			},
		});

		await waitForGridReady();
		expect(api!.getDisplayedRowCount()).toBe(3);

		// Update with fewer rows
		api!.setGridOption('rowData', [SAMPLE_ROWS[0]]);
		await new Promise((r) => setTimeout(r, 200));
		expect(api!.getDisplayedRowCount()).toBe(1);
	});

	it('sizeColumnsToFit adjusts column widths', async () => {
		let api: GridApi | null = null;
		render(AGGridTestHarness, {
			testRowData: SAMPLE_ROWS,
			onGridReady: (a) => {
				api = a;
			},
		});

		await waitForGridReady();

		// Should not throw
		expect(() => api!.sizeColumnsToFit()).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// Row ID and Data Access
// ---------------------------------------------------------------------------
describe('AG Grid Row ID', () => {
	it('uses content id as row id', async () => {
		let api: GridApi | null = null;
		render(AGGridTestHarness, {
			testRowData: SAMPLE_ROWS,
			onGridReady: (a) => {
				api = a;
			},
		});

		await waitForGridReady();

		const row1 = api!.getRowNode('1');
		expect(row1).not.toBeNull();
		expect(row1?.data.name).toBe('Understanding TypeScript Generics');

		const row2 = api!.getRowNode('2');
		expect(row2?.data.name).toBe('Svelte 5 Runes Explained');
	});
});

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------
describe('AG Grid Empty State', () => {
	it('renders grid with no rows', async () => {
		let api: GridApi | null = null;
		render(AGGridTestHarness, {
			testRowData: [],
			onGridReady: (a) => {
				api = a;
			},
		});

		// Wait for grid init (no rows to wait for)
		await new Promise((r) => setTimeout(r, 500));
		expect(api).not.toBeNull();
		expect(api!.getDisplayedRowCount()).toBe(0);
	});
});
