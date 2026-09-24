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
			secondary: '#f5f3ee',
			accent: '#f7fafc',
			background: '#fbfaf7',
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
		id: 'dt-fog',
		name: 'Fog',
		mood: 'Cool neutral, most calming and clearest',
		base: {
			primary: '#2f5d73',
			primaryHover: '#1d4c62',
			secondary: '#eef0f2',
			accent: '#3b7a8c',
			background: '#f6f7f8',
			foreground: '#1c2024',
			border: '#d5d9dd',
			destructive: '#b42318',
		},
	},
	{
		id: 'dt-sage-paper',
		name: 'Sage Paper',
		mood: 'Herbarium quiet, green accent',
		base: {
			primary: '#2f4a3a',
			primaryHover: '#1f3a2b',
			secondary: '#eff3ee',
			accent: '#4d7a5e',
			background: '#f7f9f6',
			foreground: '#1d2a22',
			border: '#d3dcd3',
			destructive: '#b42318',
		},
	},
	{
		id: 'dt-slate-cobalt',
		name: 'Slate Cobalt',
		mood: 'Bolder: one saturated blue on cold neutral',
		base: {
			primary: '#2751d9',
			primaryHover: '#193dc4',
			secondary: '#f0f2f6',
			accent: '#1d4ed8',
			background: '#f8f9fb',
			foreground: '#14181f',
			border: '#d8dce4',
			destructive: '#b42318',
		},
	},
	{
		id: 'dt-clay-slate',
		name: 'Clay Slate',
		mood: 'Bolder: warm rust on cool grey, no brass',
		base: {
			primary: '#a8432a',
			primaryHover: '#943017',
			secondary: '#efedeb',
			accent: '#3f4b5c',
			background: '#f7f6f5',
			foreground: '#211d1b',
			border: '#dedad6',
			destructive: '#b42318',
		},
	},
	{
		id: 'dt-lavender-mist',
		name: 'Lavender Mist',
		mood: 'Soft violet, executed with intent, low saturation',
		base: {
			primary: '#5b46b0',
			primaryHover: '#4c349c',
			secondary: '#f0eef6',
			accent: '#7a68c4',
			background: '#f8f7fb',
			foreground: '#1e1b2b',
			border: '#dcd8e8',
			destructive: '#b42318',
		},
	},
	{
		id: 'dt-midnight',
		name: 'Midnight Slate',
		mood: 'Late-night reading, blue-black',
		base: {
			primary: '#7fa2e6',
			primaryHover: '#91b5fa',
			secondary: '#181c25',
			accent: '#a3bdf0',
			background: '#12151c',
			foreground: '#e6e9ef',
			border: '#2c3340',
			destructive: '#f0796b',
		},
	},
	{
		id: 'dt-graphite',
		name: 'Graphite',
		mood: 'Neutral off-black, no hue fight',
		base: {
			primary: '#8db4ff',
			primaryHover: '#9fc7ff',
			secondary: '#1a1a1a',
			accent: '#b7c9f5',
			background: '#141414',
			foreground: '#e8e8e8',
			border: '#333333',
			destructive: '#f0796b',
		},
	},
	{
		id: 'dt-forest-night',
		name: 'Forest Night',
		mood: 'Herbarium at night, green accent',
		base: {
			primary: '#7cc79a',
			primaryHover: '#8fdbad',
			secondary: '#151d18',
			accent: '#a6dbb9',
			background: '#101613',
			foreground: '#e4ebe6',
			border: '#26332c',
			destructive: '#f0796b',
		},
	},
	{
		id: 'dt-ink-cobalt',
		name: 'Ink Cobalt',
		mood: 'Bolder dark: deep navy with a vivid blue hover',
		base: {
			primary: '#6f9bff',
			primaryHover: '#81aeff',
			secondary: '#151b2a',
			accent: '#9db8ff',
			background: '#0f1420',
			foreground: '#e8edf7',
			border: '#263049',
			destructive: '#f0796b',
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
