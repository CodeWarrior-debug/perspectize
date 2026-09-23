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
