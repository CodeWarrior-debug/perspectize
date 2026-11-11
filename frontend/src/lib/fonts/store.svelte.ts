import { browser } from '$app/environment';
import { fontStack, stylesheetHref, type FontChoice } from './googleFonts';
import { FONT_SLOTS, type FontSlot } from './slots';

/**
 * User font overrides (Settings → Fonts). Mirrors lib/theme/store.svelte.ts: state in
 * localStorage, plus a pre-computed cache app.html's inline script applies before first paint.
 *
 * Applying a slot sets `--font-slot-<slot>` and `data-font-<slot>` on <html>; app.css only
 * restyles elements while that attribute is present, so a user who never picks a font gets
 * exactly the default styling.
 */

export const FONT_STORAGE_KEY = 'perspectize-fonts';
export const FONT_APPLIED_CACHE_KEY = 'perspectize-fonts-applied';
/** id of the <link> carrying the picked families' Google Fonts stylesheet. */
export const FONT_LINK_ID = 'perspectize-fonts-css';

export type FontState = Record<FontSlot, FontChoice | null>;

/** What app.html's pre-paint script needs: slot → CSS stack, and the stylesheet to load. */
export interface FontAppliedCache {
	stacks: Partial<Record<FontSlot, string>>;
	href: string | null;
}

export function defaultFontState(): FontState {
	return { heading: null, cell: null, longform: null };
}

function isChoice(v: unknown): v is FontChoice {
	if (!v || typeof v !== 'object') return false;
	const c = v as Record<string, unknown>;
	return (
		typeof c.family === 'string' &&
		c.family.length > 0 &&
		typeof c.category === 'string' &&
		['s', 'a', 'd', 'h', 'm'].includes(c.category) &&
		Array.isArray(c.weights) &&
		c.weights.every((w) => typeof w === 'number') &&
		typeof c.italic === 'boolean'
	);
}

export function loadFontState(): FontState {
	const state = defaultFontState();
	if (!browser) return state;
	try {
		const parsed = JSON.parse(localStorage.getItem(FONT_STORAGE_KEY) ?? 'null');
		if (!parsed || typeof parsed !== 'object') return state;
		for (const slot of FONT_SLOTS) if (isChoice(parsed[slot])) state[slot] = parsed[slot];
	} catch {
		// Corrupt or unavailable storage: fall back to the app defaults.
	}
	return state;
}

export function fontAppliedCache(state: FontState): FontAppliedCache {
	const stacks: Partial<Record<FontSlot, string>> = {};
	for (const slot of FONT_SLOTS) {
		const choice = state[slot];
		if (choice) stacks[slot] = fontStack(choice);
	}
	return { stacks, href: stylesheetHref(FONT_SLOTS.map((s) => state[s])) };
}

/**
 * Write a font state to <html>. Same shape of work as app.html's pre-paint script, which
 * applies a FontAppliedCache before the app loads — keep the two in step.
 * @param cacheForPrePaint false for a live preview, so an unsaved preview never becomes what
 *   the next page load shows.
 */
export function applyFontsToDom(state: FontState, cacheForPrePaint = true): void {
	if (!browser) return;
	const root = document.documentElement;
	const cache = fontAppliedCache(state);
	for (const slot of FONT_SLOTS) {
		const stack = cache.stacks[slot];
		if (stack) {
			root.style.setProperty(`--font-slot-${slot}`, stack);
			root.setAttribute(`data-font-${slot}`, '');
		} else {
			root.style.removeProperty(`--font-slot-${slot}`);
			root.removeAttribute(`data-font-${slot}`);
		}
	}
	let link = document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null;
	if (cache.href) {
		if (!link) {
			link = document.createElement('link');
			link.id = FONT_LINK_ID;
			link.rel = 'stylesheet';
			document.head.appendChild(link);
		}
		if (link.getAttribute('href') !== cache.href) link.href = cache.href;
	} else {
		link?.remove();
	}

	if (!cacheForPrePaint) return;
	try {
		localStorage.setItem(FONT_APPLIED_CACHE_KEY, JSON.stringify(cache));
	} catch {
		// localStorage unavailable (private mode / quota): the pre-paint script falls back to defaults.
	}
}

/** Reactive font store. Instantiate once (Header.svelte) and pass it down. */
export function createFontStore() {
	const state = $state<FontState>(loadFontState());
	applyFontsToDom(state);

	function persistAndApply() {
		try {
			localStorage.setItem(FONT_STORAGE_KEY, JSON.stringify(state));
		} catch {
			// Picks still apply for this session; they just aren't remembered.
		}
		applyFontsToDom(state);
	}

	return {
		state,
		/** Pick a font for a slot (null = back to the app default) and remember it. */
		set(slot: FontSlot, choice: FontChoice | null) {
			state[slot] = choice;
			persistAndApply();
		},
		/** Set several slots in one go (pairings). */
		setAll(picks: FontState) {
			for (const slot of FONT_SLOTS) state[slot] = picks[slot];
			persistAndApply();
		},
		/** Show a slot's candidate on the page without saving it (picker keyboard browsing). */
		preview(slot: FontSlot, choice: FontChoice | null) {
			applyFontsToDom({ ...state, [slot]: choice }, false);
		},
		/** Drop any preview and show the saved state again. */
		endPreview() {
			applyFontsToDom(state, false);
		},
	};
}

export type FontStore = ReturnType<typeof createFontStore>;
