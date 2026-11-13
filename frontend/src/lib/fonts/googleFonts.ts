/**
 * Google Fonts helpers for the Settings → Fonts pickers: catalog parsing, search ranking,
 * CSS stacks and stylesheet URLs. Pure functions — the store and components own the DOM.
 */

/** Catalog category codes, as stored in google-fonts-catalog.json. */
export type FontCategory = 's' | 'a' | 'd' | 'h' | 'm';

export const CATEGORY_LABEL: Record<FontCategory, string> = {
	s: 'Serif',
	a: 'Sans-serif',
	m: 'Monospace',
	d: 'Display',
	h: 'Handwriting',
};

/** A row of google-fonts-catalog.json: [family, category, weights, hasItalic, isVariable]. */
export type FontCatalogRow = [string, FontCategory, number[], 0 | 1, 0 | 1];

export interface FontEntry {
	family: string;
	category: FontCategory;
	weights: number[];
	italic: boolean;
	variable: boolean;
}

/** A picked font — everything needed to load and apply it without the catalog. */
export interface FontChoice {
	family: string;
	category: FontCategory;
	weights: number[];
	italic: boolean;
}

export function parseCatalog(rows: readonly FontCatalogRow[]): FontEntry[] {
	return rows.map(([family, category, weights, italic, variable]) => ({
		family,
		category,
		weights,
		italic: italic === 1,
		variable: variable === 1,
	}));
}

export function toChoice(entry: FontEntry): FontChoice {
	return { family: entry.family, category: entry.category, weights: entry.weights, italic: entry.italic };
}

const FALLBACK: Record<FontCategory, string> = {
	s: "Georgia, 'Times New Roman', serif",
	a: 'system-ui, -apple-system, sans-serif',
	m: 'ui-monospace, monospace',
	d: 'system-ui, sans-serif',
	h: 'cursive',
};

/** CSS font-family value: the family, then a same-category fallback for offline or slow loads. */
export function fontStack(choice: Pick<FontChoice, 'family' | 'category'>): string {
	return `'${choice.family.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}', ${FALLBACK[choice.category]}`;
}

/** UI text sizes only need the regular-to-bold range; asking for more just costs bytes. */
const WANTED_WEIGHTS = [400, 500, 600, 700];

/**
 * The `family=` value for css2. Requests only weights the family has (css2 answers 400 for any
 * weight a family lacks), plus italics when available.
 */
export function familyParam(choice: FontChoice): string {
	const name = encodeURIComponent(choice.family).replace(/%20/g, '+');
	let weights = choice.weights.filter((w) => WANTED_WEIGHTS.includes(w));
	if (weights.length === 0) {
		// Display/handwriting faces often ship one non-400 weight: take the one closest to 400.
		const closest = choice.weights.reduce((a, b) => (Math.abs(b - 400) < Math.abs(a - 400) ? b : a), choice.weights[0]);
		weights = closest ? [closest] : [];
	}
	if (weights.length === 0) return name;
	if (choice.italic) {
		const pairs = [...weights.map((w) => `0,${w}`), ...weights.map((w) => `1,${w}`)];
		return `${name}:ital,wght@${pairs.join(';')}`;
	}
	return `${name}:wght@${weights.join(';')}`;
}

export const GOOGLE_FONTS_CSS = 'https://fonts.googleapis.com/css2';

/** One stylesheet URL for every picked family (deduplicated), or null when nothing is picked. */
export function stylesheetHref(choices: readonly (FontChoice | null)[]): string | null {
	const seen = new Map<string, FontChoice>();
	for (const c of choices) if (c && !seen.has(c.family)) seen.set(c.family, c);
	if (seen.size === 0) return null;
	const params = [...seen.values()].map((c) => `family=${familyParam(c)}`).join('&');
	return `${GOOGLE_FONTS_CSS}?${params}&display=swap`;
}

/**
 * A tiny stylesheet for a picker row: only the glyphs of the family's own name, so scrolling a
 * list of hundreds of previews stays cheap.
 */
export function previewHref(family: string): string {
	const name = encodeURIComponent(family).replace(/%20/g, '+');
	return `${GOOGLE_FONTS_CSS}?family=${name}&text=${encodeURIComponent(family)}&display=block`;
}

export interface FontSearchOptions {
	query: string;
	category: FontCategory | 'all';
	variableOnly: boolean;
	/** Families recommended for this slot, in display order, with a one-line reason. */
	recommended: readonly (readonly [string, string])[];
}

export interface FontOption {
	entry: FontEntry;
	group: 'recommended' | 'all';
	note?: string;
}

/**
 * Picker list: recommended families first (in their curated order), then everything else.
 * With a query, names starting with it rank above names merely containing it; otherwise A–Z.
 */
export function searchFonts(catalog: readonly FontEntry[], opts: FontSearchOptions): FontOption[] {
	const q = opts.query.trim().toLowerCase();
	const passes = (e: FontEntry) =>
		(opts.category === 'all' || e.category === opts.category) &&
		(!opts.variableOnly || e.variable) &&
		(!q || e.family.toLowerCase().includes(q));

	const byFamily = new Map(catalog.map((e) => [e.family, e]));
	const recommended: FontOption[] = [];
	for (const [family, note] of opts.recommended) {
		const entry = byFamily.get(family);
		if (entry && passes(entry)) recommended.push({ entry, group: 'recommended', note });
	}
	const taken = new Set(recommended.map((o) => o.entry.family));
	const rest = catalog.filter((e) => !taken.has(e.family) && passes(e));
	const starts = (e: FontEntry) => (q && e.family.toLowerCase().startsWith(q) ? 0 : 1);
	rest.sort((a, b) => starts(a) - starts(b) || a.family.localeCompare(b.family, 'en'));
	return [...recommended, ...rest.map((entry) => ({ entry, group: 'all' as const }))];
}
