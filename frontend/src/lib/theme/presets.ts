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
		id: 'fd-reading-room-v2',
		name: 'Reading Room v2',
		mood: 'Cool paper, ink blue; the current identity, calmed',
		base: {
			primary: '#24406b',
			primaryHover: '#153059',
			secondary: '#f3f1ec',
			accent: '#b7791f',
			background: '#fbfaf7',
			foreground: '#1f2933',
			border: '#dcd8cf',
			destructive: '#b3372d',
		},
	},
	{
		id: 'fd-fieldnote',
		name: 'Fieldnote',
		mood: 'Pale sage paper, evergreen ink',
		base: {
			primary: '#2f5d4a',
			primaryHover: '#1e4c3a',
			secondary: '#eaefec',
			accent: '#8a6d2b',
			background: '#f6f8f7',
			foreground: '#1d2a24',
			border: '#cfd9d3',
			destructive: '#a83a2c',
		},
	},
	{
		id: 'fd-archive-warm',
		name: 'Archive Warm',
		mood: 'Close to the existing sepia but with the missing hover step',
		base: {
			primary: '#7c5a2e',
			primaryHover: '#6a491c',
			secondary: '#f5ebdd',
			accent: '#3d6b7a',
			background: '#fdf6ee',
			foreground: '#3a2f22',
			border: '#dcc9a8',
			destructive: '#a9411e',
		},
	},
	{
		id: 'fd-lavender-ledger',
		name: 'Lavender Ledger',
		mood: 'Quiet violet tint; ties to the logo purple',
		base: {
			primary: '#4c3fa3',
			primaryHover: '#3d2d90',
			secondary: '#eeeef4',
			accent: '#c2410c',
			background: '#f7f7fa',
			foreground: '#22222e',
			border: '#d5d5e2',
			destructive: '#b3261e',
		},
	},
	{
		id: 'fd-plain-sheet',
		name: 'Plain Sheet',
		mood: 'Neutral white, maximum legibility, blue only on interaction',
		base: {
			primary: '#1d4ed8',
			primaryHover: '#0d39c3',
			secondary: '#f4f4f5',
			accent: '#0f766e',
			background: '#ffffff',
			foreground: '#18181b',
			border: '#e0e0e4',
			destructive: '#b91c1c',
		},
	},
	{
		id: 'fd-harbour-mist',
		name: 'Harbour Mist',
		mood: 'Grey-warm paper with a teal-grey hover',
		base: {
			primary: '#2c5f6f',
			primaryHover: '#1a4e5e',
			secondary: '#efebe3',
			accent: '#a65d2e',
			background: '#f8f6f2',
			foreground: '#2a2a2a',
			border: '#d8d3c8',
			destructive: '#ad3b30',
		},
	},
	{
		id: 'fd-midnight-v2',
		name: 'Midnight v2',
		mood: 'Deep slate, not black; hover clearly lifts',
		base: {
			primary: '#7aa2e3',
			primaryHover: '#8cb5f7',
			secondary: '#1a212b',
			accent: '#e0b15a',
			background: '#13181f',
			foreground: '#e6e9ee',
			border: '#2c3648',
			destructive: '#f07178',
		},
	},
	{
		id: 'fd-lamp-oil',
		name: 'Lamp Oil',
		mood: 'Charcoal with amber, like a desk lamp',
		base: {
			primary: '#e0a94a',
			primaryHover: '#f4bc5e',
			secondary: '#1d1f23',
			accent: '#7fb5c9',
			background: '#16171a',
			foreground: '#e8e6e1',
			border: '#34363b',
			destructive: '#ef7a6e',
		},
	},
	{
		id: 'fd-deep-herbarium',
		name: 'Deep Herbarium',
		mood: 'Blue-green dark, restrained replacement for Terminal',
		base: {
			primary: '#6fcf9f',
			primaryHover: '#83e3b2',
			secondary: '#15231f',
			accent: '#d9b26a',
			background: '#0f1a17',
			foreground: '#e2efe9',
			border: '#27403a',
			destructive: '#f2796f',
		},
	},
	{
		id: 'fd-rose-vellum',
		name: 'Rose Vellum',
		mood: 'Blush paper, plum ink; one deliberate departure',
		base: {
			primary: '#7a2e4d',
			primaryHover: '#671d3d',
			secondary: '#f4eaed',
			accent: '#2f6f6a',
			background: '#fbf5f6',
			foreground: '#2b1f24',
			border: '#e0ccd2',
			destructive: '#b3261e',
		},
	},
];

export const DEFAULT_THEME_ID = 'reading-room';

/** Full (base + derived) token sets for every preset, computed once. */
export const THEME_PRESET_TOKENS: Record<string, FullThemeTokens> = Object.fromEntries(
	THEME_PRESETS.map((p) => [p.id, deriveTheme(p.base)]),
);

/**
 * What a preset card previews: three stacked rows (page, zebra, hover) that mimic the table, plus
 * the primary. Seeing the hover row next to the zebra lets a user judge the table before choosing.
 */
export function presetStripColors(tokens: FullThemeTokens): { rows: [string, string, string]; primary: string } {
	return { rows: [tokens.background, tokens.rowAlt, tokens.rowHover], primary: tokens.primary };
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
