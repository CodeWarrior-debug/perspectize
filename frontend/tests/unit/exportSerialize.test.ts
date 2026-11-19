import { describe, expect, it, vi } from 'vitest';
import { csvFileName, downloadCsv, serializeCsv, serializeTsv } from '$lib/utils/exportSerialize';
import type { ExportTable } from '$lib/utils/exportTable';

function table(headers: string[], rows: string[][]): ExportTable {
	return { columnIds: headers, headers, rows, rowUrls: rows.map(() => null) };
}

describe('serializeCsv', () => {
	it('quotes commas, quotes and line breaks and puts CRLF between rows', () => {
		const csv = serializeCsv(table(['h1', 'h2', 'h3'], [['a,b', 'say "hi"', 'l1\nl2']]));
		expect(csv).toBe('h1,h2,h3\r\n"a,b","say ""hi""","l1\nl2"');
	});

	it('writes the header row first and leaves plain cells unquoted', () => {
		expect(serializeCsv(table(['Title'], [['x'], ['y']]))).toBe('Title\r\nx\r\ny');
	});

	it('quotes a cell holding a bare carriage return', () => {
		expect(serializeCsv(table(['t'], [['a\rb']]))).toBe('t\r\n"a\rb"');
	});

	it('passes accented and non-Latin text through unchanged', () => {
		expect(serializeCsv(table(['t'], [['Crème brûlée'], ['日本語']]))).toBe('t\r\nCrème brûlée\r\n日本語');
	});
});

describe('serializeTsv', () => {
	it('turns tabs and line breaks inside cells into single spaces and ends each row with a newline', () => {
		expect(serializeTsv(table(['a', 'b'], [['x\ty', 'l1\r\nl2']]))).toBe('a\tb\nx y\tl1 l2\n');
	});
});

describe('csvFileName', () => {
	it('uses the local date', () => {
		expect(csvFileName(new Date(2026, 10, 14))).toBe('perspectize-library-2026-11-14.csv');
	});

	it('zero-pads a single-digit month and day', () => {
		expect(csvFileName(new Date(2026, 8, 5))).toBe('perspectize-library-2026-09-05.csv');
	});
});

describe('downloadCsv', () => {
	it('downloads a BOM-prefixed UTF-8 blob through a temporary anchor', async () => {
		let blob: Blob | undefined;
		URL.createObjectURL = vi.fn((b: Blob) => {
			blob = b;
			return 'blob:x';
		});
		URL.revokeObjectURL = vi.fn();
		const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
			expect(this.download).toBe('f.csv');
			expect(document.body.contains(this)).toBe(true);
		});

		downloadCsv('a,b', 'f.csv');

		expect(click).toHaveBeenCalledOnce();
		expect(document.querySelector('a[download]')).toBeNull();
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
		const bytes = await new Promise<Uint8Array>((resolve) => {
			const reader = new FileReader();
			reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
			reader.readAsArrayBuffer(blob!);
		});
		expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
		click.mockRestore();
	});
});
