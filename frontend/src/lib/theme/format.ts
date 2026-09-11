import { converter, formatRgb } from 'culori';

const toOklch = converter('oklch');

export type ColorUnit = 'oklch' | 'hex' | 'rgb';

/**
 * Format a hex color string for display in the given unit. Used by the
 * theme customize panel's OKLCH/HEX/RGB toggle so the displayed value
 * actually reflects the selected unit, not just the toggle's own state.
 *
 * Falls back to the original hex string for an unparseable input, rather
 * than throwing, since this is only ever used for read-only display next
 * to a color swatch.
 */
export function formatColorForUnit(hex: string, unit: ColorUnit): string {
	if (unit === 'hex') return hex;

	if (unit === 'rgb') {
		const rgb = formatRgb(hex);
		return rgb ?? hex;
	}

	// oklch
	const c = toOklch(hex);
	if (!c) return hex;
	const l = (c.l ?? 0).toFixed(3);
	const chroma = (c.c ?? 0).toFixed(3);
	const h = (c.h ?? 0).toFixed(1);
	return `oklch(${l} ${chroma} ${h})`;
}
