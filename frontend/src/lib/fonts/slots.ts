/**
 * The three font slots a user can override in Settings → Fonts, and the curated suggestions
 * shown first in each picker. Which elements belong to which slot is decided in app.css
 * (`:root[data-font-*]` rules) and by the `font-slot-*` marker classes on components.
 */

export type FontSlot = 'heading' | 'cell' | 'longform';

export const FONT_SLOTS: readonly FontSlot[] = ['heading', 'cell', 'longform'];

export interface FontSlotInfo {
	label: string;
	/** What the slot changes, in user terms. */
	usedFor: string;
	/** Short guidance shown in the slot's info tooltip. */
	advice: string;
	/** Name of what the app uses when nothing is picked. */
	defaultLabel: string;
	sample: string;
	/** Typography of the live sample line, roughly matching where the slot is used. */
	sampleClass: string;
	/** Utility that draws the sample in the slot's default font while nothing is picked. */
	defaultFontClass: string;
	recommended: readonly (readonly [string, string])[];
}

export const FONT_SLOT_INFO: Record<FontSlot, FontSlotInfo> = {
	heading: {
		label: 'Headings',
		usedFor: 'Page and dialog titles, and table column headers.',
		advice:
			'Headings are short and often bold, and column headers are small. A clean sans-serif stays crisp at 11–14px; a display serif adds character to page titles, but check it still reads as a column header.',
		defaultLabel: 'Geist',
		sample: 'Activity · Duration · Released',
		sampleClass: 'text-[17px] font-semibold',
		defaultFontClass: '', // inherits Geist, the app's default font
		recommended: [
			['Inter', 'Neutral workhorse, very legible at small bold sizes'],
			['Instrument Sans', 'Crisp, slightly narrow: tidy column headers'],
			['IBM Plex Sans', 'Engineered feel; pairs with IBM Plex Serif'],
			['Manrope', 'Modern geometric with open shapes'],
			['Space Grotesk', 'Geometric with personality'],
			['Fraunces', 'Soft, characterful serif for page titles'],
			['Newsreader', 'Editorial serif for titles and text'],
			['Instrument Serif', 'Elegant display serif; one weight, titles only'],
		],
	},
	cell: {
		label: 'Table cells',
		usedFor: 'Table cells, item titles (table, cards, details), stats and tags.',
		advice:
			'Cells are scanned, not read. Favour a large x-height, open letterforms and tabular (fixed-width) numbers so figures line up: usually a sans-serif, or a sturdy screen serif.',
		defaultLabel: 'Charter',
		sample: 'Good Will Hunting · 2:07 · $225.9M · 2,259%',
		sampleClass: 'text-[13px]',
		defaultFontClass: 'font-[family-name:var(--font-family-serif)]',
		recommended: [
			['Inter', 'Excellent at 13px; tabular figures for aligned numbers'],
			['IBM Plex Sans', 'Clear, slightly technical; tabular figures'],
			['Public Sans', 'Neutral, highly legible'],
			['Atkinson Hyperlegible Next', 'Maximises character distinction (Il1 O0)'],
			['Roboto Flex', 'Variable width: fits more into narrow columns'],
			['Source Serif 4', 'Sturdy screen serif if you want to keep a serif'],
			['Literata', 'Serif built for screens; holds up small'],
		],
	},
	longform: {
		label: 'Long-form reading',
		usedFor: 'Descriptions, synopses, Bible passages, comments and perspective text.',
		advice:
			'Paragraphs need comfort over many lines: a text serif with moderate contrast, generous spacing and a real italic. Display or very high-contrast faces tire the eye; avoid handwriting styles here.',
		defaultLabel: 'Charter + Georgia',
		sample: 'In the beginning God created the heavens and the earth.',
		sampleClass: 'text-[15px] leading-relaxed',
		defaultFontClass: 'font-[family-name:var(--font-family-serif)]',
		recommended: [
			['Literata', 'Designed for e-reading; calm and even'],
			['Source Serif 4', 'Optical sizes; very comfortable paragraphs'],
			['Newsreader', 'Editorial texture, made for long reads'],
			['Lora', 'Warm, brushed curves; friendly'],
			['Merriweather', 'Large x-height; robust on low-res screens'],
			['Crimson Pro', 'Classic book feel, slightly compact'],
			['EB Garamond', 'Old-style elegance; best at 15px or larger'],
			['Spectral', 'Elegant and light, made for screens'],
			['Atkinson Hyperlegible Next', 'Accessibility-first sans alternative'],
		],
	},
};

/** One-click combinations. `null` = the app's default for that slot. */
export interface FontPairing {
	name: string;
	picks: Record<FontSlot, string | null>;
}

export const FONT_PAIRINGS: readonly FontPairing[] = [
	{ name: 'Default', picks: { heading: null, cell: null, longform: null } },
	{ name: 'Editorial', picks: { heading: 'Fraunces', cell: 'Source Serif 4', longform: 'Literata' } },
	{ name: 'Modern', picks: { heading: 'Inter', cell: 'Inter', longform: 'Newsreader' } },
	{ name: 'Technical', picks: { heading: 'IBM Plex Sans', cell: 'IBM Plex Sans', longform: 'IBM Plex Serif' } },
	{ name: 'Bookish', picks: { heading: 'Instrument Serif', cell: 'Public Sans', longform: 'EB Garamond' } },
	{
		name: 'Accessible',
		picks: { heading: 'Atkinson Hyperlegible Next', cell: 'Atkinson Hyperlegible Next', longform: 'Merriweather' },
	},
];
