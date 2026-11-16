import { describe, it, expect } from 'vitest';
import { detectContentType } from '$lib/utils/detectContentType';

// Unmocked: exercises detection against the real reference parser (plan C1).
describe('detectContentType with the real parser', () => {
	const cases: Array<[string, string]> = [
		['typed reference', 'John 3:16-18'],
		['chapter-only reference', 'Psalm 23'],
		['numbered book', '1 John 2:1'],
		['bible gateway url', 'https://www.biblegateway.com/passage/?search=Genesis+1%3A1-3&version=NIV'],
		['bible gateway url, abbreviated', 'https://www.biblegateway.com/passage/?search=Gen+1:1-3&version=ESV'],
	];

	it.each(cases)('%s is a passage', (_name, input) => {
		expect(detectContentType(input).type).toBe('BIBLE_PASSAGE');
	});

	it('typed reference and bible gateway url resolve to the identical range', () => {
		const a = detectContentType('Genesis 1:1-3');
		const b = detectContentType('https://www.biblegateway.com/passage/?search=Gen+1:1-3&version=ESV');
		expect(a.type === 'BIBLE_PASSAGE' && b.type === 'BIBLE_PASSAGE' && a.range).toEqual(
			b.type === 'BIBLE_PASSAGE' ? b.range : null,
		);
	});

	it('out-of-range reference falls back to a claim, not a passage', () => {
		expect(detectContentType('Genesis 200:1').type).toBe('CLAIM');
	});

	it('a plain sentence is a claim', () => {
		expect(detectContentType('Grace is unearned favor').type).toBe('CLAIM');
	});
});
