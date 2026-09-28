const PREFIX = 'perspectize:draft:';

/**
 * perspectiveDraft — localStorage-backed draft persistence for the
 * perspective editor's review HTML. Pure/testable: callers own debouncing.
 */
export function draftKey(contentId: string | number, userId: string | number): string {
	return `${PREFIX}${contentId}:${userId}`;
}

/**
 * `baseline` is the server copy of the review the draft was started from
 * (`''` for a brand-new perspective). It lets loadDraft() tell a genuine
 * unsaved draft from one that a newer save elsewhere has since superseded.
 */
export function saveDraft(key: string, html: string, baseline = ''): void {
	try {
		localStorage.setItem(key, JSON.stringify({ html, baseline, savedAt: Date.now() }));
	} catch {
		// localStorage unavailable (private browsing, quota) — draft persistence
		// is a nice-to-have, never block editing on it.
	}
}

/**
 * Returns the draft only if the server review it was based on still equals
 * `baseline`; otherwise the draft is stale (saved over elsewhere) and is
 * removed so restoring it can't silently overwrite the newer content.
 */
export function loadDraft(key: string, baseline = ''): string | null {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		const entry = JSON.parse(raw);
		if ((entry.baseline ?? '') !== baseline) {
			localStorage.removeItem(key);
			return null;
		}
		return entry.html ?? null;
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
