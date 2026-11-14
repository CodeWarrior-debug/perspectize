import { describe, it, expect } from 'vitest';
import {
	BIBLE_ICON_LABEL_CLASS,
	BIBLE_ICON_LEFT_CLASS,
	BIBLE_ICON_RIGHT_CLASS,
	BIBLE_ICON_WRAPPER_CLASS,
	bibleIconLabelLines,
} from '$lib/utils/icons';

describe('bibleIconLabelLines', () => {
	it('keeps text without a dash on one line', () => {
		expect(bibleIconLabelLines('12').lines).toEqual(['12']);
	});

	it('splits a range after the dash, keeping the dash on the first line', () => {
		expect(bibleIconLabelLines('53:1-12').lines).toEqual(['53:1-', '12']);
	});

	it('splits on the first dash only', () => {
		expect(bibleIconLabelLines('1-2-3').lines).toEqual(['1-', '2-3']);
	});

	it('uses the biggest font for lines of up to 4 characters', () => {
		expect(bibleIconLabelLines('1').sizeClass).toBe('text-[15cqw]');
		expect(bibleIconLabelLines('1234').sizeClass).toBe('text-[15cqw]');
	});

	it('steps down to a medium font at exactly 5 characters', () => {
		expect(bibleIconLabelLines('12345').sizeClass).toBe('text-[12.5cqw]');
	});

	it('uses the smallest font above 5 characters', () => {
		expect(bibleIconLabelLines('123456').sizeClass).toBe('text-[10.5cqw]');
	});

	it('sizes by the longest line, not the shortest', () => {
		// lines are "12:1-" (5) and "150:176" (7): the longest decides, so the small font
		expect(bibleIconLabelLines('12:1-150:176').sizeClass).toBe('text-[10.5cqw]');
		// lines are "1-" (2) and "1234" (4): longest is 4, the big font
		expect(bibleIconLabelLines('1-1234').sizeClass).toBe('text-[15cqw]');
	});
});

describe('Bible icon layout classes', () => {
	it('places the two page labels on the left and right pages', () => {
		expect(BIBLE_ICON_LEFT_CLASS).toBe('left-[7.5%]');
		expect(BIBLE_ICON_RIGHT_CLASS).toBe('left-[53%]');
	});

	it('sizes the wrapper as a container with the glyph aspect ratio', () => {
		expect(BIBLE_ICON_WRAPPER_CLASS).toContain('@container');
		expect(BIBLE_ICON_WRAPPER_CLASS).toContain('aspect-[21/20]');
	});

	it('hides page labels until the icon is at least 48px wide', () => {
		expect(BIBLE_ICON_LABEL_CLASS).toContain('hidden');
		expect(BIBLE_ICON_LABEL_CLASS).toContain('@min-[48px]:flex');
	});
});
