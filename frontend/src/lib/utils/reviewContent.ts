/**
 * hasReviewContent — whether editor HTML carries anything worth saving.
 * Text counts, and so does an image (an image-only review has no text). An
 * empty table does not: it is structure with nothing in it.
 */
export function hasReviewContent(html: string): boolean {
	if (/<img\b/i.test(html)) return true;
	return html.replace(/<[^>]*>/g, '').trim() !== '';
}
