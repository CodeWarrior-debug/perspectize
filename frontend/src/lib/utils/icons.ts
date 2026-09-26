/**
 * Shared inline SVG icon strings for AG Grid cell renderers (which build raw
 * DOM and can't use Svelte icon components).
 */

// Open book — the Bible passage content-type icon. Matches lucide's
// "book-open" glyph (frontend/CLAUDE.md's icon library) so it reads
// consistently with the rest of the app's iconography; raw SVG markup
// here (not a lucide-svelte import) because AG Grid cell renderers build
// raw DOM and can't mount Svelte components — see comment above.
export const BIBLE_PASSAGE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-icon="bible-passage"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>`;
