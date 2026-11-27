import { describe, it, expect } from 'vitest';
import { scrollEdges, scrollFadeMask } from '#lib/utils/scrollFade.js';

const el = (scrollLeft: number, scrollWidth: number, clientWidth: number) =>
	({ scrollLeft, scrollWidth, clientWidth }) as HTMLElement;

describe('scrollEdges', () => {
	it('reports nothing to scroll when the content fits', () => {
		expect(scrollEdges(el(0, 300, 300))).toEqual({ canScrollLeft: false, canScrollRight: false });
	});

	it('at the start only the right end has more', () => {
		expect(scrollEdges(el(0, 1000, 400))).toEqual({ canScrollLeft: false, canScrollRight: true });
	});

	it('in the middle both ends have more', () => {
		expect(scrollEdges(el(300, 1000, 400))).toEqual({ canScrollLeft: true, canScrollRight: true });
	});

	it('at the end only the left end has more', () => {
		expect(scrollEdges(el(600, 1000, 400))).toEqual({ canScrollLeft: true, canScrollRight: false });
	});

	it('treats a sub-pixel gap as the end (fractional scroll positions on high-DPR phones)', () => {
		expect(scrollEdges(el(598.5, 1000, 400))).toEqual({ canScrollLeft: true, canScrollRight: false });
		expect(scrollEdges(el(1, 1000, 400)).canScrollLeft).toBe(false);
	});
});

describe('scrollFadeMask', () => {
	it('is fully opaque when nothing is clipped', () => {
		expect(scrollFadeMask(false, false)).not.toContain('transparent');
	});

	it('fades the left end only when content is clipped on the left', () => {
		const mask = scrollFadeMask(true, false, '2rem');
		expect(mask).toBe('linear-gradient(to right, transparent 0, black 2rem, black 100%, black 100%)');
	});

	it('fades the right end only when content is clipped on the right', () => {
		const mask = scrollFadeMask(false, true, '2rem');
		expect(mask).toBe('linear-gradient(to right, black 0, black 0, black calc(100% - 2rem), transparent 100%)');
	});

	it('fades both ends in the middle', () => {
		const mask = scrollFadeMask(true, true, '2rem');
		expect(mask).toContain('transparent 0');
		expect(mask).toContain('transparent 100%');
	});

	it('defaults to the 2.5rem fade the type pills use', () => {
		expect(scrollFadeMask(true, true)).toContain('2.5rem');
	});
});
