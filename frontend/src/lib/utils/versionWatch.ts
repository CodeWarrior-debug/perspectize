/**
 * Reload a page that was resumed after a new deploy shipped.
 *
 * Mobile browsers keep a bookmarked / home-screen tab alive in memory (or in
 * the back-forward cache) for days. When it comes back to the foreground it is
 * still running the old build, whose lazily-imported chunks the new deploy has
 * deleted — so the next navigation or dynamic import dies and the page goes
 * blank. Checking `_app/version.json` the moment the page becomes visible
 * again lets us swap in the new build before the user touches anything.
 */

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

	doc.addEventListener('visibilitychange', onVisibility);
	win.addEventListener('pageshow', onPageShow);
	return () => {
		doc.removeEventListener('visibilitychange', onVisibility);
		win.removeEventListener('pageshow', onPageShow);
	};
}
