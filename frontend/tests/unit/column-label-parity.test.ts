import { describe, it, expect } from 'vitest';
import activityTableSource from '$lib/components/ActivityTable.svelte?raw';
import { DATA_COLUMNS, INTERNAL_COLUMNS, SORTABLE_COLUMNS } from '$lib/utils/grid-config';

/**
 * Gap #9 in the UI gap audit: the same column had different labels in the grid
 * header, the column picker, and the sort picker (e.g. publishDate was "Date" in
 * the grid but "Published" in both pickers; createdAt was "Date Added" in the
 * grid but "Date added"/"Created at" elsewhere). This locks the grid header down
 * as the canonical label and fails if a picker registry drifts from it again.
 */
function gridHeaderLabels(): Record<string, string> {
	const labels: Record<string, string> = {};
	// Each colDef in ActivityTable.svelte has `colId: '...'` immediately followed
	// (a few lines later) by `headerName: '...'` — pull both per block.
	const blocks = activityTableSource.split(/(?=colId:\s*')/g);
	for (const block of blocks) {
		const colId = block.match(/^colId:\s*'([^']+)'/)?.[1];
		const headerName = block.match(/headerName:\s*'([^']*)'/)?.[1];
		if (colId && headerName !== undefined && headerName !== '') {
			labels[colId] = headerName;
		}
	}
	return labels;
}

describe('column label parity', () => {
	const headerLabels = gridHeaderLabels();

	it('found grid header labels to compare against (sanity check the parser)', () => {
		expect(headerLabels.duration).toBe('Length');
		expect(headerLabels.publishDate).toBe('Date');
	});

	it('DATA_COLUMNS labels match the grid header for every shared colId', () => {
		for (const col of DATA_COLUMNS) {
			if (headerLabels[col.colId] !== undefined) {
				expect(col.label, `DATA_COLUMNS['${col.colId}']`).toBe(headerLabels[col.colId]);
			}
		}
	});

	it('INTERNAL_COLUMNS labels match the grid header for every shared colId', () => {
		for (const col of INTERNAL_COLUMNS) {
			if (headerLabels[col.colId] !== undefined) {
				expect(col.label, `INTERNAL_COLUMNS['${col.colId}']`).toBe(headerLabels[col.colId]);
			}
		}
	});

	it('SORTABLE_COLUMNS labels match the grid header for every shared colId', () => {
		for (const col of SORTABLE_COLUMNS) {
			if (headerLabels[col.colId] !== undefined) {
				expect(col.label, `SORTABLE_COLUMNS['${col.colId}']`).toBe(headerLabels[col.colId]);
			}
		}
	});
});
