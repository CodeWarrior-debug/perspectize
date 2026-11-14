/** How long without input before the realtime streams are paused. */
export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

/** Activity events re-arm the timer at most this often (cheap handler). */
export const ACTIVITY_THROTTLE_MS = 1000;

const WINDOW_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'scroll'] as const;

export interface IdleDetectorOptions {
	timeoutMs?: number;
	throttleMs?: number;
	/** Called once when the idle timeout elapses with no activity. */
	onIdle: () => void;
	/** Called on the first activity after `onIdle` fired. */
	onActive: () => void;
}

/**
 * One idle timer. Input (mouse, key, touch, wheel, scroll), window focus, or a
 * tab becoming visible counts as activity. A hidden tab produces no input, so
 * it goes idle on its own. Browser-only: call `start()` from an effect/onMount.
 */
export function createIdleDetector(opts: IdleDetectorOptions) {
	const timeoutMs = opts.timeoutMs ?? IDLE_TIMEOUT_MS;
	const throttleMs = opts.throttleMs ?? ACTIVITY_THROTTLE_MS;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let idle = false;
	let lastArm = 0;
	let running = false;

	function arm() {
		if (timer) clearTimeout(timer);
		lastArm = Date.now();
		timer = setTimeout(() => {
			timer = null;
			idle = true;
			opts.onIdle();
		}, timeoutMs);
	}

	function onActivity() {
		if (idle) {
			idle = false;
			arm();
			opts.onActive();
			return;
		}
		if (Date.now() - lastArm >= throttleMs) arm();
	}

	function onVisibility() {
		if (document.visibilityState === 'visible') onActivity();
	}

	function start() {
		if (running) return;
		running = true;
		idle = false;
		for (const e of WINDOW_EVENTS) window.addEventListener(e, onActivity, { passive: true, capture: true });
		window.addEventListener('focus', onActivity, { passive: true });
		document.addEventListener('visibilitychange', onVisibility, { passive: true });
		arm();
	}

	function stop() {
		if (!running) return;
		running = false;
		if (timer) clearTimeout(timer);
		timer = null;
		for (const e of WINDOW_EVENTS) window.removeEventListener(e, onActivity, { capture: true });
		window.removeEventListener('focus', onActivity);
		document.removeEventListener('visibilitychange', onVisibility);
	}

	return { start, stop };
}
