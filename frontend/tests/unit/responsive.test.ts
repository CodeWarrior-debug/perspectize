import { describe, it, expect, afterEach, vi } from 'vitest';
import { GRID_BREAKPOINTS, tierFromMatches, useResponsiveTier, useCardMode } from '$lib/utils/responsive.svelte';

function setViewport(width: number) {
	window.matchMedia = vi.fn((query: string) => {
		const min = /min-width:\s*(\d+)px/.exec(query);
		const max = /max-width:\s*(\d+)px/.exec(query);
		const matches = min ? width >= Number(min[1]) : max ? width <= Number(max[1]) : false;
		return { matches, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() };
	}) as unknown as typeof window.matchMedia;
}

const original = window.matchMedia;
afterEach(() => {
	window.matchMedia = original;
});

describe('tierFromMatches', () => {
	it('picks the widest matching tier', () => {
		expect(tierFromMatches({ sm: true, md: true, lg: true })).toBe('lg');
		expect(tierFromMatches({ sm: true, md: true, lg: false })).toBe('md');
		expect(tierFromMatches({ sm: true, md: false, lg: false })).toBe('sm');
		expect(tierFromMatches({ sm: false, md: false, lg: false })).toBe('xs');
	});
});

describe('useResponsiveTier / useCardMode', () => {
	it.each([
		[444, 'xs'],
		[445, 'sm'],
		[639, 'sm'],
		[640, 'md'],
		[899, 'md'],
		[900, 'lg'],
	])('width %i -> tier %s', (width, tier) => {
		setViewport(width);
		expect(useResponsiveTier().current).toBe(tier);
	});

	it.each([
		[859, true],
		[860, false],
	])('width %i -> card mode %s', (width, card) => {
		setViewport(width);
		expect(useCardMode().current).toBe(card);
	});

	it('exposes the breakpoint constants', () => {
		expect(GRID_BREAKPOINTS).toEqual({ sm: 445, md: 640, lg: 900, cardMax: 859 });
	});
});
