import { tick } from 'svelte';
import { toast } from 'svelte-sonner';
import type { ContentItem } from '#lib/queries/content/index.js';
import type { PrintSpacing } from '#lib/components/PrintOptionsDialog.svelte';
import type { GridHandle } from '#lib/utils/gridHandle.svelte.js';
import { readExportTable, type ExportGridApi } from '#lib/utils/exportGrid.js';
import type { ExportTable } from '#lib/utils/exportTable.js';
import { copyLibraryTable, downloadLibraryCsv } from '#lib/utils/exportActions.js';
import { copyWithToast, downloadWithToast } from '#lib/utils/toast.js';
import { addLandscapePageStyle, removeLandscapePageStyle, runPrint } from '#lib/utils/printing.js';

export interface PrintList {
	table: ExportTable;
	title: string;
	spacing: PrintSpacing;
}

/**
 * The Library toolbar's export menu: CSV download, copy, and the two print modes.
 * The grid is read at click time, so the output matches what the toolbar shows.
 *
 * - As seen: prints the grid itself. `printingAsSeen` is true for the run, so the page keeps
 *   the grid mounted even though a Letter-width page matches the card-mode query.
 * - As a list: renders `printList` through PrintListView for the run.
 */
export function createLibraryExport({
	grid,
	normalDomLayout,
}: {
	grid: GridHandle<ContentItem>;
	/** The grid's resting layout; a print run restores this, not a fixed value. */
	normalDomLayout: () => 'autoHeight' | 'normal';
}) {
	let printingAsSeen = $state(false);
	let printOptionsOpen = $state(false);
	let printList = $state<PrintList | null>(null);

	function exportApi(): ExportGridApi | null {
		return grid.live() as unknown as ExportGridApi | null;
	}

	function reportPrintFailure(err: unknown) {
		toast.error(err instanceof Error ? `Could not print: ${err.message}` : 'Could not print');
	}

	return {
		get printingAsSeen() {
			return printingAsSeen;
		},
		get printOptionsOpen() {
			return printOptionsOpen;
		},
		set printOptionsOpen(open: boolean) {
			printOptionsOpen = open;
		},
		get printList() {
			return printList;
		},

		downloadCsv() {
			const api = exportApi();
			if (api) downloadWithToast(() => downloadLibraryCsv(api));
		},

		copy() {
			const api = exportApi();
			if (api) void copyWithToast(() => copyLibraryTable(api));
		},

		async printAsSeen() {
			const api = grid.api;
			if (!api) return;
			try {
				await runPrint('grid', {
					before: async () => {
						printingAsSeen = true;
						addLandscapePageStyle();
						api.setGridOption('domLayout', 'print');
						// AG Grid lays out the rows on a later frame; printing sooner can print a half-rendered grid.
						await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
						if (api.isDestroyed()) throw new Error('The table was closed before printing');
					},
					after: () => {
						printingAsSeen = false;
						removeLandscapePageStyle();
						if (!api.isDestroyed()) api.setGridOption('domLayout', normalDomLayout());
					},
				});
			} catch (err) {
				reportPrintFailure(err);
			}
		},

		async printAsList({ title, spacing }: { title: string; spacing: PrintSpacing }) {
			const api = grid.api;
			if (!api) return;
			try {
				const table = readExportTable(api as unknown as ExportGridApi, 'print');
				await runPrint('list', {
					before: async () => {
						printList = { table, title, spacing };
						await tick();
					},
					after: () => {
						printList = null;
					},
				});
			} catch (err) {
				printList = null;
				reportPrintFailure(err);
			}
		},
	};
}
