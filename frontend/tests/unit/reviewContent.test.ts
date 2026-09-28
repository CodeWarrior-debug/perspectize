import { describe, it, expect } from 'vitest';
import { hasReviewContent, reviewPreviewText } from '$lib/utils/reviewContent';

describe('hasReviewContent', () => {
	it('is false for empty and whitespace-only editor output', () => {
		expect(hasReviewContent('')).toBe(false);
		expect(hasReviewContent('<p></p>')).toBe(false);
		expect(hasReviewContent('<p><br class="ProseMirror-trailingBreak"></p>')).toBe(false);
		expect(hasReviewContent('<p>   </p>')).toBe(false);
	});

	it('is true when there is text', () => {
		expect(hasReviewContent('<p>hi</p>')).toBe(true);
		expect(hasReviewContent('<h2>Title</h2><p></p>')).toBe(true);
	});

	it('is true for an image-only review (no text)', () => {
		expect(hasReviewContent('<p><img src="https://example.com/a.png"></p>')).toBe(true);
		expect(hasReviewContent('<img src="https://example.com/a.png" alt="">')).toBe(true);
	});

	it('is false for a table with no cell content, true once a cell has text', () => {
		const empty = '<table><tbody><tr><td><p></p></td><td><p></p></td></tr></tbody></table>';
		expect(hasReviewContent(empty)).toBe(false);
		expect(hasReviewContent(empty.replace('<p></p>', '<p>x</p>'))).toBe(true);
	});

	it('treats non-breaking-space-only content as empty', () => {
		expect(hasReviewContent('<p>&nbsp;</p>')).toBe(false);
	});

	it('does not get fooled by nested/malformed tag fragments', () => {
		// A regex tag-stripper leaves "<script" behind here; a real parser does not.
		expect(hasReviewContent('<scr<script>ipt></scr</script>ipt>')).toBe(true);
		expect(hasReviewContent('<p><<b></b>></p>')).toBe(true);
		expect(hasReviewContent('<script></script>')).toBe(false);
	});
});

describe('reviewPreviewText', () => {
	it('separates block elements with a space instead of running them together', () => {
		expect(reviewPreviewText('<h2>Title</h2><p>Body text</p>')).toBe('Title Body text');
		expect(reviewPreviewText('<ul><li>one</li><li>two</li></ul>')).toBe('one two');
		expect(reviewPreviewText('<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>')).toBe('a b');
	});

	it('shows a placeholder for images so an image-only review is not blank', () => {
		expect(reviewPreviewText('<p><img src="https://example.com/a.png"></p>')).toBe('[image]');
		expect(reviewPreviewText('<p>look</p><img src="https://example.com/a.png">')).toBe('look [image]');
	});

	it('returns an empty string for empty content and never leaks markup', () => {
		expect(reviewPreviewText('')).toBe('');
		expect(reviewPreviewText('<p></p>')).toBe('');
		expect(reviewPreviewText('<scr<script>ipt>x</scr</script>ipt>')).not.toContain('<script');
	});
});
