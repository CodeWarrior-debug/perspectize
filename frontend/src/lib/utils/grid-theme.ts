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
	// 60px fits a 32px thumbnail alongside a 2-line, 13px/1.5-leading title (39px of text
	// + the cell's py-1.5 padding = 51px) with the same ~9px safety margin the previous
	// 64px/py-2 pairing had — a tighter margin clips descenders (g/y/p/q/j) on the second
	// line via the row's own overflow:hidden, even though line-clamp itself only ever
	// cuts whole lines. Trimmed from 64px so more rows fit above the fold on smaller
	// desktop screens (e.g. an 11" MacBook Air) without touching that margin. See
	// CLAUDE.md's AG Grid gotcha.
	rowHeight: 60,
	headerHeight: 36,
	listItemHeight: 24,
} as const;

/** Params whose value is a colour — the ones that must never be hard-coded. */
export const GRID_COLOR_PARAM_KEYS = Object.keys(GRID_THEME_PARAMS).filter((k) => /Color$/.test(k));
