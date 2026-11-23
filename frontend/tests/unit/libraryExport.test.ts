import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GridApi, GridReadyEvent } from '@ag-grid-community/core';
import type { ContentItem } from '#lib/queries/content/index.js';
import { createGridHandle } from '#lib/utils/gridHandle.svelte.js';

const printing = vi.hoisted(() => ({
	runPrint: vi.fn(),
	addLandscapePageStyle: vi.fn(),
	removeLandscapePageStyle: vi.fn(),
}));
vi.mock('#lib/utils/printing.js', () => printing);

const exportActions = vi.hoisted(() => ({ downloadLibraryCsv: vi.fn(), copyLibraryTable: vi.fn() }));
vi.mock('#lib/utils/exportActions.js', () => exportActions);

const exportGrid = vi.hoisted(() => ({ readExportTable: vi.fn() }));
vi.mock('#lib/utils/exportGrid.js', () => exportGrid);

const toasts = vi.hoisted(() => ({
	downloadWithToast: vi.fn((fn: () => void) => fn()),
	copyWithToast: vi.fn(async (fn: () => Promise<void> | void) => fn()),
}));
vi.mock('#lib/utils/toast.js', () => toasts);

const sonner = vi.hoisted(() => ({ toast: { error: vi.fn() } }));
vi.mock('svelte-sonner', () => sonner);

const { createLibraryExport } = await import('#lib/components/library/libraryExport.svelte.js');

type Hooks = { before: () => Promise<void>; after: () => void };

function fakeApi() {
	let destroyed = false;
	const api = {
		isDestroyed: () => destroyed,
		setGridOption: vi.fn(),
		destroy: () => (destroyed = true),
	};
	return api as unknown as GridApi<ContentItem> & { setGridOption: ReturnType<typeof vi.fn>; destroy: () => void };
}

function setup({ withGrid = true, layout = 'normal' as 'normal' | 'autoHeight' } = {}) {
	const grid = createGridHandle<ContentItem>();
	const api = fakeApi();
	if (withGrid) grid.options().onGridReady?.({ api } as unknown as GridReadyEvent<ContentItem>);
	const exporter = createLibraryExport({ grid, normalDomLayout: () => layout });
	return { grid, api, exporter };
}

/** runPrint stand-in that lets a test look at state between `before` and `after`. */
function printRunCapturing(during: () => void) {
	printing.runPrint.mockImplementationOnce(async (_mode: string, hooks: Hooks) => {
		try {
			await hooks.before();
		} catch (err) {
			hooks.after();
			throw err;
		}
		during();
		hooks.after();
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
		cb(0);
		return 0;
	});
});

describe('createLibraryExport', () => {
	it('starts idle: not printing, no options dialog, no print list', () => {
		const { exporter } = setup();
		expect(exporter.printingAsSeen).toBe(false);
		expect(exporter.printOptionsOpen).toBe(false);
		expect(exporter.printList).toBeNull();
	});

	it('opens and closes the print options dialog', () => {
		const { exporter } = setup();
		exporter.printOptionsOpen = true;
		expect(exporter.printOptionsOpen).toBe(true);
		exporter.printOptionsOpen = false;
		expect(exporter.printOptionsOpen).toBe(false);
	});

	describe('CSV and copy', () => {
		it('read the live grid', async () => {
			const { exporter, api } = setup();
			exporter.downloadCsv();
			expect(exportActions.downloadLibraryCsv).toHaveBeenCalledWith(api);
			exporter.copy();
			await Promise.resolve();
			expect(exportActions.copyLibraryTable).toHaveBeenCalledWith(api);
		});

		it('do nothing without a grid (card mode)', () => {
			const { exporter } = setup({ withGrid: false });
			exporter.downloadCsv();
			exporter.copy();
			expect(toasts.downloadWithToast).not.toHaveBeenCalled();
			expect(toasts.copyWithToast).not.toHaveBeenCalled();
		});

		it('do nothing once the grid is destroyed', () => {
			const { exporter, api } = setup();
			api.destroy();
			exporter.downloadCsv();
			expect(toasts.downloadWithToast).not.toHaveBeenCalled();
		});
	});

	describe('print as seen', () => {
		it('keeps the grid mounted in print layout for the run, then restores the resting layout', async () => {
			const { exporter, api } = setup({ layout: 'autoHeight' });
			let during: { printing: boolean; layout: unknown } | null = null;
			printRunCapturing(() => {
				during = { printing: exporter.printingAsSeen, layout: api.setGridOption.mock.lastCall?.[1] };
			});
			await exporter.printAsSeen();
			expect(during).toEqual({ printing: true, layout: 'print' });
			expect(printing.addLandscapePageStyle).toHaveBeenCalledOnce();
			expect(exporter.printingAsSeen).toBe(false);
			expect(printing.removeLandscapePageStyle).toHaveBeenCalledOnce();
			expect(api.setGridOption).toHaveBeenLastCalledWith('domLayout', 'autoHeight');
		});

		it('reports a grid closed before printing, and does not touch the destroyed grid', async () => {
			const { exporter, api } = setup();
			vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
				api.destroy();
				cb(0);
				return 0;
			});
			printRunCapturing(() => {});
			await exporter.printAsSeen();
			expect(sonner.toast.error).toHaveBeenCalledWith('Could not print: The table was closed before printing');
			expect(exporter.printingAsSeen).toBe(false);
			expect(api.setGridOption).toHaveBeenCalledTimes(1); // only the 'print' layout, no restore
		});

		it('does nothing without a grid', async () => {
			const { exporter } = setup({ withGrid: false });
			await exporter.printAsSeen();
			expect(printing.runPrint).not.toHaveBeenCalled();
		});
	});

	describe('print as a list', () => {
		it('shows the print list for the run, then clears it', async () => {
			const { exporter } = setup();
			const table = { headers: ['Item'], rows: [['A']] };
			exportGrid.readExportTable.mockReturnValueOnce(table);
			let during: unknown = null;
			printRunCapturing(() => (during = exporter.printList));
			await exporter.printAsList({ title: 'My list', spacing: 'roomy' });
			expect(during).toEqual({ table, title: 'My list', spacing: 'roomy' });
			expect(printing.runPrint).toHaveBeenCalledWith('list', expect.anything());
			expect(exporter.printList).toBeNull();
		});

		it('clears the list and reports the error when the grid cannot be read', async () => {
			const { exporter } = setup();
			exportGrid.readExportTable.mockImplementationOnce(() => {
				throw new Error('no rows');
			});
			await exporter.printAsList({ title: 'x', spacing: 'compact' });
			expect(exporter.printList).toBeNull();
			expect(sonner.toast.error).toHaveBeenCalledWith('Could not print: no rows');
		});

		it('says "Could not print" for a non-Error failure', async () => {
			const { exporter } = setup();
			printing.runPrint.mockRejectedValueOnce('nope');
			exportGrid.readExportTable.mockReturnValueOnce({ headers: [], rows: [] });
			await exporter.printAsList({ title: 'x', spacing: 'compact' });
			expect(sonner.toast.error).toHaveBeenCalledWith('Could not print');
		});
	});
});
