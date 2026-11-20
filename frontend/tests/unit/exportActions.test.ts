import { describe, expect, it, vi } from 'vitest';
import { ClipboardBlockedError } from '#lib/utils/toast.js';
import { copyLibraryTable, downloadLibraryCsv } from '#lib/utils/exportActions.js';
import type { ExportGridApi } from '#lib/utils/exportGrid.js';

function fakeApi(titles: string[]): ExportGridApi {
	return {
		getAllDisplayedColumns: () => [{ getColId: () => 'item', getColDef: () => ({ headerName: 'Item' }) }],
		forEachNodeAfterFilterAndSort: (cb) => {
			for (const name of titles) cb({ data: { name, displayTitle: name, url: `https://e.com/${name}` } as never });
		},
		getCellValue: () => '',
	};
}

describe('copyLibraryTable', () => {
	it('writes the TSV with the Link column and resolves to the row count', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		await expect(copyLibraryTable(fakeApi(['a', 'b']), { writeText })).resolves.toBe(2);
		expect(writeText).toHaveBeenCalledWith('Item\tLink\na\thttps://e.com/a\nb\thttps://e.com/b\n');
	});

	it('rejects with ClipboardBlockedError when the clipboard refuses', async () => {
		const writeText = vi.fn().mockRejectedValue(new Error('denied'));
		await expect(copyLibraryTable(fakeApi(['a']), { writeText })).rejects.toBeInstanceOf(ClipboardBlockedError);
	});

	it('lets a table-building failure through as a plain error', async () => {
		const api = fakeApi(['a']);
		api.getAllDisplayedColumns = () => {
			throw new Error('grid gone');
		};
		const writeText = vi.fn();
		const err = await copyLibraryTable(api, { writeText }).catch((e) => e);
		expect(err).toBeInstanceOf(Error);
		expect(err).not.toBeInstanceOf(ClipboardBlockedError);
		expect(writeText).not.toHaveBeenCalled();
	});
});

describe('downloadLibraryCsv', () => {
	it('downloads the CSV under the dated file name', () => {
		let blob: Blob | undefined;
		URL.createObjectURL = vi.fn((b: Blob) => ((blob = b), 'blob:y'));
		URL.revokeObjectURL = vi.fn();
		let name = '';
		const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
			name = this.download;
		});
		downloadLibraryCsv(fakeApi(['a']), new Date(2026, 10, 14));
		expect(name).toBe('perspectize-library-2026-11-14.csv');
		expect(blob?.size).toBeGreaterThan(3);
		click.mockRestore();
	});
});
