/** Option C genre tree helpers (ADR 0006), ported from the picker preview. */
export interface GenreInput {
	id: string;
	name: string;
	parentId: string | null;
}

export interface GenreNode extends GenreInput {
	path: string[];
	children: GenreNode[];
}

/** Lowercase, accents removed, punctuation collapsed: "Forró" → "forro", "Hip-Hop/Rap" → "hip hop rap". */
export function normalizeGenreText(s: string): string {
	return s
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9&]+/g, ' ')
		.trim();
}

const byName = (a: GenreNode, b: GenreNode) => a.name.localeCompare(b.name);

export function buildGenreTree(genres: readonly GenreInput[]): GenreNode[] {
	const nodes = new Map<string, GenreNode>();
	for (const g of genres) nodes.set(g.id, { id: g.id, name: g.name, parentId: g.parentId, path: [], children: [] });
	const roots: GenreNode[] = [];
	for (const n of nodes.values()) {
		const parent = n.parentId ? nodes.get(n.parentId) : undefined;
		(parent ? parent.children : roots).push(n);
	}
	const finish = (list: GenreNode[], prefix: string[]) => {
		list.sort(byName);
		for (const n of list) {
			n.path = [...prefix, n.name];
			finish(n.children, n.path);
		}
	};
	finish(roots, []);
	return roots;
}

/** Nodes whose name matches, plus every ancestor of a match. A blank query returns the tree. */
export function filterGenreTree(roots: GenreNode[], query: string): GenreNode[] {
	const q = normalizeGenreText(query);
	if (!q) return roots;
	const walk = (list: GenreNode[]): GenreNode[] =>
		list.flatMap((n) => {
			const kids = walk(n.children);
			return normalizeGenreText(n.name).includes(q) || kids.length ? [{ ...n, children: kids }] : [];
		});
	return walk(roots);
}

export function flattenGenres(roots: GenreNode[]): Map<string, GenreNode> {
	const out = new Map<string, GenreNode>();
	const walk = (list: GenreNode[]) => {
		for (const n of list) {
			out.set(n.id, n);
			walk(n.children);
		}
	};
	walk(roots);
	return out;
}

export const RECENT_GENRES_KEY = 'perspectize:recent-genres';
export const MAX_RECENT_GENRES = 5;

export function pushRecent(recent: readonly string[], id: string): string[] {
	return [id, ...recent.filter((r) => r !== id)].slice(0, MAX_RECENT_GENRES);
}

/** Per-viewer convenience only; empty when storage is blocked or garbled. */
export function loadRecentGenres(): string[] {
	try {
		const v: unknown = JSON.parse(localStorage.getItem(RECENT_GENRES_KEY) ?? '[]');
		return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENT_GENRES) : [];
	} catch {
		return [];
	}
}

export function saveRecentGenres(ids: readonly string[]): void {
	try {
		localStorage.setItem(RECENT_GENRES_KEY, JSON.stringify(ids));
	} catch {
		// storage blocked: Recent just won't persist
	}
}

/** Mirror of the backend rule (the UPDATE in GormMusicGenreRepository is the authority). */
export const GENRE_CHANGE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function canChangeGenre(
	track: { genreId: string | null; addedByUserID: string; createdAt: string },
	viewerId: string | null,
	now = Date.now(),
): boolean {
	if (!viewerId) return false;
	if (!track.genreId) return true;
	return track.addedByUserID === viewerId && now - Date.parse(track.createdAt) < GENRE_CHANGE_WINDOW_MS;
}
