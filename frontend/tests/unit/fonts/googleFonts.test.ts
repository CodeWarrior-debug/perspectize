import { describe, it, expect } from 'vitest';
import {
	familyParam,
	fontStack,
	parseCatalog,
	previewHref,
	searchFonts,
	stylesheetHref,
	toChoice,
	type FontCatalogRow,
	type FontChoice,
	type FontSearchOptions,
} from '$lib/fonts/googleFonts';
import catalogRows from '$lib/fonts/google-fonts-catalog.json';
import { FONT_PAIRINGS, FONT_SLOT_INFO, FONT_SLOTS } from '$lib/fonts/slots';

const ROWS: FontCatalogRow[] = [
	['Inter', 'a', [100, 200, 300, 400, 500, 600, 700, 800, 900], 1, 1],
	['Literata', 's', [200, 300, 400, 500, 600, 700, 800, 900], 1, 1],
	['Lobster', 'd', [400], 0, 0],
	['Bungee Hairline', 'd', [100], 0, 0],
	['Fira Code', 'm', [300, 400, 500, 600, 700], 0, 1],
	['Caveat', 'h', [400, 500, 600, 700], 0, 1],
	['Ubuntu', 'a', [300, 400, 500, 700], 1, 0],
];
const CATALOG = parseCatalog(ROWS);
const entry = (family: string) => CATALOG.find((e) => e.family === family)!;

describe('parseCatalog / toChoice', () => {
	it('expands compact rows into entries', () => {
		expect(entry('Lobster')).toEqual({
			family: 'Lobster',
			category: 'd',
			weights: [400],
			italic: false,
			variable: false,
		});
		expect(entry('Inter').italic).toBe(true);
		expect(entry('Inter').variable).toBe(true);
	});

	it('keeps only what loading and applying need', () => {
		expect(toChoice(entry('Caveat'))).toEqual({
			family: 'Caveat',
			category: 'h',
			weights: [400, 500, 600, 700],
			italic: false,
		});
	});
});

describe('fontStack', () => {
	it('quotes the family and falls back within the same category', () => {
		expect(fontStack({ family: 'Literata', category: 's' })).toBe("'Literata', Georgia, 'Times New Roman', serif");
		expect(fontStack({ family: 'Inter', category: 'a' })).toBe("'Inter', system-ui, -apple-system, sans-serif");
		expect(fontStack({ family: 'Fira Code', category: 'm' })).toBe("'Fira Code', ui-monospace, monospace");
		expect(fontStack({ family: 'Caveat', category: 'h' })).toBe("'Caveat', cursive");
		expect(fontStack({ family: 'Lobster', category: 'd' })).toBe("'Lobster', system-ui, sans-serif");
	});

	it('escapes quotes and backslashes so a family name cannot break out of the string', () => {
		expect(fontStack({ family: "It's\\x", category: 'a' })).toBe("'It\\'s\\\\x', system-ui, -apple-system, sans-serif");
	});
});

describe('familyParam', () => {
	it('requests only the 400–700 weights a family has, plus italics when it has them', () => {
		expect(familyParam(toChoice(entry('Inter')))).toBe(
			'Inter:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700',
		);
		expect(familyParam(toChoice(entry('Fira Code')))).toBe('Fira+Code:wght@400;500;600;700');
		expect(familyParam(toChoice(entry('Ubuntu')))).toBe('Ubuntu:ital,wght@0,400;0,500;0,700;1,400;1,500;1,700');
	});

	it('falls back to the weight closest to 400 when none are in range', () => {
		expect(familyParam(toChoice(entry('Bungee Hairline')))).toBe('Bungee+Hairline:wght@100');
	});

	it('sends the bare name when no weights are known', () => {
		expect(familyParam({ family: 'Mystery Font', category: 'a', weights: [], italic: false })).toBe('Mystery+Font');
	});
});

describe('stylesheetHref', () => {
	it('is null when nothing is picked', () => {
		expect(stylesheetHref([null, null, null])).toBeNull();
	});

	it('loads every picked family once, with display=swap', () => {
		const inter = toChoice(entry('Inter'));
		const lobster = toChoice(entry('Lobster'));
		expect(stylesheetHref([inter, null, inter, lobster])).toBe(
			'https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&family=Lobster:wght@400&display=swap',
		);
	});
});

describe('previewHref', () => {
	it('subsets to the glyphs of the name', () => {
		expect(previewHref('Fira Code')).toBe(
			'https://fonts.googleapis.com/css2?family=Fira+Code&text=Fira%20Code&display=block',
		);
	});
});

describe('searchFonts', () => {
	const recommended = [
		['Literata', 'for reading'],
		['Retired Font', 'no longer on Google Fonts'],
		['Inter', 'for UI'],
	] as const;
	const base: FontSearchOptions = { query: '', category: 'all', variableOnly: false, recommended };
	const families = (opts: Partial<FontSearchOptions>) =>
		searchFonts(CATALOG, { ...base, ...opts }).map((o) => o.entry.family);

	it('lists recommended families first, in curated order, then the rest A–Z', () => {
		const out = searchFonts(CATALOG, base);
		expect(out.map((o) => o.entry.family)).toEqual([
			'Literata',
			'Inter',
			'Bungee Hairline',
			'Caveat',
			'Fira Code',
			'Lobster',
			'Ubuntu',
		]);
		expect(out[0]).toMatchObject({ group: 'recommended', note: 'for reading' });
		expect(out[2].group).toBe('all');
	});

	it('skips recommended families missing from the catalog', () => {
		expect(families({})).not.toContain('Retired Font');
	});

	it('matches case-insensitively and ranks names starting with the query first', () => {
		expect(families({ query: 'BU' })).toEqual(['Bungee Hairline', 'Ubuntu']);
		expect(families({ query: '  co ' })).toEqual(['Fira Code']);
	});

	it('filters by category and variable support, recommended entries included', () => {
		expect(families({ category: 's' })).toEqual(['Literata']);
		expect(families({ category: 'd' })).toEqual(['Bungee Hairline', 'Lobster']);
		expect(families({ variableOnly: true })).toEqual(['Literata', 'Inter', 'Caveat', 'Fira Code']);
	});

	it('returns nothing when nothing matches', () => {
		expect(families({ query: 'zzz' })).toEqual([]);
	});
});

describe('google-fonts-catalog.json', () => {
	const real = parseCatalog(catalogRows as FontCatalogRow[]);
	const names = new Set(real.map((e) => e.family));

	it('is a sorted, well-formed list of Google Fonts families', () => {
		expect(real.length).toBeGreaterThan(1000);
		for (const e of real) {
			expect(['s', 'a', 'd', 'h', 'm']).toContain(e.category);
			expect(e.weights.length).toBeGreaterThan(0);
		}
		expect(names.size).toBe(real.length);
	});

	it('contains every recommended and paired family (regenerate or update slots.ts if not)', () => {
		for (const slot of FONT_SLOTS) {
			for (const [family] of FONT_SLOT_INFO[slot].recommended) expect(names, `${slot}: ${family}`).toContain(family);
		}
		for (const pairing of FONT_PAIRINGS) {
			for (const family of Object.values(pairing.picks))
				if (family) expect(names, `${pairing.name}: ${family}`).toContain(family);
		}
	});

	it('has every weight the pickers would request for the recommended families', () => {
		const geist = real.find((e) => e.family === 'Geist');
		expect(geist?.variable).toBe(true);
		const choice: FontChoice = toChoice(real.find((e) => e.family === 'Literata')!);
		expect(familyParam(choice)).toContain('Literata:ital,wght@');
	});
});
