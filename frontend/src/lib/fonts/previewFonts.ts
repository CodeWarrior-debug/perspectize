import { previewHref } from './googleFonts';

/**
 * Loads just enough of a family to draw its own name in a picker row. Each family is
 * requested at most once per page; rows ask only when they scroll into view.
 */
const requested = new Set<string>();

export function loadFontPreview(family: string): void {
	if (requested.has(family) || typeof document === 'undefined') return;
	requested.add(family);
	const link = document.createElement('link');
	link.rel = 'stylesheet';
	link.href = previewHref(family);
	link.dataset.fontPreview = '';
	document.head.appendChild(link);
}

/**
 * Svelte action: load the row's preview once it is near the visible part of its scroll
 * container (`root`). Falls back to loading immediately where IntersectionObserver is missing.
 */
export function fontPreview(node: HTMLElement, params: { family: string; root: HTMLElement | null }) {
	if (typeof IntersectionObserver === 'undefined') {
		loadFontPreview(params.family);
		return {};
	}
	const io = new IntersectionObserver(
		(entries) => {
			if (entries.some((e) => e.isIntersecting)) {
				loadFontPreview(params.family);
				io.disconnect();
			}
		},
		{ root: params.root, rootMargin: '200px' },
	);
	io.observe(node);
	return { destroy: () => io.disconnect() };
}
