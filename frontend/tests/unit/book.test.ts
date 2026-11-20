import { describe, it, expect } from 'vitest';
import { validateBookInput, descriptionText, safeRelatedWorks } from '$lib/utils/book';

describe('validateBookInput', () => {
	it('accepts an Open Library work link with or without scheme', () => {
		expect(validateBookInput('https://openlibrary.org/works/OL23166W')).toBe(true);
		expect(validateBookInput('openlibrary.org/works/OL23166W')).toBe(true);
	});

	it('accepts a work link with a slug, query or hash', () => {
		expect(validateBookInput('openlibrary.org/works/OL23166W/East_of_Eden?edition=x')).toBe(true);
		expect(validateBookInput('https://openlibrary.org/works/OL23166W#reviews')).toBe(true);
	});

	it('accepts an Open Library edition link (the server resolves it to its work)', () => {
		expect(validateBookInput('https://openlibrary.org/books/OL22640535M')).toBe(true);
	});

	it('rejects an author link, a foreign host, a bare key and empty input', () => {
		expect(validateBookInput('https://openlibrary.org/authors/OL26320A')).toBe(false);
		expect(validateBookInput('https://example.com/works/OL23166W')).toBe(false);
		expect(validateBookInput('OL23166W')).toBe(false);
		expect(validateBookInput('')).toBe(false);
	});
});

describe('descriptionText', () => {
	it('strips markup, script tags and markdown emphasis, keeping the text', () => {
		const out = descriptionText('<script>alert(1)</script>**Bold** [link](javascript:alert(1)) text');
		expect(out).not.toContain('<');
		expect(out).not.toContain('**');
		expect(out).not.toContain('javascript:');
		expect(out).toContain('Bold');
		expect(out).toContain('link');
		expect(out).toContain('text');
	});

	it('removes image syntax entirely', () => {
		expect(descriptionText('Before ![cover](https://example.com/c.jpg) after')).toBe('Before  after');
	});

	it('removes horizontal rule lines', () => {
		expect(descriptionText('First para\n\n---\n\nSecond para')).toBe('First para\n\nSecond para');
	});

	it('removes reference-definition lines', () => {
		expect(descriptionText('Some text.\n[1]: https://example.com/source')).toBe('Some text.');
	});

	it('collapses runs of blank lines to one blank line', () => {
		expect(descriptionText('One\n\n\n\n\nTwo')).toBe('One\n\nTwo');
	});

	it('leaves no tag behind when stripping one reveals another (nested tags)', () => {
		expect(descriptionText('a <scr<b>ipt>alert(1)</scr</b>ipt> b')).not.toMatch(/<\/?script/i);
		expect(descriptionText('<<b>script>x<</b>/script>')).not.toMatch(/<\/?script/i);
	});

	it('is empty for an empty description', () => {
		expect(descriptionText('')).toBe('');
	});
});

describe('safeRelatedWorks', () => {
	it('keeps only openlibrary.org https links', () => {
		const kept = safeRelatedWorks([
			{ title: 'Ok', url: 'https://openlibrary.org/works/OL1W' },
			{ title: 'Evil', url: 'https://evil.example/x' },
			{ title: 'Script', url: 'javascript:alert(1)' },
			{ title: 'Lookalike', url: 'https://openlibrary.org.evil.example/works/OL2W' },
		]);
		expect(kept).toEqual([{ title: 'Ok', url: 'https://openlibrary.org/works/OL1W' }]);
	});

	it('tolerates undefined', () => {
		expect(safeRelatedWorks(undefined)).toEqual([]);
	});
});
