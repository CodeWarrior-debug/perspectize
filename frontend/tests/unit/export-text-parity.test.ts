import { describe, it, expect } from 'vitest';
import contentLibrarySource from '#lib/components/library/ContentLibrary.svelte?raw';
import { EXPORT_EXCLUDED_COLIDS, RENDERED_TEXT_COLIDS } from '#lib/utils/exportTable.js';
// The parity check reads only the source text; this import makes the test fail first until the grid reader exists.
import { readExportTable } from '#lib/utils/exportGrid.js';

describe('export text parity', () => {
	it('knows the text of every renderer-only column', () => {
		expect(typeof readExportTable).toBe('function');
		const known: string[] = [...RENDERED_TEXT_COLIDS, ...EXPORT_EXCLUDED_COLIDS];
		const blocks = contentLibrarySource.split("colId: '").slice(1);
		const rendererOnly = blocks
			.filter((b) => b.includes('cellRenderer:') && !/^\s*(valueGetter|field):/m.test(b))
			.map((b) => b.slice(0, b.indexOf("'")));
		expect(rendererOnly.length).toBeGreaterThan(0);
		expect(rendererOnly.filter((id) => !known.includes(id))).toEqual([]);
	});
});
