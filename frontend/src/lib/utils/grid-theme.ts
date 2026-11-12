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
	// 49px = a 2-line, 13px/1.5-leading title (39px of text) + the cell's py-[3px] padding (6px)
	// = 45px, plus a ~4px safety margin. A tighter margin clips descenders (g/y/p/q/j) on the
	// second line via the row's own overflow:hidden, even though line-clamp itself only cuts
	// whole lines. Trimmed from 64px (~9px margin) so more rows fit above the fold on small
	// desktop screens (e.g. an 11" MacBook Air). See CLAUDE.md's AG Grid gotcha.
	rowHeight: 49,
	headerHeight: 36,
	listItemHeight: 24,
} as const;

/** Params whose value is a colour — the ones that must never be hard-coded. */
export const GRID_COLOR_PARAM_KEYS = Object.keys(GRID_THEME_PARAMS).filter((k) => /Color$/.test(k));

/**
 * Quieter Activity headers: 11px labels in the muted-foreground token, which `deriveTheme` picks to
 * pass AA text contrast on `--color-muted` (the header background) in every preset. The uppercase
 * and letter-spacing half lives in app.css under `.activity-grid`: they are not theme params.
 */
export const ACTIVITY_HEADER_PARAMS = {
	headerFontSize: 11,
	headerTextColor: 'var(--color-muted-foreground)',
} as const;

/**
 * The Activity table's theme: Balham's tighter 4px spacing (Quartz uses 8px) under the shared
 * token-driven params. Row and header heights are fixed by the params above, so the gain is
 * horizontal only: cell and header padding halve (16px -> 8px), which untruncates the movie
 * view's "Genre" / "Rated" / "Released" headers and some channel names. Descender margin, hover,
 * zebra and every preset stay as they were (see the PR for the measurements). The Plan grid also
 * uses `themeBalham` with the shared params, without the Activity header tweaks.
 */
export const ACTIVITY_GRID_THEME = themeBalham.withParams(GRID_THEME_PARAMS).withParams(ACTIVITY_HEADER_PARAMS);
