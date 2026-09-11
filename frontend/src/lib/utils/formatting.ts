/**
 * Convert length + lengthUnits to display format.
 */
export function formatDuration(length: number | null, lengthUnits: string | null): string {
	if (length === null) return '—';

	if (lengthUnits === 'seconds') {
		const minutes = Math.floor(length / 60);
		const seconds = length % 60;
		return `${minutes}:${seconds.toString().padStart(2, '0')}`;
	}

	return `${length} ${lengthUnits}`;
}

/**
 * Format ISO date string to locale string.
 */
export function formatDate(isoString: string): string {
	const date = new Date(isoString);
	if (isNaN(date.getTime())) return '—';
	return date.toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
}

/**
 * Format ISO date string to locale date + time, for hover tooltips where the
 * exact moment matters (not just the day). No `timeZone` option is passed,
 * so `toLocaleString` uses the browser's local timezone automatically —
 * that's what "translated to browser time" means here, no manual offset math.
 */
export function formatDateTime(isoString: string): string {
	const date = new Date(isoString);
	if (isNaN(date.getTime())) return '—';
	return date.toLocaleString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	});
}

/**
 * Client-side mirror of the backend's YouTube metadata cache window
 * (YOUTUBE_API_CACHE_TTL_SECONDS, default 6h — see backend/.env.example and
 * backend/internal/adapters/youtube/cache.go). This is a UX-only estimate
 * used to skip a pointless "Update source data" round trip and explain why
 * the numbers won't change yet; the backend cache is the actual source of
 * truth and enforces the real TTL independently (a stale or bypassed
 * client-side value here just means an occasional wasted round trip, not a
 * quota risk). Keep this in sync if the backend default ever changes.
 */
export const SOURCE_DATA_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export interface SourceDataCooldown {
	active: boolean;
	remainingMs: number;
}

/**
 * Whether a content item was updated recently enough that refreshing it
 * again would just re-serve the backend's cached YouTube response.
 */
export function getSourceDataCooldown(updatedAtIso: string, now: Date = new Date()): SourceDataCooldown {
	const updatedAt = new Date(updatedAtIso);
	if (isNaN(updatedAt.getTime())) return { active: false, remainingMs: 0 };

	const remainingMs = SOURCE_DATA_COOLDOWN_MS - (now.getTime() - updatedAt.getTime());
	return { active: remainingMs > 0, remainingMs: Math.max(0, remainingMs) };
}

/**
 * Format a millisecond duration as a short "5h 42m" / "42m" string, for
 * cooldown messaging. Rounds up so it never reads "0m" while time remains.
 */
export function formatRemainingTime(ms: number): string {
	if (ms <= 0) return '0m';
	const totalMinutes = Math.ceil(ms / 60_000);
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
	if (hours > 0) return `${hours}h`;
	return `${minutes}m`;
}

/**
 * AG Grid value getter for duration column.
 */
export function durationValueGetter(params: { data?: { length: number | null; lengthUnits: string | null } }): string {
	if (!params.data) return '—';
	return formatDuration(params.data.length, params.data.lengthUnits);
}

/**
 * AG Grid filter value getter for duration column.
 * Returns raw seconds so agNumberColumnFilter compares numerically.
 */
export function durationFilterValueGetter(params: { data?: { length: number | null } }): number | null {
	return params.data?.length ?? null;
}

/**
 * Format seconds as m:ss display string (for filter chip display).
 */
