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
		id: 'aw-refined-dusk-rose',
		name: 'Dusk Rose',
		mood: 'Soft blush, gentle and human',
		base: {
			primary: '#7a3b45',
			primaryHover: '#682b35',
			secondary: '#f4ece9',
			accent: '#b0566a',
			background: '#fbf7f6',
			foreground: '#2e2422',
			border: '#e2cfc9',
			destructive: '#a8351f',
		},
	},
	{
		id: 'aw-refined-slate-light',
		name: 'Slate Light',
		mood: 'Bolder cool blue-grey, techy',
		base: {
			primary: '#1d4ed8',
			primaryHover: '#0d39c3',
			secondary: '#f1f5f9',
			accent: '#0e7490',
			background: '#f8fafc',
			foreground: '#0f172a',
			border: '#cbd5e1',
			destructive: '#b91c1c',
		},
	},
	{
		id: 'aw-refined-midnight-ink',
		name: 'Midnight Ink',
		mood: 'Late-night navy',
		base: {
			primary: '#8fb0f0',
			primaryHover: '#a1c3ff',
			secondary: '#1a2136',
			accent: '#b79cf0',
			background: '#141a2b',
			foreground: '#e8ebf4',
			border: '#2f3a5c',
			destructive: '#f08a80',
		},
	},
	{
		id: 'aw-refined-charcoal-sage',
		name: 'Charcoal Sage',
		mood: 'Dark neutral with green calm',
		base: {
			primary: '#8fc4a0',
			primaryHover: '#a2d7b3',
			secondary: '#222724',
			accent: '#c9b872',
			background: '#1b1f1c',
			foreground: '#e7ece8',
			border: '#3a4540',
			destructive: '#ef8a80',
		},
	},
	{
		id: 'aw-refined-warm-umber',
		name: 'Warm Umber',
		mood: 'Dark sepia, reading-lamp feel',
		base: {
			primary: '#d9b276',
			primaryHover: '#edc589',
			secondary: '#282219',
			accent: '#d98a5f',
			background: '#211c17',
			foreground: '#efe7db',
			border: '#4a3f30',
			destructive: '#ef8a80',
		},
	},
	{
		id: 'aw-refined-deep-sea',
		name: 'Deep Sea',
		mood: 'Bold dark teal-blue',
		base: {
			primary: '#6cc4e0',
			primaryHover: '#80d8f4',
			secondary: '#142430',
			accent: '#f2a65a',
			background: '#0f1b24',
			foreground: '#e3eef5',
			border: '#274a60',
			destructive: '#f28b82',
		},
	},
	{
		id: 'aw-minimal-minimal-paper',
		name: 'Minimal Paper',
		mood: 'Default candidate: white, near-black, indigo hover',
		base: {
			primary: '#0c0c09',
			primaryHover: '#030302',
			secondary: '#f4f4f1',
			accent: '#312c85',
			background: '#ffffff',
			foreground: '#0c0c09',
			border: '#dcdcd6',
			destructive: '#b91c1c',
		},
	},
	{
		id: 'aw-minimal-warm-bone',
		name: 'Warm Bone',
		mood: 'Off-white page, softest and calmest',
		base: {
			primary: '#312c85',
			primaryHover: '#241972',
			secondary: '#edede8',
			accent: '#0c0c09',
			background: '#f4f4f1',
			foreground: '#0c0c09',
			border: '#d6d6ce',
			destructive: '#b91c1c',
		},
	},
	{
		id: 'aw-minimal-graphite',
		name: 'Graphite',
		mood: 'Minimal inverted: near-black, indigo hover',
		base: {
			primary: '#f4f4f1',
			primaryHover: '#fffffc',
			secondary: '#141411',
			accent: '#a5a0f0',
			background: '#0c0c09',
			foreground: '#f4f4f1',
			border: '#2c2c27',
			destructive: '#f87171',
		},
	},
	{
		id: 'aw-minimal-terminal-glow',
		name: 'Terminal Glow',
		mood: 'Power-user green on black, lit hover',
		base: {
			primary: '#4ade80',
			primaryHover: '#62f293',
			secondary: '#101512',
			accent: '#86efac',
			background: '#090b0a',
			foreground: '#c9f5d9',
			border: '#233327',
			destructive: '#ff6b6b',
		},
	},
	{
		id: 'aw-clean-mist',
		name: 'Mist',
		mood: 'Cool blue-grey, most calming and clear',
		base: {
			primary: '#1d4e89',
			primaryHover: '#093d77',
			secondary: '#ebf0f5',
			accent: '#3b82c4',
			background: '#f5f8fb',
			foreground: '#152230',
			border: '#d5dee8',
			destructive: '#b91c1c',
		},
	},
	{
		id: 'aw-clean-forest-night',
		name: 'Forest Night',
		mood: 'Deep green dark, calm',
		base: {
			primary: '#5fbf8f',
			primaryHover: '#73d2a1',
			secondary: '#121b17',
			accent: '#a3d9b8',
			background: '#0e1512',
			foreground: '#e4efe8',
			border: '#26382e',
			destructive: '#f87171',
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
