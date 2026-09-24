import { describe, it, expect } from 'vitest';
import { gatewayLink, DEFAULT_VERSION } from '$lib/utils/bibleLinks';
import type { PassageRange } from '$lib/utils/bible';

const gen1_1_5: PassageRange = { bookId: 1, startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 5 };
const psalm51_10: PassageRange = { bookId: 19, startChapter: 51, startVerse: 10, endChapter: 51, endVerse: 10 };
const joel2_28: PassageRange = { bookId: 29, startChapter: 2, startVerse: 28, endChapter: 2, endVerse: 32 };
const cross: PassageRange = { bookId: 46, startChapter: 12, startVerse: 31, endChapter: 13, endVerse: 13 };

describe('gatewayLink', () => {
	it('defaults to ESV', () => {
		expect(DEFAULT_VERSION).toBe('ESV');
	});

	it('builds a verse-range link with an explicit version', () => {
		expect(gatewayLink(gen1_1_5, 'ESV')).toEqual({
			url: 'https://www.biblegateway.com/passage/?search=Genesis+1%3A1-5&version=ESV',
			note: null,
		});
	});

	it('handles cross-chapter ranges', () => {
		expect(gatewayLink(cross, 'NIV').url).toBe(
			'https://www.biblegateway.com/passage/?search=1+Corinthians+12%3A31-13%3A13&version=NIV',
		);
	});

	it('degrades to a chapter link with a note for known-divergent versification (NABRE x Psalms)', () => {
		const link = gatewayLink(psalm51_10, 'NABRE');
		expect(link.url).toBe('https://www.biblegateway.com/passage/?search=Psalms+51&version=NABRE');
		expect(link.note).toMatch(/numbering differs/i);
	});

	it('degrades for NABRE x Joel using the start chapter', () => {
		const link = gatewayLink(joel2_28, 'NABRE');
		expect(link.url).toContain('search=Joel+2&');
		expect(link.note).not.toBeNull();
	});

	it('does not degrade Psalms for non-divergent versions', () => {
		const link = gatewayLink(psalm51_10, 'ESV');
		expect(link.url).toContain('search=Psalms+51%3A10&');
		expect(link.note).toBeNull();
	});
});
