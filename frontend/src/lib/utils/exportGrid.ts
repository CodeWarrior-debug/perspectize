/**
 * Reads the Library's export table from the AG Grid API: the visible, headed data columns and the
 * rows in the grid's current filter and sort order.
 */
import type { ContentItem } from '#lib/queries/content/index.js';
import {
	EXPORT_EXCLUDED_COLIDS,
	buildExportTable,
	exportCellText,
	spreadsheetNumberText,
	type ExportColumn,
	type ExportMode,
	type ExportTable,
} from './exportTable';

export interface ExportGridApi {
	getAllDisplayedColumns(): { getColId(): string; getColDef(): { headerName?: string } }[];
	forEachNodeAfterFilterAndSort(cb: (node: { data?: ContentItem }) => void): void;
	getCellValue(p: { rowNode: unknown; colKey: string; useFormatter: boolean }): unknown;
}

export function readExportTable(api: ExportGridApi, mode: ExportMode): ExportTable {
	const excluded: readonly string[] = EXPORT_EXCLUDED_COLIDS;
	const columns: ExportColumn[] = [];
	for (const col of api.getAllDisplayedColumns()) {
		const colId = col.getColId();
		const header = col.getColDef().headerName;
		if (excluded.includes(colId) || !header) continue;
		columns.push({ colId, header });
	}

	const rows: ContentItem[] = [];
	const nodes = new Map<ContentItem, unknown>();
	api.forEachNodeAfterFilterAndSort((node) => {
		if (!node.data) return;
		rows.push(node.data);
		nodes.set(node.data, node);
	});

	return buildExportTable({
		columns,
		rows,
		mode,
		cellText: (row, colId) => {
			const rowNode = nodes.get(row);
			if (mode === 'spreadsheet') {
				const number = spreadsheetNumberText(colId, api.getCellValue({ rowNode, colKey: colId, useFormatter: false }));
				if (number !== null) return number;
			}
			return exportCellText(row, colId, api.getCellValue({ rowNode, colKey: colId, useFormatter: true }));
		},
	});
}

/** Export needs a ready grid with at least one displayed (post-filter) row, and no fetch in flight. */
export function isExportDisabled(state: { gridReady: boolean; loading: boolean; displayedRows: number }): boolean {
	return !state.gridReady || state.loading || state.displayedRows === 0;
}
