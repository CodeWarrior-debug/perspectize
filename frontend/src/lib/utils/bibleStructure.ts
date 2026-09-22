import booksData from '$lib/data/bible-books.json';

export interface BibleBook {
	id: number;
	name: string;
	testament: 'OLD' | 'NEW';
	canon: string;
	division: string;
	chapterCount: number;
	aliases: string[];
}

export const BIBLE_BOOKS: BibleBook[] = booksData as BibleBook[];

const byLookup = new Map<string, BibleBook>();
for (const book of BIBLE_BOOKS) {
	byLookup.set(book.name.toLowerCase(), book);
	for (const alias of book.aliases) {
		byLookup.set(alias.toLowerCase(), book);
	}
}

export function getBook(nameOrAlias: string): BibleBook | null {
	return byLookup.get(nameOrAlias.trim().toLowerCase()) ?? null;
}
