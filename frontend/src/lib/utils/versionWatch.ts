/**
 * Reload a page that was resumed after a new deploy shipped.
 *
 * Any long-lived tab — a bookmarked/home-screen app on a phone, a pinned or
 * session-restored desktop tab, a page restored from the back-forward cache —
 * can outlive a deploy. When the user comes back to it, it is still running the
 * old build, whose lazily-imported chunks the new deploy has deleted, so the
 * next navigation or dynamic import dies and the page goes blank. Checking
 * `_app/version.json` the moment the user returns (tab visible again, bfcache
 * restore, or window focus for a desktop window that never left the screen)
 * swaps in the new build before they touch anything.
 */

/** Window focus fires on every click back into the window — don't refetch each time. */
export const FOCUS_CHECK_INTERVAL_MS = 60_000;

export interface VersionWatchOptions {
	/** Resolves true when a newer build is deployed (SvelteKit's `updated.check`). */
	check: () => Promise<boolean>;
	reload: () => void;
	doc?: Document;
	win?: Window;
}

/** True while the user is typing somewhere a reload would throw work away. */
export function isEditing(doc: Document): boolean {
	const el = doc.activeElement as HTMLElement | null;
	if (!el) return false;
	return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

/** Starts watching; returns a cleanup function. */
export function watchForNewVersion({ check, reload, doc = document, win = window }: VersionWatchOptions): () => void {
	let inFlight = false;
	let lastFocusCheck = 0;

	async function checkNow() {
		if (inFlight) return;
		inFlight = true;
		try {
			// A mid-edit user keeps their page; the next navigation still picks up
			// the new build via the layout's beforeNavigate hook.
			if ((await check()) && !isEditing(doc)) reload();
		} catch {
			// Offline or version.json unreachable — nothing to act on.
		} finally {
			inFlight = false;
		}
	}

	const onVisibility = () => {
		if (doc.visibilityState === 'visible') void checkNow();
	};
	const onPageShow = (e: PageTransitionEvent) => {
		if (e.persisted) void checkNow();
	};
	// Desktop: switching to another app while the browser window stays on screen
	// (side-by-side, second monitor) never fires visibilitychange.
	const onFocus = () => {
		const now = Date.now();
		if (now - lastFocusCheck < FOCUS_CHECK_INTERVAL_MS) return;
		lastFocusCheck = now;
		void checkNow();
	};

	doc.addEventListener('visibilitychange', onVisibility);
	win.addEventListener('pageshow', onPageShow);
	win.addEventListener('focus', onFocus);
	return () => {
		doc.removeEventListener('visibilitychange', onVisibility);
		win.removeEventListener('pageshow', onPageShow);
		win.removeEventListener('focus', onFocus);
	};
}
