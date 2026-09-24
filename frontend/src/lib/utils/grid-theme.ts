/**
 * AG Grid theme params for the Activity table. Colours are token references, not hex, so the
 * grid follows the theme picker (presets and custom themes) like the rest of the app. AG Grid
 * emits each param as a CSS custom property, so `var(--color-*)` resolves at paint time.
 * Hover stays a faint primary tint here; distinct row tokens are a separate change.
 */
export const GRID_THEME_PARAMS = {
	fontFamily: "'Geist', system-ui, sans-serif",
	fontSize: 14,
	headerFontWeight: 600,
	headerBackgroundColor: 'var(--color-primary)',
	headerTextColor: 'var(--color-primary-foreground)',
	backgroundColor: 'var(--color-background)',
	foregroundColor: 'var(--color-foreground)',
	borderColor: 'var(--color-border)',
	accentColor: 'var(--color-primary)',
	oddRowBackgroundColor: 'var(--color-muted)',
	rowHoverColor: 'color-mix(in srgb, var(--color-primary) 6%, transparent)',
	selectedRowBackgroundColor: 'color-mix(in srgb, var(--color-primary) 8%, transparent)',
	columnHoverColor: 'transparent',
	headerColumnResizeHandleColor: 'var(--color-primary-foreground)',
	// 64px comfortably fits a 32px thumbnail alongside a 2-line, 13px/1.5-leading title
	// with margin to spare — a tighter value clips descenders (g/y/p/q/j) on the second
	// line via the row's own overflow:hidden, even though line-clamp itself only ever
	// cuts whole lines. See CLAUDE.md's AG Grid gotcha.
	rowHeight: 64,
	headerHeight: 40,
	listItemHeight: 24,
} as const;

/** Params whose value is a colour — the ones that must never be hard-coded. */
export const GRID_COLOR_PARAM_KEYS = Object.keys(GRID_THEME_PARAMS).filter((k) => /Color$/.test(k));
