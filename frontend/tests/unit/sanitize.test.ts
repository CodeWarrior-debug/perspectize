import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from '$lib/utils/sanitize';

describe('sanitizeHtml', () => {
	it('keeps allowed formatting tags and attributes', () => {
		const dirty =
			'<p>Hello <strong>world</strong>, <a href="https://example.com" target="_blank" rel="noopener">link</a></p>';
		expect(sanitizeHtml(dirty)).toBe(dirty);
	});

	it('strips <script> tags entirely', () => {
		const dirty = '<p>safe</p><script>alert("xss")</script>';
		const clean = sanitizeHtml(dirty);
		expect(clean).not.toContain('<script>');
		expect(clean).not.toContain('alert');
		expect(clean).toContain('<p>safe</p>');
	});

	it('strips event-handler attributes', () => {
		const dirty = '<p onclick="alert(1)">click me</p>';
		const clean = sanitizeHtml(dirty);
		expect(clean).not.toContain('onclick');
		expect(clean).toContain('click me');
	});

	it('strips disallowed tags but keeps their text content', () => {
		const dirty = '<h1>Title</h1>';
		const clean = sanitizeHtml(dirty);
		expect(clean).not.toContain('<h1>');
		expect(clean).toContain('Title');
	});

	it('allows headings, images, and tables through', () => {
		const dirty =
			'<h2>Heading</h2><h3>Subheading</h3><img src="https://example.com/x.png" alt="x"><table><tbody><tr><td>a</td></tr></tbody></table>';
		const clean = sanitizeHtml(dirty);
		expect(clean).toContain('<h2>Heading</h2>');
		expect(clean).toContain('<h3>Subheading</h3>');
		expect(clean).toContain('<img src="https://example.com/x.png" alt="x">');
		expect(clean).toContain('<table>');
	});

	it('strips onerror handlers from images while keeping the tag', () => {
		const dirty = '<img src="https://example.com/x.png" onerror="alert(1)">';
		const clean = sanitizeHtml(dirty);
		expect(clean).not.toContain('onerror');
		expect(clean).toContain('<img src="https://example.com/x.png">');
	});

	it('strips javascript: URLs from img src', () => {
		const dirty = '<img src="javascript:alert(1)" alt="x">';
		const clean = sanitizeHtml(dirty);
		expect(clean).not.toContain('javascript:');
	});

	it('drops a disallowed attribute (e.g. style) while keeping the tag', () => {
		const dirty = '<p style="color:red">styled</p>';
		const clean = sanitizeHtml(dirty);
		expect(clean).not.toContain('style=');
		expect(clean).toBe('<p>styled</p>');
	});

	it('returns an empty string for empty input', () => {
		expect(sanitizeHtml('')).toBe('');
	});
});
