/**
 * Keeps rows where the user last saw them when the same list is refetched.
 *
 * The default server order (updatedAt desc) can return an edited row first on the next fetch of
 * the same list, so it jumps out of view. The order is remembered per list key: a new sort,
 * filter, search or page starts again from the server order.
 */
export type RowWithId = { id: string | number };

/**
 * Rows already in `ids` follow that order. Rows not in `ids` (newly added content) lead, in server
 * order, matching the default sort. Rows missing from `rows` are dropped.
 */
export function keepRowOrder<T extends RowWithId>(rows: T[], ids: string[]): T[] {
	const position = new Map(ids.map((id, index) => [id, index]));
	const fresh = rows.filter((row) => !position.has(String(row.id)));
	const kept = rows
		.filter((row) => position.has(String(row.id)))
		.sort((a, b) => (position.get(String(a.id)) ?? 0) - (position.get(String(b.id)) ?? 0));
	return [...fresh, ...kept];
}

/**
 * Holds the last displayed order. Kept outside reactive state so it can be read and written
 * from a $derived without re-triggering it.
 */
export function createRowOrderMemory() {
	let listKey: string | null = null;
	let ids: string[] = [];

	return {
		/**
		 * Rows in display order for the list identified by `key`. Placeholder data (the previous
		 * list, shown while the next one loads) is returned unchanged and neither reads nor records
		 * the order.
		 */
		apply<T extends RowWithId>(key: string, rows: T[], placeholder: boolean): T[] {
			if (placeholder) return rows;
			const ordered = key === listKey ? keepRowOrder(rows, ids) : rows;
			listKey = key;
			ids = ordered.map((row) => String(row.id));
			return ordered;
		},
	};
}
