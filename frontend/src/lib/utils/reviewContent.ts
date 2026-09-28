/**
 * hasReviewContent — whether editor HTML carries anything worth saving.
 * Text counts, and so does an image (an image-only review has no text). An
 * empty table does not: it is structure with nothing in it.
 *
 * Uses DOMParser (inert: scripts don't run, nothing is attached to the page)
 * rather than stripping tags with a regex, which mishandles malformed or
 * nested fragments like `<scr<script>ipt>`.
 */
export function hasReviewContent(html: string): boolean {
	if (typeof DOMParser === 'undefined') return html.trim() !== '';
	const doc = new DOMParser().parseFromString(html, 'text/html');
	if (doc.body.querySelector('img')) return true;
	return (doc.body.textContent ?? '').trim() !== '';
}

/**
 * reviewPreviewText — one-line plain-text preview of editor HTML (used where
 * the rich editor is collapsed, e.g. the mobile drawer). Blocks are separated
 * by a space so adjacent paragraphs don't run together, and images show as
 * "[image]" so an image-only review isn't blank.
 */
export function reviewPreviewText(html: string): string {
	if (typeof DOMParser === 'undefined') return '';
	const doc = new DOMParser().parseFromString(html, 'text/html');
	doc.body.querySelectorAll('img').forEach((img) => img.replaceWith(' [image] '));
	doc.body.querySelectorAll('p, h1, h2, h3, li, td, th, br').forEach((el) => el.append(' '));
	return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}
