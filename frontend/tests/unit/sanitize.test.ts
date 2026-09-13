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
		const dirty = '<h1>Title</h1><img src="x.png" onerror="alert(1)" />';
		const clean = sanitizeHtml(dirty);
		expect(clean).not.toContain('<h1>');
		expect(clean).not.toContain('<img');
		expect(clean).toContain('Title');
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
