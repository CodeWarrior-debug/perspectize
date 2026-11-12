import { GEIST_SEMIBOLD_ADVANCE_EM, GEIST_SEMIBOLD_WIDEST_EM } from './grid-header-metrics';
import { ACTIVITY_HEADER_CHROME, type HeaderChrome } from './grid-theme';

/**
 * Margin on top of the measured label, in px, for subpixel rounding. The label width itself is
 * exact for Geist, the self-hosted, preloaded header font.
 */
const HEADER_WIDTH_GUARD_PX = 2;

/** How a header label is set: its size, and optionally uppercase and letter-spaced. */
export interface HeaderTextStyle {
	fontSize: number;
	uppercase?: boolean;
	letterSpacingEm?: number;
}

/**
 * Width in px of `text` set in the header font (Geist 600), from the font's own advance widths,
 * uppercased and letter-spaced the way the style says. CSS adds letter-spacing after every
 * character, the last one included. Characters outside printable ASCII count as the widest
 * glyph, so a label can be over-estimated but never under-estimated.
 */
export function headerTextWidth(text: string, style: HeaderTextStyle = ACTIVITY_HEADER_CHROME): number {
	const { fontSize, uppercase = false, letterSpacingEm = 0 } = style;
	const shown = uppercase ? text.toUpperCase() : text;
	let em = 0;
	for (const ch of shown) {
		em += (GEIST_SEMIBOLD_ADVANCE_EM[(ch.codePointAt(0) ?? 0) - 32] ?? GEIST_SEMIBOLD_WIDEST_EM) + letterSpacingEm;
	}
	return em * fontSize;
}

export interface HeaderWidthOptions {
	/** The column has a filter, so the header draws a funnel button. Default true. */
	filter?: boolean;
	/** The column can be sorted, so the header draws a sort arrow when sorted. Default true. */
	sortable?: boolean;
}

/**
 * Smallest width (px) at which a column still shows its whole heading, its sort arrow and its
 * filter funnel side by side, with nothing cut to "…" and no label running into the funnel.
 * The sort arrow is reserved even while unsorted, so sorting a column never truncates it.
 *
 * Every Activity column's `minWidth` is at least this (see ActivityTable's column defs), and
 * `tests/unit/gridHeaderWidth.test.ts` checks that for every column.
 */
export function headerMinWidth(
	name: string,
	{ filter = true, sortable = true }: HeaderWidthOptions = {},
	chrome: HeaderChrome = ACTIVITY_HEADER_CHROME,
): number {
	let width = chrome.padding * 2 + headerTextWidth(name, chrome) + HEADER_WIDTH_GUARD_PX;
	if (sortable) width += chrome.sort;
	if (filter) width += chrome.filter;
	return Math.ceil(width);
}
