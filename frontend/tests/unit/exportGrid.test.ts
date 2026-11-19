import { describe, it, expect, vi } from 'vitest';
import type { ContentItem } from '$lib/queries/content';
import { isExportDisabled, readExportTable, type ExportGridApi } from '$lib/utils/exportGrid';

type Node = { data?: ContentItem };

function item(over: Partial<ContentItem>): ContentItem {
	return { id: 'x', name: 'n', url: null, ...over } as unknown as ContentItem;
}

function stubApi(columns: [string, string | undefined][], nodes: Node[], values: Record<string, unknown> = {}) {
	const getCellValue = vi.fn((p: { rowNode: unknown; colKey: string; useFormatter: boolean }) => {
		const node = p.rowNode as Node;
		return values[`${node.data?.id}:${p.colKey}`];
	});
	const api: ExportGridApi = {
		getAllDisplayedColumns: () =>
			columns.map(([id, headerName]) => ({ getColId: () => id, getColDef: () => ({ headerName }) })),
		forEachNodeAfterFilterAndSort: (cb) => nodes.forEach((n) => cb(n)),
		getCellValue,
	};
	return { api, getCellValue };
}

describe('readExportTable', () => {
	const columns: [string, string | undefined][] = [
		['perspectize', ''],
		['item', 'Item'],
		['views', 'Views'],
	];

	it('drops the excluded and headerless columns', () => {
		const { api } = stubApi(columns, [{ data: item({ id: 'a', name: 'A' }) }]);
		const t = readExportTable(api, 'print');
		expect(t.columnIds).toEqual(['item', 'views']);
		expect(t.headers).toEqual(['Item', 'Views']);
	});

	it('drops an excluded colId even with a header', () => {
		const { api } = stubApi(
			[
				['perspectize', 'Act'],
				['views', 'Views'],
			],
			[],
		);
		expect(readExportTable(api, 'print').columnIds).toEqual(['views']);
	});

	it('drops a column with an empty or missing header', () => {
		const { api } = stubApi(
			[
				['a', ''],
				['b', undefined],
				['c', 'C'],
			],
			[],
		);
		expect(readExportTable(api, 'print').columnIds).toEqual(['c']);
	});

	it('follows grid order and skips nodes without data', () => {
		const { api } = stubApi(
			columns,
			[{ data: item({ id: 'b', name: 'B' }) }, {}, { data: item({ id: 'a', name: 'A' }) }],
			{ 'b:views': 5, 'a:views': 7 },
		);
		expect(readExportTable(api, 'print').rows).toEqual([
			['B', '5'],
			['A', '7'],
		]);
	});

	it('reads grid values with the formatter on', () => {
		const { api, getCellValue } = stubApi(columns, [{ data: item({ id: 'a' }) }]);
		readExportTable(api, 'print');
		expect(getCellValue).toHaveBeenCalledWith(expect.objectContaining({ colKey: 'views', useFormatter: true }));
	});

	it('passes the mode through', () => {
		const nodes = [{ data: item({ id: 'a', url: 'https://x.test' }) }];
		const sheet = readExportTable(stubApi(columns, nodes).api, 'spreadsheet');
		expect(sheet.columnIds).toContain('link');
		expect(sheet.rows[0].at(-1)).toBe('https://x.test');
		const print = readExportTable(stubApi(columns, nodes).api, 'print');
		expect(print.columnIds).not.toContain('link');
	});
});

describe('isExportDisabled', () => {
	const ready = { gridReady: true, loading: false, displayedRows: 3 };

	it('is enabled when the grid is ready and rows are displayed', () => {
		expect(isExportDisabled(ready)).toBe(false);
	});

	it('is disabled until the grid is ready', () => {
		expect(isExportDisabled({ ...ready, gridReady: false })).toBe(true);
	});

	it('is disabled while loading', () => {
		expect(isExportDisabled({ ...ready, loading: true })).toBe(true);
	});

	it('is disabled with zero displayed rows, including a filter that hides every loaded row', () => {
		expect(isExportDisabled({ ...ready, displayedRows: 0 })).toBe(true);
	});
});
