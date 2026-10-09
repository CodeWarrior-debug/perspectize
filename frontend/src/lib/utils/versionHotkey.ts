/**
 * Hidden "zzzv" console hotkey: typing z, z, z, v anywhere in the app, each
 * keystroke under 1s after the previous one, prints a grouped console table
 * of frontend + backend build facts. Nothing renders in the UI.
 */

export const HOTKEY_SEQUENCE = 'zzzv';
export const MAX_KEY_GAP_MS = 1000;

export interface KeySequenceState {
	buffer: string;
	lastKeyAt: number;
}

export function initialKeySequenceState(): KeySequenceState {
	return { buffer: '', lastKeyAt: 0 };
}

/**
 * Pure reducer: feed one key (any case) and its timestamp, get back the next
 * state and whether HOTKEY_SEQUENCE just completed. A gap over
 * MAX_KEY_GAP_MS since the previous key drops the buffer before this key is
 * considered. The buffer only ever keeps the trailing HOTKEY_SEQUENCE.length
 * characters, so a wrong key doesn't grow it unboundedly and a sequence like
 * "z,z,x,z,z,z,v" still recovers into a match on the final "v".
 */
export function feedKey(
	state: KeySequenceState,
	key: string,
	now: number,
): { state: KeySequenceState; matched: boolean } {
	const withinGap = now - state.lastKeyAt <= MAX_KEY_GAP_MS;
	let buffer = (withinGap ? state.buffer : '') + key.toLowerCase();
	if (buffer.length > HOTKEY_SEQUENCE.length) {
		buffer = buffer.slice(buffer.length - HOTKEY_SEQUENCE.length);
	}
	const matched = buffer === HOTKEY_SEQUENCE;
	return { state: { buffer: matched ? '' : buffer, lastKeyAt: now }, matched };
}

/** True while focus is somewhere typing "zzzv" would just be text input. */
export function isTypingTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	return (
		target.isContentEditable ||
		target.tagName === 'INPUT' ||
		target.tagName === 'TEXTAREA' ||
		target.tagName === 'SELECT'
	);
}

export interface AttachVersionHotkeyOptions {
	onMatch: () => void;
	doc?: Document;
	now?: () => number;
}

/** Mounts the keydown listener; returns a cleanup function. */
export function attachVersionHotkey({
	onMatch,
	doc = document,
	now = Date.now,
}: AttachVersionHotkeyOptions): () => void {
	let state = initialKeySequenceState();

	const onKeydown = (e: KeyboardEvent) => {
		if (isTypingTarget(e.target)) return;
		// Ignore modifiers/arrows/function keys etc. — only single characters
		// (letters) can ever be part of, or interrupt, the sequence.
		if (e.key.length !== 1) return;

		const result = feedKey(state, e.key, now());
		state = result.state;
		if (result.matched) onMatch();
	};

	doc.addEventListener('keydown', onKeydown);
	return () => doc.removeEventListener('keydown', onKeydown);
}
