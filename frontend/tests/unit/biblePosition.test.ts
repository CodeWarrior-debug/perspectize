import { describe, it, expect } from 'vitest';
import { passagePosition } from '$lib/utils/biblePosition';
import { TOTAL_VERSES, rangeToVerseIds } from '$lib/utils/bible';

describe('passagePosition', () => {
	it('labels Genesis 1:1-5 with ordinals, total and book position', () => {
		const p = passagePosition(1, 5)!;
		expect(p.label).toBe(`Verses 1–5 of ${TOTAL_VERSES.toLocaleString('en-US')} · Genesis (book 1 of 66)`);
	});

	it('uses a single ordinal for a one-verse passage', () => {
		expect(passagePosition(26137, 26137)!.label).toMatch(/^Verse 26,137 of /);
	});

	it('reports percentages at 2 decimals for the whole Bible and the testament', () => {
		const p = passagePosition(1, 5)!;
		expect(p.tooltip).toContain('0.02% through Scripture');
		expect(p.tooltip).toMatch(/through the Old Testament/);
	});

	it('uses the New Testament denominator for NT passages', () => {
		const john316 = rangeToVerseIds({ bookId: 43, startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 16 })!;
		const p = passagePosition(john316.startId, john316.endId)!;
		expect(p.tooltip).toMatch(/through the New Testament/);
		expect(p.label).toContain('John (book 43 of 66)');
	});

	it('gives the segment its true position and width for a large range', () => {
		const psalms = rangeToVerseIds({ bookId: 19, startChapter: 1, startVerse: 1, endChapter: 150, endVerse: 6 })!;
		const p = passagePosition(psalms.startId, psalms.endId)!;
		const count = psalms.endId - psalms.startId + 1;
		expect(p.leftPct).toBeCloseTo(((psalms.startId - 1) / TOTAL_VERSES) * 100, 6);
		expect(p.widthPct).toBeCloseTo((count / TOTAL_VERSES) * 100, 6);
	});

	it('exposes a tiny true width for a short passage so the view can enforce a minimum', () => {
		const p = passagePosition(1, 3)!;
		expect(p.widthPct).toBeLessThan(0.02);
		expect(p.widthPct).toBeGreaterThan(0);
	});

	it('marks the OT/NT boundary where the New Testament starts', () => {
		const p = passagePosition(1, 1)!;
		expect(p.ntBoundaryPct).toBeGreaterThan(70);
		expect(p.ntBoundaryPct).toBeLessThan(80);
	});

	it('returns null for ordinals outside the seeded range', () => {
		expect(passagePosition(0, 5)).toBeNull();
		expect(passagePosition(1, TOTAL_VERSES + 1)).toBeNull();
		expect(passagePosition(10, 5)).toBeNull();
	});

	it('returns null for a range that spans two books', () => {
		expect(passagePosition(1, TOTAL_VERSES)).toBeNull();
	});
});
