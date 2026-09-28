import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	HOTKEY_SEQUENCE,
	MAX_KEY_GAP_MS,
	attachVersionHotkey,
	feedKey,
	initialKeySequenceState,
	isTypingTarget,
	type KeySequenceState,
} from '$lib/utils/versionHotkey';

function typeSequence(keys: string[], gapMs = 100): boolean {
	let state: KeySequenceState = initialKeySequenceState();
	let matched = false;
	let now = 0;
	for (const key of keys) {
		const result = feedKey(state, key, now);
		state = result.state;
		matched = result.matched;
		now += gapMs;
	}
	return matched;
}

describe('feedKey (pure matcher)', () => {
	it('matches z,z,z,v typed quickly', () => {
		expect(typeSequence(['z', 'z', 'z', 'v'])).toBe(true);
	});

	it('does not match with a gap over 1000ms between any two keys', () => {
		let state = initialKeySequenceState();
		state = feedKey(state, 'z', 0).state;
		state = feedKey(state, 'z', 100).state;
		state = feedKey(state, 'z', 200).state;
		const result = feedKey(state, 'v', 200 + MAX_KEY_GAP_MS + 1);
		expect(result.matched).toBe(false);
	});

	it('matches exactly at the gap boundary', () => {
		let state = initialKeySequenceState();
		state = feedKey(state, 'z', 0).state;
		state = feedKey(state, 'z', MAX_KEY_GAP_MS).state;
		state = feedKey(state, 'z', 2 * MAX_KEY_GAP_MS).state;
		const result = feedKey(state, 'v', 3 * MAX_KEY_GAP_MS);
		expect(result.matched).toBe(true);
	});

	it('recovers after a wrong key: z,z,x,z,z,z,v fires once', () => {
		let state = initialKeySequenceState();
		let matchCount = 0;
		let now = 0;
		for (const key of ['z', 'z', 'x', 'z', 'z', 'z', 'v']) {
			const result = feedKey(state, key, now);
			state = result.state;
			if (result.matched) matchCount++;
			now += 100;
		}
		expect(matchCount).toBe(1);
	});

	it('is case-insensitive', () => {
		expect(typeSequence(['Z', 'Z', 'Z', 'V'])).toBe(true);
	});

	it('resets the internal buffer after a match, so it does not immediately match again', () => {
		let state = initialKeySequenceState();
		let now = 0;
		for (const key of ['z', 'z', 'z', 'v']) {
			state = feedKey(state, key, now).state;
			now += 100;
		}
		expect(state.buffer).toBe('');
	});

	it('does not match an unrelated sequence', () => {
		expect(typeSequence(['a', 'b', 'c', 'd'])).toBe(false);
	});

	it('exposes the sequence it matches', () => {
		expect(HOTKEY_SEQUENCE).toBe('zzzv');
	});
});

describe('isTypingTarget', () => {
	afterEach(() => {
		document.body.innerHTML = '';
	});

	it('is false for null', () => {
		expect(isTypingTarget(null)).toBe(false);
	});

	it('is false for a plain element', () => {
		expect(isTypingTarget(document.createElement('div'))).toBe(false);
	});

	it('is true for an input', () => {
		expect(isTypingTarget(document.createElement('input'))).toBe(true);
	});

	it('is true for a textarea', () => {
		expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
	});

	it('is true for a select', () => {
		expect(isTypingTarget(document.createElement('select'))).toBe(true);
	});

	it('is true for a contenteditable element', () => {
		const div = document.createElement('div');
		Object.defineProperty(div, 'isContentEditable', { value: true });
		expect(isTypingTarget(div)).toBe(true);
	});
});

describe('attachVersionHotkey', () => {
	afterEach(() => {
		document.body.innerHTML = '';
	});

	function dispatchKey(key: string) {
		document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
	}

	it('calls onMatch after z,z,z,v', () => {
		const onMatch = vi.fn();
		const detach = attachVersionHotkey({ onMatch });
		try {
			'zzzv'.split('').forEach(dispatchKey);
			expect(onMatch).toHaveBeenCalledTimes(1);
		} finally {
			detach();
		}
	});

	it('ignores keystrokes while an input has focus', () => {
		const input = document.createElement('input');
		document.body.appendChild(input);
		input.focus();

		const onMatch = vi.fn();
		const detach = attachVersionHotkey({ onMatch });
		try {
			'zzzv'.split('').forEach((key) => {
				input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
			});
			expect(onMatch).not.toHaveBeenCalled();
		} finally {
			detach();
		}
	});

	it('ignores modifier/non-character keys without breaking the sequence', () => {
		const onMatch = vi.fn();
		const detach = attachVersionHotkey({ onMatch });
		try {
			dispatchKey('z');
			dispatchKey('Shift');
			dispatchKey('z');
			dispatchKey('z');
			dispatchKey('v');
			expect(onMatch).toHaveBeenCalledTimes(1);
		} finally {
			detach();
		}
	});

	it('stops listening after detach', () => {
		const onMatch = vi.fn();
		attachVersionHotkey({ onMatch })();
		'zzzv'.split('').forEach(dispatchKey);
		expect(onMatch).not.toHaveBeenCalled();
	});
});
