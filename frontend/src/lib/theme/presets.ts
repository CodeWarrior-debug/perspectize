import { deriveTheme, toCssVarMap, type BaseThemeTokens, type FullThemeTokens } from './derive';

export interface ThemePreset {
	id: string;
	name: string;
	mood: string;
	base: BaseThemeTokens;
}

/**
 * 5 curated presets per .impeccable.md's "Theme System" section. Only Reading
 * Room was previously designed anywhere (it's the app's current, unchanged
 * palette) — the other 4 base palettes are original to this feature.
 */
export const THEME_PRESETS: ThemePreset[] = [
	{
		id: 'reading-room',
		name: 'Reading Room',
		mood: 'Navy on warm paper-white.',
		base: {
			primary: '#1a365d',
			primaryHover: '#2d3748',
			secondary: '#f5f5f5',
			accent: '#f7fafc',
			background: '#ffffff',
			foreground: '#171717',
			border: '#d4d4d4',
			destructive: '#dc2626',
		},
	},
	{
		id: 'archive',
		name: 'Archive',
		mood: 'Sepia, cotton rag, warm graphite text.',
		base: {
			primary: '#7c5a2e',
			primaryHover: '#634a26',
			secondary: '#f3ece0',
			accent: '#efe4d3',
			background: '#fbf6ec',
			foreground: '#3a2f22',
			border: '#dcc9a8',
			destructive: '#b3441f',
		},
	},
	{
		id: 'garden',
		name: 'Garden',
		mood: 'Herbarium green, field-guide quiet.',
		base: {
			primary: '#2f4a3a',
			primaryHover: '#26392d',
			secondary: '#eef2ea',
			accent: '#e5ecdf',
			background: '#fbfcf8',
			foreground: '#233026',
			border: '#c9d6c1',
			destructive: '#a6421f',
		},
	},
	{
		id: 'midnight',
		name: 'Midnight',
		mood: 'Late-night long-form review writing.',
		base: {
			primary: '#0d1b33',
			primaryHover: '#16263f',
			secondary: '#1c2436',
			accent: '#232c42',
			background: '#10141f',
			foreground: '#e8e6df',
			border: '#2c3448',
			destructive: '#e5484d',
		},
	},
	{
		id: 'terminal',
		name: 'Terminal',
		mood: 'Power-user. Precise, dense, quietly nostalgic.',
		base: {
			primary: '#00301f',
			primaryHover: '#00432b',
			secondary: '#141614',
			accent: '#0f1f16',
			background: '#0a0b0a',
			foreground: '#c9f5d9',
			border: '#233327',
			destructive: '#ff5c5c',
		},
	},
	{
		id: 'imp-reading-room-calm',
		name: 'Reading Room Calm',
		mood: 'Current navy identity, warmed and quieted; clear and calming',
		base: {
			primary: '#2c4a7a',
			primaryHover: '#1c3a68',
			secondary: '#f5f3ee',
			accent: '#c9d7ea',
			background: '#fbfaf7',
			foreground: '#1d2430',
			border: '#dcd8cf',
			destructive: '#b04a3a',
		},
	},
	{
		id: 'imp-archive-sepia',
		name: 'Archive Sepia',
		mood: 'Warm paper for long reading; calming',
		base: {
			primary: '#7c5a2e',
			primaryHover: '#6a491c',
			secondary: '#f3ead9',
			accent: '#e8d9b8',
			background: '#faf4ea',
			foreground: '#3a2f22',
			border: '#d9c8a6',
			destructive: '#a83f22',
		},
	},
	{
		id: 'imp-garden-herbarium',
		name: 'Garden Herbarium',
		mood: 'Field-guide green, quiet and organic; calming',
		base: {
			primary: '#2f6b45',
			primaryHover: '#1c5a35',
			secondary: '#eef4ee',
			accent: '#cfe6d3',
			background: '#f6faf6',
			foreground: '#1f2d22',
			border: '#cfdcd0',
			destructive: '#ab4032',
		},
	},
	{
		id: 'imp-mist',
		name: 'Mist',
		mood: 'Neutral cool grey-blue, the most invisible chrome; clear',
		base: {
			primary: '#3b5b8c',
			primaryHover: '#2b4a7a',
			secondary: '#eaeef2',
			accent: '#d5e0ef',
			background: '#f4f6f8',
			foreground: '#1b2530',
			border: '#d3d9e0',
			destructive: '#b04437',
		},
	},
	{
		id: 'imp-linen-rose',
		name: 'Linen Rose',
		mood: 'Warm blush with a berry primary; beautiful',
		base: {
			primary: '#8f3f4f',
			primaryHover: '#7c2e3f',
			secondary: '#f5ece8',
			accent: '#ecd0d6',
			background: '#fbf6f4',
			foreground: '#2a1d1f',
			border: '#e6d5d0',
			destructive: '#a6342f',
		},
	},
	{
		id: 'imp-saffron-paper',
		name: 'Saffron Paper',
		mood: 'Warm white with an amber-orange primary, the most energetic; interesting',
		base: {
			primary: '#a34e08',
			primaryHover: '#8f3c00',
			secondary: '#f7f2e2',
			accent: '#f6dfa8',
			background: '#fffdf6',
			foreground: '#231f16',
			border: '#e6dcc0',
			destructive: '#b03a2a',
		},
	},
	{
		id: 'imp-midnight',
		name: 'Midnight Indigo',
		mood: 'Late-night reading, deep indigo; calming',
		base: {
			primary: '#7e96d7',
			primaryHover: '#90a9eb',
			secondary: '#15171e',
			accent: '#2b3566',
			background: '#0f1014',
			foreground: '#e4e6ee',
			border: '#262b3a',
			destructive: '#ef8a80',
		},
	},
	{
		id: 'imp-slate-dark',
		name: 'Slate Dark',
		mood: 'Neutral graphite, lowest saturation, for long sessions; clear',
		base: {
			primary: '#5f89ba',
			primaryHover: '#709ccf',
			secondary: '#17191d',
			accent: '#263854',
			background: '#121316',
			foreground: '#d9dde3',
			border: '#343a44',
			destructive: '#e27870',
		},
	},
	{
		id: 'imp-terminal',
		name: 'Terminal Green',
		mood: 'Power-user green on near-black, dense and precise; interesting',
		base: {
			primary: '#51b67a',
			primaryHover: '#65c98c',
			secondary: '#101411',
			accent: '#17432a',
			background: '#0b0e0c',
			foreground: '#d6e6db',
			border: '#1f2b24',
			destructive: '#ee8c80',
		},
	},
	{
		id: 'imp-dusk-plum',
		name: 'Dusk Plum',
		mood: 'Violet dusk, the boldest dark option; beautiful',
		base: {
			primary: '#a886cf',
			primaryHover: '#bb99e3',
			secondary: '#18161c',
			accent: '#3d2f5c',
			background: '#111014',
			foreground: '#e9e6ee',
			border: '#2b2733',
			destructive: '#f08c88',
		},
	},
];

