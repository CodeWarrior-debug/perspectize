/**
 * Turns an export table into the text a spreadsheet reads: RFC 4180 CSV for a file download and
 * tab-separated text for the clipboard, plus the browser download of a CSV file.
 */
import type { ExportTable } from './exportTable';

const CSV_ROW_BREAK = '\r\n';
const NEEDS_QUOTING = /[",\r\n]/;
const UTF8_BOM = '﻿';

function csvCell(text: string): string {
	return NEEDS_QUOTING.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Header row first, rows separated by CRLF; cells with a comma, quote or line break are quoted. */
export function serializeCsv(table: ExportTable): string {
	return [table.headers, ...table.rows].map((row) => row.map(csvCell).join(',')).join(CSV_ROW_BREAK);
}

function tsvCell(text: string): string {
	const flat = text.replace(/[\t\r\n]+/g, ' ');
	// A pasted cell holding a double quote can read as the start of a quoted field and swallow the
	// tabs and rows after it, so such a cell is quoted with its inner quotes doubled.
	return flat.includes('"') ? `"${flat.replaceAll('"', '""')}"` : flat;
}

/** Tab-separated, one row per line. A tab or line break inside a cell would split it, so each becomes one space. */
export function serializeTsv(table: ExportTable): string {
	return [table.headers, ...table.rows].map((row) => row.map(tsvCell).join('\t') + '\n').join('');
}

function pad2(n: number): string {
	return String(n).padStart(2, '0');
}

/** `perspectize-library-YYYY-MM-DD.csv` in the local date. */
export function csvFileName(now: Date): string {
	return `perspectize-library-${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}.csv`;
}

/** Saves `csv` as a UTF-8 file with a byte-order mark, so Excel reads accented and non-Latin text correctly. */
export function downloadCsv(csv: string, fileName: string, doc: Document = document): void {
	const url = URL.createObjectURL(new Blob([UTF8_BOM, csv], { type: 'text/csv;charset=utf-8' }));
	const anchor = doc.createElement('a');
	anchor.href = url;
	anchor.download = fileName;
	anchor.style.display = 'none';
	doc.body.appendChild(anchor);
	try {
		anchor.click();
	} finally {
		anchor.remove();
		URL.revokeObjectURL(url);
	}
}
