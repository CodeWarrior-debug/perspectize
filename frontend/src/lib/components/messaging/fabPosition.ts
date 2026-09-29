export const FAB_POSITION_KEY = 'perspectize:messaging-fab-position';

/** Distance from the viewport's right/bottom edges, in px (matches the default `right-5 bottom-5`). */
export interface FabPosition {
	right: number;
	bottom: number;
}

export const DEFAULT_FAB_POSITION: FabPosition = { right: 20, bottom: 20 };
export const FAB_SIZE = 56;
export const FAB_MARGIN = 8;
export const LONG_PRESS_MS = 400;
/** Finger/mouse drift (px) that turns a pending press into a scroll/click instead of a long press. */
export const LONG_PRESS_SLOP = 8;

/** Keep the whole button inside the viewport, so a stale saved spot (smaller window, rotated phone) can't strand it. */
export function clampFabPosition(pos: FabPosition, viewportW: number, viewportH: number): FabPosition {
	const clamp = (v: number, max: number) => Math.min(Math.max(v, FAB_MARGIN), Math.max(FAB_MARGIN, max));
	return {
		right: clamp(pos.right, viewportW - FAB_SIZE - FAB_MARGIN),
		bottom: clamp(pos.bottom, viewportH - FAB_SIZE - FAB_MARGIN),
	};
}

export function loadFabPosition(): FabPosition | null {
	try {
		const raw = localStorage.getItem(FAB_POSITION_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (Number.isFinite(parsed?.right) && Number.isFinite(parsed?.bottom)) {
			return { right: parsed.right, bottom: parsed.bottom };
		}
	} catch {
		// storage blocked or corrupt JSON — fall back to the default corner
	}
	return null;
}

export function saveFabPosition(pos: FabPosition): void {
	try {
		localStorage.setItem(FAB_POSITION_KEY, JSON.stringify(pos));
	} catch {
		// keep the in-memory position for this session
	}
}
