import { describe, it, expect, vi, beforeEach } from 'vitest';

const GEN_1_1_3 = { bookId: 1, startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 3 };
const JOHN_3 = { bookId: 43, startChapter: 3, startVerse: 1, endChapter: 3, endVerse: 36 };
const { parseReference } = vi.hoisted(() => ({ parseReference: vi.fn() }));

// The real parser (plan C1) lives on another branch; detection is tested against a table-driven fake.
vi.mock('$lib/utils/passageParserAdapter', () => ({ parseReference }));

import { detectContentType, detectContentCandidates } from '$lib/utils/detectContentType';

const fakeRefs: Record<string, unknown> = {
	'Genesis 1:1-3': GEN_1_1_3,
	'Gen 1:1-3': GEN_1_1_3,
	'John 3': JOHN_3,
};

beforeEach(() => {
	parseReference.mockReset();
	parseReference.mockImplementation((s: string) => fakeRefs[s] ?? null);
});

describe('detectContentType', () => {
	const yt = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
	const bg = 'https://www.biblegateway.com/passage/?search=Genesis+1%3A1-3&version=NIV';
	const gw = { type: 'BIBLE_PASSAGE', range: GEN_1_1_3, source: 'biblegateway' };
	const txt = (range: unknown) => ({ type: 'BIBLE_PASSAGE', range, source: 'text' });
	const claim = (text: string) => ({ type: 'CLAIM', text });
	const cases: Array<[string, string, unknown]> = [
		['youtube watch url', yt, { type: 'YOUTUBE', url: yt }],
		['youtube url with surrounding whitespace', `  ${yt}  `, { type: 'YOUTUBE', url: yt }],
		['youtu.be short url', 'https://youtu.be/abc123', { type: 'YOUTUBE', url: 'https://youtu.be/abc123' }],
		['bible gateway url', bg, gw],
		[
			'bible gateway url, abbreviated book, different version',
			'https://www.biblegateway.com/passage/?search=Gen+1:1-3&version=ESV',
			gw,
		],
		['bible gateway apex host', 'https://biblegateway.com/passage/?search=Genesis+1%3A1-3', gw],
		['typed reference', 'Genesis 1:1-3', txt(GEN_1_1_3)],
		['typed reference with padding', '  Genesis 1:1-3 ', txt(GEN_1_1_3)],
		['chapter-only reference is a valid passage', 'John 3', txt(JOHN_3)],
		['multi-word free text is a claim', 'Love one another', claim('Love one another')],
		[
			'reference embedded in a sentence is a claim',
			'John 3:16 is my favorite verse',
			claim('John 3:16 is my favorite verse'),
		],
		['claim text is trimmed', '  Grace is unearned ', claim('Grace is unearned')],
		['empty', '', { type: null }],
		['whitespace only', '   ', { type: null }],
		['single bare word is not guessed', 'grace', { type: null }],
		['non-bible-gateway url', 'https://example.com/passage/?search=Genesis+1%3A1-3', { type: null }],
		['bible gateway lookalike host', 'https://evilbiblegateway.com/passage/?search=Genesis+1%3A1-3', { type: null }],
		['bible gateway url without search', 'https://www.biblegateway.com/versions/', { type: null }],
		['bible gateway url with unparseable search', 'https://www.biblegateway.com/passage/?search=love', { type: null }],
		['non-youtube url is not a claim', 'https://example.com/some-article', { type: null }],
		['bare host', 'example.com', { type: null }],
		['scheme-less youtube-like text', 'youtube.com/watch?v=abc', { type: null }],
	];

	it.each(cases)('%s', (_name, input, expected) => {
		expect(detectContentType(input)).toEqual(expected);
	});

	it('youtube takes precedence and never consults the reference parser', () => {
		detectContentType(yt);
		expect(parseReference).not.toHaveBeenCalled();
	});

	it('a youtube URL that also has a bible-looking query stays youtube', () => {
		expect(detectContentType('https://www.youtube.com/watch?v=abc&search=Genesis+1:1').type).toBe('YOUTUBE');
	});

	it('a bible gateway url passes only the decoded search text to the parser', () => {
		detectContentType(bg);
		expect(parseReference).toHaveBeenCalledWith('Genesis 1:1-3');
	});

	it('passage results carry a range and never the pasted url', () => {
		expect(JSON.stringify(detectContentType(bg))).not.toContain('biblegateway.com');
	});
});

describe('detectContentCandidates', () => {
	it('returns at most one candidate today and an empty list for unknown', () => {
		expect(detectContentCandidates('Genesis 1:1-3')).toHaveLength(1);
		expect(detectContentCandidates('grace')).toEqual([]);
	});
});
