import { converter, formatHex, wcagContrast } from 'culori';

interface Oklch {
	mode: 'oklch';
	l: number;
	c: number;
	h: number;
}

const toOklch = converter('oklch');

/** The 8 user-editable tokens that drive a whole theme. */
export interface BaseThemeTokens {
	primary: string;
	primaryHover: string;
	secondary: string;
	accent: string;
	background: string;
	foreground: string;
	border: string;
	destructive: string;
}

/** Everything computed from the base 8 — never directly edited. */
export interface DerivedTokens {
	card: string;
	cardForeground: string;
	popover: string;
	popoverForeground: string;
	primaryForeground: string;
	secondaryHover: string;
	secondaryForeground: string;
	muted: string;
	mutedForeground: string;
	accentForeground: string;
	destructiveHover: string;
	destructiveForeground: string;
	input: string;
	ring: string;
	ratingPositive: string;
	ratingNeutral: string;
	ratingNegative: string;
	ratingUndecided: string;
}

export type FullThemeTokens = BaseThemeTokens & DerivedTokens;

const WHITE = '#ffffff';
const NEAR_BLACK = '#171717';
const AA_NORMAL_TEXT = 4.5;

function oklch(hex: string): Oklch {
	const c = toOklch(hex);
	if (!c) throw new Error(`Invalid color: ${hex}`);
	return { mode: 'oklch', l: c.l ?? 0, c: c.c ?? 0, h: c.h ?? 0 };
}

function hex(c: Oklch): string {
	return formatHex(c) ?? '#000000';
}

/** Pick whichever of white / near-black gives the higher contrast against bg. */
function pickForeground(bgHex: string): string {
	const white = wcagContrast(bgHex, WHITE);
	const black = wcagContrast(bgHex, NEAR_BLACK);
	return white >= black ? WHITE : NEAR_BLACK;
}

/**
 * If the authored foreground fails AA against the authored background, clamp
 * the foreground's lightness toward whichever pole (0 or 1) increases
 * contrast, in steps, until it passes (or we hit the pole).
 */
function clampForegroundForContrast(bgHex: string, fgHex: string): string {
	if (wcagContrast(bgHex, fgHex) >= AA_NORMAL_TEXT) return fgHex;

	const bg = oklch(bgHex);
	let fg = oklch(fgHex);
	// Move away from the background's lightness — toward 0 if bg is light, toward 1 if bg is dark.
	const direction = bg.l >= 0.5 ? -1 : 1;

	for (let i = 0; i < 20; i++) {
		fg = { ...fg, l: Math.min(1, Math.max(0, fg.l + direction * 0.05)) };
		if (wcagContrast(bgHex, hex(fg)) >= AA_NORMAL_TEXT) break;
		if (fg.l === 0 || fg.l === 1) break;
	}
	return hex(fg);
}

/** Tint a neutral toward the theme's primary hue; reduce chroma near lightness extremes. */
function tintNeutralTowardHue(neutralHex: string, primaryHue: number): string {
	const n = oklch(neutralHex);
	const blendedHue = primaryHue;
	// Chroma nudge shrinks as lightness approaches 0 or 1 (avoids muddy near-black/near-white).
	const extremeFactor = 1 - Math.abs(n.l - 0.5) * 2; // 1 at L=0.5, 0 at L=0 or L=1
	const chromaNudge = 0.01 * extremeFactor;
	return hex({ mode: 'oklch', l: n.l, c: n.c + chromaNudge, h: blendedHue });
}

interface RatingAnchor {
	key: keyof Pick<DerivedTokens, 'ratingPositive' | 'ratingNeutral' | 'ratingNegative' | 'ratingUndecided'>;
	seedHex: string; // semantic anchor color — kept recognizable across themes
}

const RATING_ANCHORS: RatingAnchor[] = [
	{ key: 'ratingPositive', seedHex: '#16a34a' },
	{ key: 'ratingNeutral', seedHex: '#ca8a04' },
	{ key: 'ratingNegative', seedHex: '#dc2626' },
	{ key: 'ratingUndecided', seedHex: '#64748b' },
];

const MIN_RATING_HUE_SEPARATION = 20;

/**
 * Ratings must stay recognizable (green=positive, red=negative, etc.) across
 * every theme, so we keep their anchor hue and only lightly tint chroma/lightness
 * toward the theme — then verify no two ended up too close in hue.
 */
