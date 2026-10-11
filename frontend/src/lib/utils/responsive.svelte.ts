import { MediaQuery } from 'svelte/reactivity';
import type { ResponsiveTier } from './grid-config';

/** The one place the grid breakpoints live. Tiers are min-width; card mode is below `cardMax + 1`. */
export const GRID_BREAKPOINTS = { sm: 445, md: 640, lg: 900, cardMax: 859 } as const;

export function tierFromMatches(m: { sm: boolean; md: boolean; lg: boolean }): ResponsiveTier {
	if (m.lg) return 'lg';
	if (m.md) return 'md';
	if (m.sm) return 'sm';
	return 'xs';
}

/** Reactive progressive-column tier. With no window the widest tier is assumed. */
export function useResponsiveTier(): { readonly current: ResponsiveTier } {
	const sm = new MediaQuery(`min-width: ${GRID_BREAKPOINTS.sm}px`, true);
	const md = new MediaQuery(`min-width: ${GRID_BREAKPOINTS.md}px`, true);
	const lg = new MediaQuery(`min-width: ${GRID_BREAKPOINTS.lg}px`, true);
	return {
		get current() {
			return tierFromMatches({ sm: sm.current, md: md.current, lg: lg.current });
		},
	};
}

/** Reactive card-list flag: below 860px the grid is replaced by stacked cards. */
export function useCardMode(): { readonly current: boolean } {
	const card = new MediaQuery(`max-width: ${GRID_BREAKPOINTS.cardMax}px`, false);
	return {
		get current() {
			return card.current;
		},
	};
}
