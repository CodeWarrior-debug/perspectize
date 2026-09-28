import { describe, it, expect } from 'vitest';
import { BIBLE_BOOKS, getBook } from '$lib/utils/bibleStructure';

describe('bibleStructure', () => {
	it('has exactly 66 books', () => {
		expect(BIBLE_BOOKS).toHaveLength(66);
	});

	it('orders Genesis first and Revelation last', () => {
		expect(BIBLE_BOOKS[0].name).toBe('Genesis');
		expect(BIBLE_BOOKS[65].name).toBe('Revelation');
	});

	it('resolves a book by exact name', () => {
		expect(getBook('Genesis')?.id).toBe(1);
	});

	it('resolves a book by alias', () => {
		expect(getBook('Gen')?.id).toBe(1);
	});

	it('returns null for an unknown name', () => {
		expect(getBook('Not A Book')).toBeNull();
	});
});
