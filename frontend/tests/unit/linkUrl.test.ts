import { describe, it, expect } from 'vitest';
import { normalizeLinkUrl } from '#lib/utils/linkUrl.js';

describe('normalizeLinkUrl', () => {
	it.each([
		['example.com', 'https://example.com'],
		['  www.example.com/a?b=1  ', 'https://www.example.com/a?b=1'],
		['https://example.com', 'https://example.com'],
		['http://example.com', 'http://example.com'],
		['mailto:a@b.co', 'mailto:a@b.co'],
		['tel:+15551234', 'tel:+15551234'],
		['#section', '#section'],
		['/content-library', '/content-library'],
		['//cdn.example.com/x', 'https://cdn.example.com/x'],
		['', ''],
		['   ', ''],
	])('%j -> %j', (input, expected) => {
		expect(normalizeLinkUrl(input)).toBe(expected);
	});
});
