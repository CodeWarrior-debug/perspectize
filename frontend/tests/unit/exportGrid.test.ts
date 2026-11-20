import { describe, it, expect, vi } from 'vitest';
import type { ContentItem } from '$lib/queries/content';
import { isExportDisabled, readExportTable, type ExportGridApi } from '$lib/utils/exportGrid';

type Node = { data?: ContentItem };

function item(over: Partial<ContentItem>): ContentItem {
	return { id: 'x', name: 'n', url: null, ...over } as unknown as ContentItem;
}

function stubApi(
	columns: [string, string | undefined][],
	nodes: Node[],
	values: Record<string, unknown> = {},
	raw: Record<string, unknown> = {},
) {
	const getCellValue = vi.fn((p: { rowNode: unknown; colKey: string; useFormatter: boolean }) => {
		const node = p.rowNode as Node;
		const key = `${node.data?.id}:${p.colKey}`;
		return !p.useFormatter && key in raw ? raw[key] : values[key];
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

describe('readExportTable raw numbers in spreadsheet mode', () => {
	const cols: [string, string | undefined][] = [
		['item', 'Item'],
		['views', 'Views'],
		['percentLiked', '% Liked'],
		['boxOffice', 'Box office'],
		['duration', 'Length'],
		['myQuality', 'My quality'],
		['tmdbId', 'TMDB ID'],
		['genre', 'Genre'],
	];
	const nodes = [{ data: item({ id: 'a', name: 'A' }) }];
	const formatted = {
		'a:views': '1.2 M',
		'a:percentLiked': '0.8%',
		'a:boxOffice': '$1.2B',
		'a:duration': '2:41',
		'a:myQuality': '75',
		'a:tmdbId': '603',
		'a:genre': 'Drama',
	};
	const raw = {
		'a:views': 1234567,
		'a:percentLiked': 0.8,
		'a:boxOffice': 1200000000,
		'a:duration': '2:41',
		'a:myQuality': 7500,
		'a:tmdbId': 603,
		'a:genre': 'Drama',
	};

	it('exports plain numbers for quantity columns and keeps the formatted text for the rest', () => {
		const t = readExportTable(stubApi(cols, nodes, formatted, raw).api, 'spreadsheet');
		expect(t.rows[0].slice(0, 8)).toEqual(['A', '1234567', '0.8', '1200000000', '2:41', '75', '603', 'Drama']);
	});

	it('keeps the formatted text in print mode', () => {
		const t = readExportTable(stubApi(cols, nodes, formatted, raw).api, 'print');
		expect(t.rows[0]).toEqual(['A', '1.2 M', '0.8%', '$1.2B', '2:41', '75', '603', 'Drama']);
	});

	it('keeps a numeric duration formatted', () => {
		const api = stubApi(cols, nodes, formatted, { ...raw, 'a:duration': 161 }).api;
		expect(readExportTable(api, 'spreadsheet').rows[0][4]).toBe('2:41');
	});

	it('keeps a 0-10000 rating on the grid scale', () => {
		expect(readExportTable(stubApi(cols, nodes, formatted, raw).api, 'spreadsheet').rows[0][5]).toBe('75');
	});

	it('keeps a numeric ID formatted', () => {
		expect(readExportTable(stubApi(cols, nodes, formatted, raw).api, 'spreadsheet').rows[0][6]).toBe('603');
	});

	it('exports decimals and negatives without a formula guard', () => {
		const api = stubApi(cols, nodes, formatted, { ...raw, 'a:views': -12.5, 'a:boxOffice': 0.8 }).api;
		const row = readExportTable(api, 'spreadsheet').rows[0];
		expect(row[1]).toBe('-12.5');
		expect(row[3]).toBe('0.8');
	});

	it('falls back to the existing empty behaviour for a null raw value', () => {
		const api = stubApi(cols, nodes, { ...formatted, 'a:views': '\u2014' }, { ...raw, 'a:views': null }).api;
		expect(readExportTable(api, 'spreadsheet').rows[0][1]).toBe('');
	});

	it('falls back to the formatted text for a non-finite number', () => {
		const api = stubApi(cols, nodes, formatted, { ...raw, 'a:views': Number.NaN }).api;
		expect(readExportTable(api, 'spreadsheet').rows[0][1]).toBe('1.2 M');
	});

	it('reads the unformatted value only in spreadsheet mode', () => {
		const spreadsheet = stubApi(cols, nodes, formatted, raw);
		readExportTable(spreadsheet.api, 'spreadsheet');
		expect(spreadsheet.getCellValue).toHaveBeenCalledWith(
			expect.objectContaining({ colKey: 'views', useFormatter: false }),
		);
		const print = stubApi(cols, nodes, formatted, raw);
		readExportTable(print.api, 'print');
		expect(print.getCellValue).not.toHaveBeenCalledWith(expect.objectContaining({ useFormatter: false }));
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
