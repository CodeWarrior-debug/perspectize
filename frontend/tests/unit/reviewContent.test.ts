import { describe, it, expect } from 'vitest';
import { hasReviewContent } from '$lib/utils/reviewContent';

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
});
