import { describe, expect, it } from 'vitest';
import type { GridApi } from '@ag-grid-community/core';
import type { ContentItem } from '#lib/queries/content/index.js';
import {
	chartFormatter,
	chartHeaderTemplate,
	readChartRows,
	suppressChartKeyboard,
} from '#lib/components/library/columnCharts.svelte.js';

// The factory's reactive behaviour (icon on/off, picker switch, auto-close, keyboard open) is
// covered against a real grid in tests/browser/column-charts.test.ts; these pin the pure parts.

describe('chartHeaderTemplate', () => {
	it('adds a chart button named after the column, escaping quotes in the label', () => {
		const html = chartHeaderTemplate('boxOffice', 'Box "office"', false);
		expect(html).toContain('data-chart-col="boxOffice"');
		expect(html).toContain('aria-label="Chart Box &quot;office&quot;"');
		expect(html).not.toMatch(/<button[^>]* hidden>/);
	});

	it('starts the button hidden when asked', () => {
		expect(chartHeaderTemplate('budget', 'Budget', true)).toMatch(/<button[^>]* hidden>/);
	});

	it('keeps the stock label, filter and sort refs', () => {
		const html = chartHeaderTemplate('budget', 'Budget', false);
		for (const ref of ['eMenu', 'eFilterButton', 'eLabel', 'eText', 'eFilter', 'eSortIndicator']) {
			expect(html).toContain(`data-ref="${ref}"`);
		}
	});
});

describe('suppressChartKeyboard', () => {
	function headerCell(withButton: 'shown' | 'hidden' | 'none') {
		const cell = document.createElement('div');
		cell.className = 'ag-header-cell';
		if (withButton !== 'none') {
			const btn = document.createElement('button');
			btn.dataset.chartCol = 'budget';
			btn.hidden = withButton === 'hidden';
			cell.append(btn);
		}
		return cell;
	}
	const key = (target: EventTarget | null, k: string, shiftKey = false) => ({
		event: { target, key: k, shiftKey } as unknown as KeyboardEvent,
	});

	it('leaves keys on the chart button to the browser', () => {
		const btn = headerCell('shown').querySelector('button')!;
		expect(suppressChartKeyboard(key(btn, 'Enter'))).toBe(true);
	});

	it('lets Tab from the header cell into a showing button', () => {
		expect(suppressChartKeyboard(key(headerCell('shown'), 'Tab'))).toBe(true);
	});

	it('keeps the grid behaviour for Shift+Tab, a hidden button, no button, or other keys', () => {
		expect(suppressChartKeyboard(key(headerCell('shown'), 'Tab', true))).toBe(false);
		expect(suppressChartKeyboard(key(headerCell('hidden'), 'Tab'))).toBe(false);
		expect(suppressChartKeyboard(key(headerCell('none'), 'Tab'))).toBe(false);
		expect(suppressChartKeyboard(key(headerCell('shown'), 'Enter'))).toBe(false);
		expect(suppressChartKeyboard(key(null, 'Tab'))).toBe(false);
	});
});

type Node = { data: { name: string } | undefined };

function fakeApi({
	destroyed = false,
	rows = [] as { name: string; value: unknown }[],
	colDef = {} as Record<string, unknown>,
	hasColumn = true,
} = {}) {
	const nodes: Node[] = rows.map((r) => ({ data: { name: r.name } }));
	const column = { getColDef: () => colDef };
	return {
		isDestroyed: () => destroyed,
		getColumn: () => (hasColumn ? column : null),
		forEachNodeAfterFilterAndSort: (fn: (n: Node) => void) => {
			nodes.forEach(fn);
			fn({ data: undefined }); // a group/blank node is skipped
		},
		getCellValue: ({ rowNode }: { rowNode: Node }) => rows[nodes.indexOf(rowNode)]?.value,
	} as unknown as GridApi<ContentItem>;
}

describe('readChartRows', () => {
	it('is null without a live grid or column', () => {
		expect(readChartRows(null, 'budget')).toBeNull();
		expect(readChartRows(fakeApi({ destroyed: true }), 'budget')).toBeNull();
		expect(readChartRows(fakeApi({ hasColumn: false }), 'budget')).toBeNull();
	});

	it('charts finite numbers, counts every shown row, and keeps names parallel to values', () => {
		const api = fakeApi({
			rows: [
				{ name: 'A', value: 10 },
				{ name: 'B', value: null },
				{ name: 'C', value: Number.NaN },
				{ name: 'D', value: 30 },
			],
		});
		const out = readChartRows(api, 'budget')!;
		expect(out.values).toEqual([10, 30]);
		expect(out.names).toEqual(['A', 'D']);
		expect(out.total).toBe(4);
	});

	it('reads duration through its filter value when the cell shows text', () => {
		const api = fakeApi({
			rows: [{ name: 'A', value: '1:30' }],
			colDef: { filterValueGetter: () => 90 },
		});
		expect(readChartRows(api, 'duration')!.values).toEqual([90]);
	});
});

describe('chartFormatter', () => {
	it('labels duration as h:mm', () => {
		expect(chartFormatter(null, 'duration')(90 * 60)).toBe('1:30');
	});

	it("uses the column's own formatter", () => {
		const api = fakeApi({ colDef: { valueFormatter: ({ value }: { value: number }) => `$${value}` } });
		expect(chartFormatter(api, 'budget')(5)).toBe('$5');
	});

	it('falls back to two decimals', () => {
		expect(chartFormatter(null, 'budget')(1.23456)).toBe('1.23');
	});
});
