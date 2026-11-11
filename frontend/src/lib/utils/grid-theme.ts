import { themeBalham } from '@ag-grid-community/theming';

/**
 * AG Grid theme params for the Activity table. Colours are token references, not hex, so the
 * grid follows the theme picker (presets and custom themes) like the rest of the app. AG Grid
 * emits each param as a CSS custom property, so `var(--color-*)` resolves at paint time.
 * Row zebra/hover come from `deriveTheme`'s row tokens (opaque, so hover is identical on odd
 * and even rows).
 */
export const GRID_THEME_PARAMS = {
	fontFamily: "'Geist', system-ui, sans-serif",
	fontSize: 14,
	headerFontWeight: 600,
	headerBackgroundColor: 'var(--color-muted)',
	headerTextColor: 'var(--color-foreground)',
	headerColumnBorder: false,
	backgroundColor: 'var(--color-background)',
	foregroundColor: 'var(--color-foreground)',
	borderColor: 'var(--color-border)',
	accentColor: 'var(--color-primary)',
	oddRowBackgroundColor: 'var(--color-row-alt)',
	rowHoverColor: 'var(--color-row-hover)',
	selectedRowBackgroundColor: 'var(--color-row-hover)',
	columnHoverColor: 'transparent',
	headerColumnResizeHandleColor: 'var(--color-border)',
	// 49px fits a 32px thumbnail alongside a 2-line, 13px/1.5-leading title (39px of text
	// + the cell's py-[3px] padding = 45px) with a ~4px safety margin
	// (it was ~9px at 64px/py-2). A much tighter margin clips descenders (g/y/p/q/j) on the second
	// line via the row's own overflow:hidden, even though line-clamp itself only ever
	// cuts whole lines. Trimmed from 64px so more rows fit above the fold on smaller
	// desktop screens (e.g. an 11" MacBook Air) (margin trimmed to ~5px, verified visually). See
	// CLAUDE.md's AG Grid gotcha.
	rowHeight: 49,
	headerHeight: 36,
	listItemHeight: 24,
} as const;

/** Params whose value is a colour — the ones that must never be hard-coded. */
export const GRID_COLOR_PARAM_KEYS = Object.keys(GRID_THEME_PARAMS).filter((k) => /Color$/.test(k));

/**
 * The Activity table's theme: Balham's tighter 4px spacing (Quartz uses 8px) under the shared
 * token-driven params. Row and header heights are fixed by the params above, so the gain is
 * horizontal only: cell and header padding halve (16px -> 8px), which untruncates the movie
 * view's "Genre" / "Rated" / "Released" headers and some channel names. Descender margin, hover,
 * zebra and every preset stay as they were (see the PR for the measurements). The Plan grid still
 * uses `themeQuartz` with the same params.
 */
export const ACTIVITY_GRID_THEME = themeBalham.withParams(GRID_THEME_PARAMS);

/**
 * Horizontal space, in px, that AG Grid draws around a header label in the Activity grid, read
 * from the theme itself so it follows any change to `spacing` / `iconSize` / `fontSize`:
 *
 *   [pad] label [gap] sort-arrow [gap] filter-funnel [pad]
 *
 * - `padding`: header cell padding on each side (`cellHorizontalPadding` = spacing * 2 * scale).
 * - `sort`: the label's flex gap (spacing) + the arrow icon. app.css drops AG Grid's extra
 *   padding-left on the arrow, so it sits one gap from its label rather than two.
 * - `filter`: the gap app.css adds between the label and the funnel (spacing) + the funnel icon.
 *
 * `headerMinWidth` (grid-header-width.ts) adds these to the label's measured width, so a column at its
 * minimum still shows its whole heading, its sort arrow and its funnel without overlap.
 */
export interface HeaderChrome {
	fontSize: number;
	padding: number;
	sort: number;
	filter: number;
}

export function headerChrome(theme: { getParams(): Record<string, unknown> } = ACTIVITY_GRID_THEME): HeaderChrome {
	const p = theme.getParams();
	const num = (key: string): number => {
		const v = p[key];
		if (typeof v !== 'number') throw new Error(`grid theme param ${key} is not a number: ${JSON.stringify(v)}`);
		return v;
	};
	const spacing = num('spacing');
	const iconSize = num('iconSize');
	return {
		fontSize: num('fontSize'),
		padding: spacing * 2 * num('cellHorizontalPaddingScale'),
		sort: spacing + iconSize,
		filter: spacing + iconSize,
	};
}

/** The Activity grid's header chrome, computed once. */
export const ACTIVITY_HEADER_CHROME: HeaderChrome = headerChrome();
