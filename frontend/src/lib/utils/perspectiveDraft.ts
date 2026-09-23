const PREFIX = 'perspectize:draft:';

/**
 * perspectiveDraft — localStorage-backed draft persistence for the
 * perspective editor's review HTML. Pure/testable: callers own debouncing.
 */
export function draftKey(contentId: string | number, userId: string | number): string {
	return `${PREFIX}${contentId}:${userId}`;
}

export function saveDraft(key: string, html: string): void {
	try {
		localStorage.setItem(key, JSON.stringify({ html, savedAt: Date.now() }));
	} catch {
		// localStorage unavailable (private browsing, quota) — draft persistence
		// is a nice-to-have, never block editing on it.
	}
}

export function loadDraft(key: string): string | null {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		return JSON.parse(raw).html ?? null;
	} catch {
		return null;
	}
}

export function clearDraft(key: string): void {
	try {
		localStorage.removeItem(key);
	} catch {
		// no-op
	}
}
