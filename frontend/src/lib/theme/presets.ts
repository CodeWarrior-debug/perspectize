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
		name: 'Minimal Graphite',
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
		name: 'Sea Mist',
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
