/** The Library's CSV download and copy-for-spreadsheet actions, built on the grid's export table. */
import { readExportTable, type ExportGridApi } from './exportGrid';
import { ClipboardBlockedError } from './toast';
import { csvFileName, downloadCsv, serializeCsv, serializeTsv } from './exportSerialize';

export function downloadLibraryCsv(api: ExportGridApi, now: Date = new Date()): void {
	downloadCsv(serializeCsv(readExportTable(api, 'spreadsheet')), csvFileName(now));
}

/** Resolves to the number of data rows copied; rejects with `ClipboardBlockedError` when the clipboard refuses the write. */
export async function copyLibraryTable(
	api: ExportGridApi,
	clipboard: Pick<Clipboard, 'writeText'> = navigator.clipboard,
): Promise<number> {
	const table = readExportTable(api, 'spreadsheet');
	const text = serializeTsv(table);
	try {
		await clipboard.writeText(text);
	} catch (err) {
		throw new ClipboardBlockedError({ cause: err });
	}
	return table.rows.length;
}
