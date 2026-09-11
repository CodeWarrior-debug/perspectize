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
];

export const DEFAULT_THEME_ID = 'reading-room';

/** Full (base + derived) token sets for every preset, computed once. */
export const THEME_PRESET_TOKENS: Record<string, FullThemeTokens> = Object.fromEntries(
	THEME_PRESETS.map((p) => [p.id, deriveTheme(p.base)]),
);

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
