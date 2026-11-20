/**
 * Row order across refetches of the Library list. These pin each state ActivityTable relies on:
 * a refetch of the same list keeps rows in place, new rows lead, removed rows drop out, a different
 * list starts from the server order, and placeholder data is neither applied nor recorded.
 */
import { describe, it, expect } from 'vitest';
import { createRowOrderMemory } from '#lib/utils/rowOrder.js';

type Row = { id: string; name: string };
const row = (id: string): Row => ({ id, name: `row ${id}` });
const ids = (rows: Row[]) => rows.map((r) => r.id);

describe('createRowOrderMemory', () => {
	it('keeps rows in their displayed order when the same list is refetched with a new server order', () => {
		const memory = createRowOrderMemory();
		memory.apply('list-a', [row('a'), row('b'), row('c')], false);

		// The edited row "b" now sorts first on the server.
		const refetched = memory.apply('list-a', [row('b'), row('a'), row('c')], false);

		expect(ids(refetched)).toEqual(['a', 'b', 'c']);
	});

	it('puts newly added rows first, in server order, and keeps the existing rows in place', () => {
		const memory = createRowOrderMemory();
		memory.apply('list-a', [row('a'), row('b')], false);

		const refetched = memory.apply('list-a', [row('n2'), row('a'), row('n1'), row('b')], false);

		expect(ids(refetched)).toEqual(['n2', 'n1', 'a', 'b']);
	});

	it('drops rows that are no longer in the list', () => {
		const memory = createRowOrderMemory();
		memory.apply('list-a', [row('a'), row('b'), row('c')], false);

		const refetched = memory.apply('list-a', [row('c'), row('a')], false);

		expect(ids(refetched)).toEqual(['a', 'c']);
	});

	it('uses the server order when the list key changes (sort, filter, search or page)', () => {
		const memory = createRowOrderMemory();
		memory.apply('list-a', [row('a'), row('b'), row('c')], false);

		const sorted = memory.apply('list-b', [row('c'), row('b'), row('a')], false);

		expect(ids(sorted)).toEqual(['c', 'b', 'a']);
	});

	it('returns placeholder data unchanged and does not record its order', () => {
		const memory = createRowOrderMemory();
		memory.apply('list-a', [row('a'), row('b')], false);

		// The previous list is shown while list-b loads: its order must not become the reference.
		const placeholder = memory.apply('list-b', [row('b'), row('a')], true);
		expect(ids(placeholder)).toEqual(['b', 'a']);

		// list-b's real data then uses the server order, because list-a was the last recorded list.
		const loaded = memory.apply('list-b', [row('a'), row('b')], false);
		expect(ids(loaded)).toEqual(['a', 'b']);
	});

	it('uses the server order on the first load', () => {
		const memory = createRowOrderMemory();

		const first = memory.apply('list-a', [row('x'), row('y')], false);

		expect(ids(first)).toEqual(['x', 'y']);
	});
});