function deriveRatingColors(primaryHue: number): Record<RatingAnchor['key'], string> {
	const result = {} as Record<RatingAnchor['key'], string>;
	for (const { key, seedHex } of RATING_ANCHORS) {
		const seed = oklch(seedHex);
		// Nudge hue very slightly toward the theme's primary hue (blend), keep mostly anchored.
		const hueDelta = (((primaryHue - seed.h + 540) % 360) - 180) * 0.08;
		result[key] = hex({ mode: 'oklch', l: seed.l, c: seed.c, h: (seed.h + hueDelta + 360) % 360 });
	}

	// Sanity check: anchors are semantically far apart already (green/amber/red/slate),
	// so with only an 8% hue nudge they cannot collapse — but verify defensively.
	const keys = RATING_ANCHORS.map((r) => r.key);
	for (let i = 0; i < keys.length; i++) {
		for (let j = i + 1; j < keys.length; j++) {
			const hi = oklch(result[keys[i]]).h;
			const hj = oklch(result[keys[j]]).h;
			const dist = Math.abs(((hi - hj + 540) % 360) - 180);
			if (dist < MIN_RATING_HUE_SEPARATION) {
				// Fall back to the unmodified semantic anchor for the later color.
				result[keys[j]] = RATING_ANCHORS[j].seedHex;
			}
		}
	}
	return result;
}

function darken(hexColor: string, amount: number): string {
	const c = oklch(hexColor);
	return hex({ ...c, l: Math.max(0, c.l - amount) });
}

/**
 * Compute the full token set (base 8 + everything derived) for a theme.
 * Runs identically for presets (once, authoring-time) and custom themes (live, in-browser).
 */
export function deriveTheme(base: BaseThemeTokens): FullThemeTokens {
	const primaryHue = oklch(base.primary).h;

	const background = tintNeutralTowardHue(base.background, primaryHue);
	const card = background;
	const popover = background;
	const muted = tintNeutralTowardHue(base.secondary, primaryHue);
	const secondary = tintNeutralTowardHue(base.secondary, primaryHue);

	const foreground = clampForegroundForContrast(background, base.foreground);

	const rating = deriveRatingColors(primaryHue);

	return {
		...base,
		background,
		foreground,
		card,
		cardForeground: foreground,
		popover,
		popoverForeground: foreground,
		primaryForeground: pickForeground(base.primary),
		secondary,
		secondaryHover: darken(secondary, -0.03),
		secondaryForeground: pickForeground(secondary),
		muted,
		mutedForeground: pickForeground(muted),
		accent: base.accent,
		accentForeground: pickForeground(base.accent),
		destructive: base.destructive,
		destructiveHover: darken(base.destructive, 0.08),
		destructiveForeground: pickForeground(base.destructive),
		border: base.border,
		input: base.border,
		ring: base.primary,
		ratingPositive: rating.ratingPositive,
		ratingNeutral: rating.ratingNeutral,
		ratingNegative: rating.ratingNegative,
		ratingUndecided: rating.ratingUndecided,
	};
}

/** Map a FullThemeTokens object to the app.css `--color-*` custom property names. */
export function toCssVarMap(tokens: FullThemeTokens): Record<string, string> {
	return {
		'--color-background': tokens.background,
		'--color-foreground': tokens.foreground,
		'--color-card': tokens.card,
		'--color-card-foreground': tokens.cardForeground,
		'--color-popover': tokens.popover,
		'--color-popover-foreground': tokens.popoverForeground,
		'--color-primary': tokens.primary,
		'--color-primary-hover': tokens.primaryHover,
		'--color-primary-foreground': tokens.primaryForeground,
		'--color-secondary': tokens.secondary,
		'--color-secondary-hover': tokens.secondaryHover,
		'--color-secondary-foreground': tokens.secondaryForeground,
		'--color-muted': tokens.muted,
		'--color-muted-foreground': tokens.mutedForeground,
		'--color-accent': tokens.accent,
		'--color-accent-foreground': tokens.accentForeground,
		'--color-destructive': tokens.destructive,
		'--color-destructive-hover': tokens.destructiveHover,
		'--color-destructive-foreground': tokens.destructiveForeground,
		'--color-border': tokens.border,
		'--color-input': tokens.input,
		'--color-ring': tokens.ring,
		'--color-rating-positive': tokens.ratingPositive,
		'--color-rating-neutral': tokens.ratingNeutral,
		'--color-rating-negative': tokens.ratingNegative,
		'--color-rating-undecided': tokens.ratingUndecided,
	};
}
