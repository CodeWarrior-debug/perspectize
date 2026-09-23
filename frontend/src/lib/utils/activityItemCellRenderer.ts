import { extractVideoIdFromUrl } from './formatting';
import { BIBLE_PASSAGE_ICON_SVG } from './icons';

/**
 * Bible passage variant of the Item cell: an icon tile instead of a thumbnail
 * (no image request), the reference (`name`) as the title, and — once someone
 * has set a display title — that title as primary text with the reference as
 * a subtitle (AN Q23).
 */
function renderPassageCell(opts: {
	id: string | number;
	name: string;
	url: string | null;
	displayTitle?: string | null;
	onOpenDetails?: (contentId: string) => void;
}): HTMLElement {
	const { id, name, url, displayTitle, onOpenDetails } = opts;

	const cell = document.createElement('div');
	cell.className = 'group/cell flex h-full w-full items-center gap-2 px-2.5 py-2 cursor-pointer';
	cell.addEventListener('click', () => onOpenDetails?.(String(id)));

	const iconBox = document.createElement('div');
	iconBox.dataset.testid = 'item-thumb';
	iconBox.className = 'flex h-8 w-10 flex-none items-center justify-center rounded bg-muted text-primary';
	iconBox.innerHTML = BIBLE_PASSAGE_ICON_SVG;
	iconBox.addEventListener('click', (e) => {
		e.stopPropagation();
		if (url) window.open(url, '_blank', 'noopener,noreferrer');
	});

	const textWrap = document.createElement('div');
	textWrap.className = 'min-w-0 flex-1 text-left whitespace-normal';

	const title = document.createElement('div');
	title.dataset.testid = 'item-title';
	title.className = `${displayTitle ? 'line-clamp-1' : 'line-clamp-2'} font-[family-name:var(--font-family-serif)] text-[13px] leading-[1.5] text-foreground decoration-primary/30 group-hover/cell:underline`;
	title.textContent = displayTitle || name;
	textWrap.appendChild(title);

	if (displayTitle) {
		const subtitle = document.createElement('div');
		subtitle.dataset.testid = 'item-subtitle';
		subtitle.className = 'line-clamp-1 text-[11px] leading-[1.5] text-muted-foreground';
		subtitle.textContent = name;
		textWrap.appendChild(subtitle);
	}

	cell.appendChild(iconBox);
	cell.appendChild(textWrap);
	return cell;
}

export interface ActivityItemCellRendererParams {
	data?: {
		id: string | number;
		name: string;
		url: string | null;
		contentType?: string;
		displayTitle?: string | null;
	};
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
export function activityItemCellRenderer(params: ActivityItemCellRendererParams): HTMLElement | string {
	if (!params.data) return '';

	const { id, name, url, contentType, displayTitle } = params.data;
	const onOpenDetails = params.context?.onOpenDetails;

	if (contentType === 'BIBLE_PASSAGE') {
		return renderPassageCell({ id, name, url, displayTitle, onOpenDetails });
	}

	// No native `title` attribute here (or on the thumbnail below) — the column's
	// context.tooltipSpec popover already shows details on cell hover, and a
	// native title attribute on top of that shows two overlapping tooltip boxes.
	const cell = document.createElement('div');
	cell.className = 'group/cell flex h-full w-full items-center gap-2 px-2.5 py-2 cursor-pointer';
	cell.addEventListener('click', () => {
		onOpenDetails?.(String(id));
	});

	const thumbWrap = document.createElement('div');
	thumbWrap.dataset.testid = 'item-thumb';
	thumbWrap.className = 'group/thumb relative h-8 w-10 flex-none overflow-hidden rounded bg-muted';
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
