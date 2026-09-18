import { extractVideoIdFromUrl } from './formatting';

export interface ActivityItemCellRendererParams {
	data?: { id: string | number; name: string; url: string | null };
	context?: { onOpenDetails?: (contentId: string) => void };
}

const PLAY_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;

/**
 * AG Grid cell renderer for the Item column: a small thumbnail (click ->
 * open video in a new tab) beside a 2-line title (click -> open the details
 * modal). Two independent click zones.
 *
 * Layout intentionally matches the pre-redesign Item cell (small thumbnail,
 * title to its right) — only the click-zone split, hover-to-watch overlay,
 * and details-modal behavior are new. See docs/superpowers/plans/
 * 2026-09-02-activity-item-column-redesign.md for the original (stacked,
 * larger-thumbnail) version this replaced, and CLAUDE.md's AG Grid gotcha
 * for why `whitespace-normal` below is required.
 */
export function activityItemCellRenderer(
	params: ActivityItemCellRendererParams,
): HTMLElement | string {
	if (!params.data) return '';

	const { id, name, url } = params.data;
	const onOpenDetails = params.context?.onOpenDetails;

	// No native `title` attribute here (or on the thumbnail below) — the column's
	// context.tooltipSpec popover already shows details on cell hover, and a
	// native title attribute on top of that shows two overlapping tooltip boxes.
	const cell = document.createElement('div');
	cell.className =
		'group/cell flex h-full w-full items-center gap-2 px-2.5 py-2 cursor-pointer';
	cell.addEventListener('click', () => {
		onOpenDetails?.(String(id));
	});

	const thumbWrap = document.createElement('div');
	thumbWrap.dataset.testid = 'item-thumb';
	thumbWrap.className =
		'group/thumb relative h-8 w-10 flex-none overflow-hidden rounded bg-muted';
	thumbWrap.addEventListener('click', (e) => {
		e.stopPropagation();
		if (url) window.open(url, '_blank', 'noopener,noreferrer');
	});

	// Small display size — use the low-res thumbnail (matches the original,
	// pre-redesign cell) rather than hqdefault, which is overkill at 40x32.
	const videoId = extractVideoIdFromUrl(url);
	if (videoId) {
		const img = document.createElement('img');
		img.src = `https://i.ytimg.com/vi/${videoId}/default.jpg`;
		img.alt = '';
		img.className = 'h-full w-full object-cover';
		img.onerror = () => img.remove(); // thumbnail unavailable — fall back to the plain bg-muted block
		thumbWrap.appendChild(img);
	}

	const overlay = document.createElement('div');
	overlay.className =
		'pointer-events-none absolute inset-0 flex items-center justify-center bg-[rgba(23,23,23,0.55)] opacity-0 transition-opacity group-hover/thumb:opacity-100';
	overlay.innerHTML = PLAY_ICON_SVG;
	thumbWrap.appendChild(overlay);

	// leading-[1.5] (rather than a tighter value) plus a real rowHeight margin
	// in ActivityTable.svelte's `theme.rowHeight` is what keeps descenders
	// (g/y/p/q/j) on the clamped second line from being clipped by the row's
	// own overflow:hidden — a tight line-height/row-height pairing clips
	// even though line-clamp itself only ever cuts whole lines, not glyphs.
	const title = document.createElement('div');
	title.dataset.testid = 'item-title';
	title.className =
		'line-clamp-2 min-w-0 flex-1 whitespace-normal text-left font-[family-name:var(--font-family-serif)] text-[13px] leading-[1.5] text-foreground decoration-primary/30 group-hover/cell:underline';
	title.textContent = name;

	cell.appendChild(thumbWrap);
	cell.appendChild(title);

	return cell;
}
