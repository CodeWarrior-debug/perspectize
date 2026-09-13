export interface TypingClock {
	setTimeout: (fn: () => void, ms: number) => number;
	clearTimeout: (h: number) => void;
}

const defaultClock: TypingClock = {
	setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms) as unknown as number,
	clearTimeout: (h) => globalThis.clearTimeout(h),
};

export function createTypingController(opts: {
	emit: (typing: boolean) => void;
	idleMs?: number;
	clock?: TypingClock;
}) {
	const idleMs = opts.idleMs ?? 5000;
	const clock = opts.clock ?? defaultClock;
	let typing = false;
	let handle: number | null = null;

	function disarm() {
		if (handle !== null) {
			clock.clearTimeout(handle);
			handle = null;
		}
	}

	function setTyping(next: boolean) {
		if (typing === next) return;
		typing = next;
		opts.emit(next);
	}

	function onKeystroke() {
		disarm();
		setTyping(true);
		handle = clock.setTimeout(() => {
			handle = null;
			setTyping(false);
		}, idleMs);
	}

	function stop() {
		disarm();
		setTyping(false);
	}

	return { onKeystroke, onSend: stop, stop };
}
