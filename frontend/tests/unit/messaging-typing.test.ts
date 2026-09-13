// frontend/tests/unit/messaging-typing.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createTypingController, type TypingClock } from '$lib/messaging/typing';

function fakeClock() {
	let seq = 1;
	const timers = new Map<number, () => void>();
	const clock: TypingClock = {
		setTimeout: (fn) => {
			const h = seq++;
			timers.set(h, fn);
			return h;
		},
		clearTimeout: (h) => {
			timers.delete(h);
		},
	};
	return { clock, fire: (h: number) => timers.get(h)?.(), pending: () => timers.size };
}

describe('createTypingController', () => {
	it('emits true once on first keystroke, then false when idle fires', () => {
		const emit = vi.fn();
		const { clock } = fakeClock();
		const c = createTypingController({ emit, clock, idleMs: 5000 });

		c.onKeystroke();
		c.onKeystroke();
		expect(emit.mock.calls).toEqual([[true]]);
	});

	it('idle timer fires -> emit(false)', () => {
		const emit = vi.fn();
		const { clock, fire } = fakeClock();
		const c = createTypingController({ emit, clock });
		c.onKeystroke();
		// one timer armed
		fire(1);
		expect(emit.mock.calls).toEqual([[true], [false]]);
	});

	it('re-arms the timer on each keystroke without re-emitting true', () => {
		const emit = vi.fn();
		const { clock, pending } = fakeClock();
		const c = createTypingController({ emit, clock });
		c.onKeystroke(); // arms timer 1
		c.onKeystroke(); // clears 1, arms 2
		c.onKeystroke(); // clears 2, arms 3
		expect(pending()).toBe(1);
		expect(emit.mock.calls).toEqual([[true]]);
	});

	it('onSend stops typing and emits false', () => {
		const emit = vi.fn();
		const { clock } = fakeClock();
		const c = createTypingController({ emit, clock });
		c.onKeystroke();
		c.onSend();
		expect(emit.mock.calls).toEqual([[true], [false]]);
		// a later keystroke starts a fresh cycle
		c.onKeystroke();
		expect(emit.mock.calls).toEqual([[true], [false], [true]]);
	});

	it('stop() when not typing does not emit', () => {
		const emit = vi.fn();
		const { clock } = fakeClock();
		const c = createTypingController({ emit, clock });
		c.stop();
		expect(emit).not.toHaveBeenCalled();
	});
});
