/**
 * Axis ticks for the column charts. Steps are 1, 2, 2.5 or 5 times a power of
 * ten, so a range gets round labels that the column's own formatter can print.
 */

/** A step near `span / target`, rounded up to a 1, 2, 2.5, 5 or 10 multiple. */
export function niceStep(span: number, target: number, integer = false): number {
	if (!(span > 0) || !(target >= 1)) return 1;
	const raw = span / target;
	const magnitude = 10 ** Math.floor(Math.log10(raw));
	const fraction = raw / magnitude;
	const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
	const step = nice * magnitude;
	// Counts are whole movies: a step under one would label 0.5, 1, 1.5 on a count axis.
	return integer ? Math.max(1, Math.round(step)) : step;
}

/** Round tick values inside [lo, hi], about `target` of them. Empty when the range is empty. */
export function niceTicks(lo: number, hi: number, target = 4, integer = false): number[] {
	if (!Number.isFinite(lo) || !Number.isFinite(hi) || !(hi > lo)) return [];
	const step = niceStep(hi - lo, target, integer);
	// The epsilon keeps a tick that sits exactly on an edge when lo/step or hi/step lands a hair off (0.3 / 0.1).
	const first = Math.ceil(lo / step - 1e-9);
	const last = Math.floor(hi / step + 1e-9);
	const ticks: number[] = [];
	for (let k = first; k <= last; k++) {
		// toPrecision strips float noise such as 0.30000000000000004 from 3 * 0.1.
		ticks.push(Number((k * step).toPrecision(12)));
	}
	return ticks;
}