export function formatDurationSeconds(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Parse duration filter input. Accepts "m:ss" or plain seconds.
 * Returns total seconds, or null if unparseable.
 */
export function parseDurationInput(text: string | null): number | null {
	if (text == null || text.trim() === '') return null;
	const trimmed = text.trim();
	if (trimmed.includes(':')) {
		const [minStr, secStr] = trimmed.split(':');
		const mins = parseInt(minStr, 10);
		const secs = parseInt(secStr, 10);
		if (isNaN(mins) || isNaN(secs)) return null;
		return mins * 60 + secs;
	}
	const n = parseFloat(trimmed);
	return isNaN(n) ? null : n;
}

/**
 * AG Grid value formatter for date columns.
 */
export function dateValueFormatter(params: { value?: string }): string {
	return params.value ? formatDate(params.value) : '—';
}

/**
 * AG Grid row ID getter for content rows.
 */
export function contentRowId(params: { data?: { id: string | number } }): string {
	return String(params.data?.id ?? '');
}

/**
 * Format count numbers with K/M/B suffixes (space before suffix).
 */
export function formatCount(count: number | null): string {
	if (count === null) return '--';
	if (count < 1000) return String(count);
	if (count < 1_000_000) return `${(count / 1_000).toFixed(1)} K`;
	if (count < 1_000_000_000) return `${(count / 1_000_000).toFixed(1)} M`;
	return `${(count / 1_000_000_000).toFixed(1)} B`;
}

/**
 * Format count with comma separators for exact display.
 */
export function formatCountExact(count: number | null): string {
	if (count === null) return '--';
	return count.toLocaleString('en-US');
}

/**
 * AG Grid value getter for % Liked — likes as a percentage of views.
 * Computed client-side; both fields are already loaded on ContentItem, so no
 * backend field is needed (see .claude/docs/ADDING_AG_GRID_COLUMN.md
 * Decision 1). Returns null when views is 0/null/missing or likes is
 * missing — there's no meaningful rate to show.
 */
export function percentLikedValueGetter(params: {
	data?: { viewCount: number | null; likeCount: number | null };
}): number | null {
	const views = params.data?.viewCount;
	const likes = params.data?.likeCount;
	if (!views || likes === null || likes === undefined) return null;
	return (likes / views) * 100;
}

/**
 * Format a % Liked value to 1 decimal place, or "—" when unavailable.
 */
export function formatPercentLiked(value: number | null): string {
	if (value === null) return '—';
	return `${value.toFixed(1)}%`;
}

/**
 * AG Grid tooltip value getter for % Liked — shows the exact calculation
 * (likes ÷ views × 100) with the result to 3 decimal places, so a rounded
 * 1-decimal cell value never hides the precision behind it.
 */
export function percentLikedTooltip(params: { data?: { viewCount: number | null; likeCount: number | null } }): string {
	const views = params.data?.viewCount;
	const likes = params.data?.likeCount;
	if (!views || likes === null || likes === undefined) return 'No views recorded';
	const pct = (likes / views) * 100;
	return `${formatCountExact(likes)} ÷ ${formatCountExact(views)} × 100 = ${pct.toFixed(3)}%`;
}

/**
 * Format date in compact form: "MMM 'YY" (e.g., "Jul '10") for tight columns.
 */
export function formatDateCompact(isoString: string | null): string {
	if (!isoString) return '—';
	const date = new Date(isoString);
	if (isNaN(date.getTime())) return '—';
	const month = date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
	const year = String(date.getUTCFullYear()).slice(2);
	return `${month} '${year}`;
}

/**
 * Format YouTube publish date (ISO string).
 */
export function formatPublishDate(isoString: string | null): string {
	if (!isoString) return '--';
	return formatDate(isoString);
}

/**
 * Format tags array to comma-separated string.
 */
export function formatTags(tags: string[] | null): string {
	if (!tags || tags.length === 0) return '--';
	return tags.join(', ');
}

/**
 * Truncate description with ellipsis.
 */
export function truncateDescription(desc: string | null, maxLength = 100): string {
	if (!desc) return '--';
	if (desc.length <= maxLength) return desc;
	return desc.substring(0, maxLength) + '...';
}

/**
 * Extract video ID from YouTube URL.
 */
export function extractVideoIdFromUrl(url: string | null): string | null {
	if (!url) return null;
	try {
		const urlObj = new URL(url);
		// youtube.com/watch?v=ID
		if (urlObj.hostname.includes('youtube.com') && urlObj.pathname === '/watch') {
			return urlObj.searchParams.get('v');
		}
		// youtu.be/ID
		if (urlObj.hostname === 'youtu.be') {
			return urlObj.pathname.slice(1);
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * Compute minimum AG Grid column width (px) so header text + icons never truncate.
 * AG Grid only accepts px — we derive from the grid's font metrics.
 */
const GRID_FONT_SIZE = 14; // matches AG Grid theme fontSize
export function headerMinWidth(name: string, hasFilter = true): number {
	const charWidthEm = 0.55; // approx em per char at font-weight 600
	const paddingEm = 1.5; // left + right cell padding
	const sortIconEm = 1.6; // sort indicator — widened so short headers (e.g. "Length") don't truncate once an active sort indicator is actually painted, not just reserved for
	const filterIconEm = hasFilter ? 1.5 : 0;
	const separatorEm = 0.5; // column border/handle
	const totalEm = name.length * charWidthEm + paddingEm + sortIconEm + filterIconEm + separatorEm;
	return Math.ceil(totalEm * GRID_FONT_SIZE);
}

/**
 * AG Grid cell renderer for item column with thumbnail and clickable title.
 */
export function itemCellRenderer(params: { data?: { name: string; url: string | null } }): HTMLElement | string {
	if (!params.data) return '';

	const container = document.createElement('div');
	container.className = 'flex items-center gap-2';

	// Thumbnail
	const videoId = extractVideoIdFromUrl(params.data.url);
	if (videoId) {
		const img = document.createElement('img');
		img.src = `https://i.ytimg.com/vi/${videoId}/default.jpg`;
		img.alt = '';
		img.className = 'w-10 h-8 object-cover rounded thumbnail-mobile-hide';
		container.appendChild(img);
	}

	// Title link
	if (params.data.url) {
		const a = document.createElement('a');
		a.href = params.data.url;
		a.target = '_blank';
		a.rel = 'noopener noreferrer';
		a.className = 'text-primary hover:underline';
		a.textContent = params.data.name;
		container.appendChild(a);
	} else {
		const span = document.createElement('span');
		span.textContent = params.data.name;
		container.appendChild(span);
	}

	return container;
}

/**
 * AG Grid cell renderer for type column with YouTube icon.
 */
export function typeCellRenderer(params: { data?: { contentType: string } }): HTMLElement | string {
	if (!params.data) return '';

	const container = document.createElement('div');
	container.className = 'flex items-center justify-center h-full w-full';

	// Hidden text for filter matching
	const hidden = document.createElement('span');
	hidden.className = 'sr-only';
	hidden.textContent = params.data.contentType ?? '';
	container.appendChild(hidden);

	// YouTube play button icon (red)
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('width', '20');
	svg.setAttribute('height', '20');
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('fill', '#FF0000');

	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	path.setAttribute(
		'd',
		'M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z',
	);

	svg.appendChild(path);
	container.appendChild(svg);

	return container;
}

/**
 * Perspectize glasses SVG path data (inline SVG for AG Grid cell renderer).
 * Simple glasses silhouette using currentColor.
 */
const GLASSES_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <!-- Left lens -->
  <circle cx="7.5" cy="13.5" r="3.5"/>
  <!-- Right lens -->
  <circle cx="16.5" cy="13.5" r="3.5"/>
  <!-- Bridge -->
  <line x1="11" y1="13.5" x2="13" y2="13.5"/>
  <!-- Left arm -->
  <line x1="4" y1="13.5" x2="2" y2="11"/>
  <!-- Right arm -->
  <line x1="20" y1="13.5" x2="22" y2="11"/>
</svg>`;

/**
 * Perspectize column header component class for AG Grid.
 * AG Grid headerComponent requires a class with init() and getGui() methods.
 */
export class PerspectiveHeaderRenderer {
	private eGui!: HTMLElement;

	init(): void {
		this.eGui = document.createElement('div');
		this.eGui.className = 'flex items-center justify-center w-full h-full';
		this.eGui.innerHTML = GLASSES_SVG;
		this.eGui.title = 'Perspectize — add or edit your perspective';
	}

	getGui(): HTMLElement {
		return this.eGui;
	}
}

/**
 * AG Grid cell renderer for the Perspectize column.
 * Shows "+" if user has no perspective on this row, or glasses icon if they do.
 * Reads perspectivesByContentId from AG Grid context.
 */
export function perspectiveCellRenderer(params: {
	data?: { id: string };
	context?: { perspectivesByContentId?: Map<string, unknown> };
}): HTMLElement {
	const container = document.createElement('div');
	container.className = 'h-full w-full flex items-center justify-center cursor-pointer';

	const hasPerspective = params.context?.perspectivesByContentId?.has(params.data?.id ?? '');

	if (hasPerspective) {
		container.innerHTML = GLASSES_SVG;
		container.title = 'Edit your perspective';
		container.style.color = '#1a365d';
	} else {
		const span = document.createElement('span');
		span.textContent = '+';
		span.className = 'text-xl font-bold leading-none';
		span.style.color = 'color-mix(in srgb, var(--color-muted-foreground) 40%, transparent)';
		container.appendChild(span);
		container.title = 'Add a perspective';
	}

	return container;
}

/**
 * AG Grid cell renderer for category column.
 * Shows category label if assigned, or '+' icon for empty cells.
 */
export function categoryCellRenderer(params: {
	data?: { primaryCategory: { label: string; description: string | null; wikidataQid: string } | null };
}): HTMLElement {
	const container = document.createElement('div');
	// h-full w-full required for flexbox centering to fill entire cell (Decision 6 gotcha)
	container.style.cssText = 'display:flex;align-items:center;height:100%;width:100%;cursor:pointer;';

	const category = params.data?.primaryCategory;
	if (category) {
		const label = document.createElement('span');
		label.textContent = category.label;
		label.title = category.description ?? category.wikidataQid;
		label.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
		container.appendChild(label);
	} else {
		const plus = document.createElement('span');
		plus.textContent = '+';
		plus.style.cssText = 'color:#a3a3a3;font-size:18px;';
		container.appendChild(plus);
	}

	return container;
}

/**
 * AG Grid cell renderer for content name column.
 * Returns an anchor if URL exists, otherwise a span.
 */
export function nameCellRenderer(params: { data?: { name: string; url: string | null } }): HTMLElement | string {
	if (!params.data) return '';
	if (params.data.url) {
		const a = document.createElement('a');
		a.href = params.data.url;
		a.target = '_blank';
		a.rel = 'noopener noreferrer';
		a.className = 'text-primary hover:underline';
		a.textContent = params.data.name;
		return a;
	}
	const span = document.createElement('span');
	span.textContent = params.data.name;
	return span;
}
