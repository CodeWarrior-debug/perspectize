/**
 * Shared inline SVG icon strings for AG Grid cell renderers (which build raw
 * DOM and can't use Svelte icon components).
 */

// Open book — the Bible passage content-type icon. Matches lucide's
// "book-open" glyph (frontend/CLAUDE.md's icon library) so it reads
// consistently with the rest of the app's iconography; raw SVG markup
// here (not a lucide-svelte import) because AG Grid cell renderers build
// raw DOM and can't mount Svelte components — see comment above.
// Page-label layout for the scalable glyph, shared by BiblePassageIcon.svelte and the
// AG Grid renderer. The scalable SVG crops its viewBox to the glyph (1.5 2 21 20), and
// these percentages map its two pages within that box. Labels hide below 48px.
export const BIBLE_ICON_WRAPPER_CLASS = '@container relative aspect-[21/20] h-full max-w-full';
export const BIBLE_ICON_LABEL_CLASS =
	'absolute top-[16%] bottom-[26%] hidden w-[39%] flex-col items-center justify-center overflow-hidden text-center leading-[1.1] font-semibold whitespace-nowrap @min-[48px]:flex';

// Ranges split after the dash ("53:1-" / "12"); font shrinks for longer lines so nothing clips.
export function bibleIconLabelLines(text: string): { lines: string[]; sizeClass: string } {
	const dash = text.indexOf('-');
	const lines = dash === -1 ? [text] : [text.slice(0, dash + 1), text.slice(dash + 1)];
	const longest = Math.max(...lines.map((l) => l.length));
	const sizeClass = longest <= 4 ? 'text-[15cqw]' : longest === 5 ? 'text-[12.5cqw]' : 'text-[10.5cqw]';
	return { lines, sizeClass };
}
export const BIBLE_ICON_LEFT_CLASS = 'left-[7.5%]';
export const BIBLE_ICON_RIGHT_CLASS = 'left-[53%]';

export const BIBLE_PASSAGE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-icon="bible-passage"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>`;

// Same glyph filling a square wrapper, for icon tiles that put text on the pages.
export const BIBLE_PASSAGE_ICON_SVG_SCALABLE = `<svg xmlns="http://www.w3.org/2000/svg" class="absolute inset-0 h-full w-full" viewBox="1.5 2 21 20" fill="none" stroke="currentColor" stroke-width="0.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-icon="bible-passage"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>`;
