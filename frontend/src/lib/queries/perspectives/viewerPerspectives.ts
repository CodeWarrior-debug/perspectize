import { MAX_PERSPECTIVES_PER_LIST, type PerspectiveItem } from './index';
import { useMyPerspectives } from './useMyPerspectives';

/**
 * The viewer's perspectives grouped per content item. A viewer may hold more than one
 * perspective on an item (ADR 0002's two sharing slots), so each item maps to a list,
 * most recently updated first. Callers that edit one perspective take the first entry.
 */
export function groupPerspectivesByContent(items: PerspectiveItem[]): Map<string, PerspectiveItem[]> {
	const map = new Map<string, PerspectiveItem[]>();
	for (const p of items) {
		if (!p.contentID) continue;
		const list = map.get(p.contentID);
		if (list) list.push(p);
		else map.set(p.contentID, [p]);
	}
	for (const list of map.values()) {
		list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
	}
	return map;
}

/**
 * The viewer's perspectives per content item, from the shared by-user query (one request,
 * one key). `truncated` is true when the page is full: the backend caps the list at
 * MAX_PERSPECTIVES_PER_LIST, so an item past the cap would read as having no perspective.
 */
export function useViewerPerspectives(userId: () => number | null) {
	const query = useMyPerspectives(userId);
	const items = (): PerspectiveItem[] => query.data?.perspectives?.items ?? [];
	return {
		query,
		/** Recomputed on each read; read it inside a `$derived` so it is computed once per change. */
		get byContent(): Map<string, PerspectiveItem[]> {
			return groupPerspectivesByContent(items());
		},
		get truncated(): boolean {
			return items().length >= MAX_PERSPECTIVES_PER_LIST;
		},
	};
}
