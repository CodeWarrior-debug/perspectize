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
// AG Grid renderer. Percentages map the book-open path's pages (x 3–11.5 and 12.5–21,
// y 5–17 of the 24-unit viewBox). Labels hide below 48px, where text can't be read.
export const BIBLE_ICON_WRAPPER_CLASS = '@container relative aspect-square h-full max-w-full';
export const BIBLE_ICON_LABEL_CLASS =
	'absolute top-[21%] bottom-[29%] hidden w-[35%] items-center justify-center overflow-hidden text-center leading-[1.1] font-semibold @min-[48px]:flex';
// Inner span: references may break at any char ("53:1-" / "12"); titles wrap on words and clamp.
export const BIBLE_ICON_REF_TEXT_CLASS = 'text-[12cqw] [overflow-wrap:anywhere]';
// hyphens-auto only applies with a lang attribute on the element — set lang="en" alongside.
export const BIBLE_ICON_TITLE_TEXT_CLASS = 'line-clamp-3 text-[9cqw] hyphens-auto [overflow-wrap:break-word]';
export const BIBLE_ICON_LEFT_CLASS = 'left-[12.5%]';
export const BIBLE_ICON_RIGHT_CLASS = 'left-[52.5%]';

export const BIBLE_PASSAGE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-icon="bible-passage"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>`;

// Same glyph filling a square wrapper, for icon tiles that put text on the pages.
export const BIBLE_PASSAGE_ICON_SVG_SCALABLE = `<svg xmlns="http://www.w3.org/2000/svg" class="absolute inset-0 h-full w-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-icon="bible-passage"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>`;
