import { describe, it, expect } from 'vitest';
import { commentaryLinks } from '$lib/utils/bibleCommentary';
import type { PassageRange } from '$lib/utils/bible';

const range = (bookId: number, ch: number, v: number, endCh = ch, endV = v): PassageRange => ({
	bookId,
	startChapter: ch,
	startVerse: v,
	endChapter: endCh,
	endVerse: endV,
});

describe('commentaryLinks', () => {
	it('links Matthew Henry by the chapter containing the passage start', () => {
		const links = commentaryLinks(range(43, 3, 16, 3, 18));
		expect(links[0]).toEqual({
			label: 'Matthew Henry (chapter)',
			url: 'https://biblehub.com/commentaries/mhc/john/3.htm',
		});
	});

	it('links the multi-commentator page by the start verse', () => {
		const links = commentaryLinks(range(43, 3, 16, 3, 18));
		expect(links[1]).toEqual({
			label: 'Multiple commentators (verse)',
			url: 'https://biblehub.com/commentaries/john/3-16.htm',
		});
	});

	it('uses underscore slugs for numbered books', () => {
		expect(commentaryLinks(range(46, 12, 31, 13, 13))[0].url).toBe(
			'https://biblehub.com/commentaries/mhc/1_corinthians/12.htm',
		);
	});

	it('special-cases the Song of Solomon slug', () => {
		expect(commentaryLinks(range(22, 1, 1))[0].url).toBe('https://biblehub.com/commentaries/mhc/songs/1.htm');
	});

	it('returns no links for an unknown book', () => {
		expect(commentaryLinks(range(999, 1, 1))).toEqual([]);
	});
});
