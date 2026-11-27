/** Distance in px from an end at which that end counts as reached (sub-pixel scroll positions). */
const EDGE_SLACK = 2;

/** Which ends of a horizontally scrolling row still have content past the visible edge. */
export function scrollEdges(
	el: Pick<HTMLElement, 'scrollLeft' | 'scrollWidth' | 'clientWidth'>,
	slack = EDGE_SLACK,
): { canScrollLeft: boolean; canScrollRight: boolean } {
	const { scrollLeft, scrollWidth, clientWidth } = el;
	return {
		canScrollLeft: scrollLeft > slack,
		canScrollRight: scrollLeft + clientWidth < scrollWidth - slack,
	};
}

/**
 * A `mask-image` that fades the clipped ends of a scrolling row, so a cut-off item reads as "more this
 * way" instead of as a glitch. Fully opaque at an end that has nothing past it.
 */
export function scrollFadeMask(canScrollLeft: boolean, canScrollRight: boolean, fade = '2.5rem'): string {
	const left = canScrollLeft ? `transparent 0, black ${fade}` : 'black 0, black 0';
	const right = canScrollRight ? `black calc(100% - ${fade}), transparent 100%` : 'black 100%, black 100%';
	return `linear-gradient(to right, ${left}, ${right})`;
}
