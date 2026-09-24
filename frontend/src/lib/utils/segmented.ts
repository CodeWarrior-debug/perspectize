/**
 * Classes for a segmented control (a small pill toggle). The selected segment is a tinted surface
 * built from the derived row tokens — visible on light and dark presets alike — so solid
 * `--color-primary` stays reserved for the single primary action on a screen.
 */
export const SEGMENT_SELECTED =
	'bg-[var(--color-row-hover)] text-foreground font-semibold ring-1 ring-[var(--color-row-accent)]/40';

export const SEGMENT_IDLE = 'text-muted-foreground hover:text-foreground';

export function segmentClass(selected: boolean): string {
	return selected ? SEGMENT_SELECTED : SEGMENT_IDLE;
}