export const DEFAULT_THEME_ID = 'reading-room';

/** Full (base + derived) token sets for every preset, computed once. */
export const THEME_PRESET_TOKENS: Record<string, FullThemeTokens> = Object.fromEntries(
	THEME_PRESETS.map((p) => [p.id, deriveTheme(p.base)]),
);

/**
 * The four dots on a preset card: page, row hover, primary, text. Showing the hover row (rather
 * than several near-white surfaces) lets a user see what the table will do before choosing, and
 * keeps two dark presets with similar primaries from looking identical.
 */
export function presetSwatchColors(tokens: FullThemeTokens): [string, string, string, string] {
	return [tokens.background, tokens.rowHover, tokens.primary, tokens.foreground];
}

/** Generated `[data-theme='<id>'] { --color-*: ...; }` CSS text for every non-default preset. */
export function generatePresetCss(): string {
	return THEME_PRESETS.filter((p) => p.id !== DEFAULT_THEME_ID)
		.map((p) => {
			const vars = toCssVarMap(THEME_PRESET_TOKENS[p.id]);
			const lines = Object.entries(vars)
				.map(([k, v]) => `\t${k}: ${v};`)
				.join('\n');
			return `[data-theme='${p.id}'] {\n${lines}\n}`;
		})
		.join('\n\n');
}
