import { BIBLE_PASSAGE_ICON_SVG } from './icons';
import type { LengthDisplay } from '$lib/queries/content';

/** The one "no value" glyph for grid cells; keep new formatters on it. */
export const EMPTY_VALUE = '—';

/**
 * Convert length + lengthUnits to display format, to the source's precision
 * (`lengthDisplay.precision`): MINUTES -> h:mm (a TMDB runtime, so no ":00"),
 * anything else (SECONDS, unknown, absent) -> h:mm:ss / m:ss.
 */
export function formatDuration(length: number | null, lengthUnits: string | null, precision?: string | null): string {
	if (length === null) return EMPTY_VALUE;

	if (lengthUnits === 'seconds') {
		return precision === 'MINUTES' ? formatDurationMinutes(length) : formatDurationSeconds(length);
	}

	return `${length} ${lengthUnits}`;
}

/** h:mm from seconds, for lengths a source reports to the minute (142 min -> "2:22", 45 -> "0:45"). */
export function formatDurationMinutes(seconds: number): string {
	const totalMinutes = Math.round(seconds / 60);
	return `${Math.floor(totalMinutes / 60)}:${(totalMinutes % 60).toString().padStart(2, '0')}`;
}

const MONEY_UNITS = [
	{ size: 1e3, suffix: 'K' },
	{ size: 1e6, suffix: 'M' },
	{ size: 1e9, suffix: 'B' },
	{ size: 1e12, suffix: 'T' },
] as const;

/**
 * Compact USD (`$1.2B`, `$316M`, `$950K`, `$999`). One decimal only when
 * non-zero. null or 0 is "unknown" (TMDB reports 0 for no data), never "$0".
 */
export function formatMoneyCompact(usd: number | null): string {
	if (usd == null || usd === 0) return EMPTY_VALUE;
	if (Math.abs(usd) < 1e3) return `$${Math.round(usd)}`;
	let idx = 0;
	for (let i = 0; i < MONEY_UNITS.length; i++) {
		if (Math.abs(usd) >= MONEY_UNITS[i].size) idx = i;
	}
	// Round to one decimal in integer space (avoids 1.15.toFixed(1) === "1.1"),
	// and promote a rounded 1000 (999_999 -> 1000K) to the next unit.
	const scale = (i: number) => Math.round(usd / (MONEY_UNITS[i].size / 10)) / 10;
	let value = scale(idx);
	if (Math.abs(value) >= 1000 && idx < MONEY_UNITS.length - 1) {
		idx += 1;
		value = scale(idx);
	}
	return `$${value}${MONEY_UNITS[idx].suffix}`;
}

/** Full USD with thousands separators (`$1,234,567`); null or 0 -> EMPTY_VALUE. */
export function formatMoneyExact(usd: number | null): string {
	if (usd == null || usd === 0) return EMPTY_VALUE;
	return `$${usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/** Revenue as a percentage of budget; null when either side is unknown (null or 0). */
export function vsBudgetPercent(revenue: number | null, budget: number | null): number | null {
	if (!revenue || !budget) return null;
	return (revenue / budget) * 100;
}

/** `3,455%` (rounded, thousands separators; `<1%` for a positive ratio under 0.5%); null -> EMPTY_VALUE. */
export function formatVsBudget(pct: number | null): string {
	if (pct == null) return EMPTY_VALUE;
	// A tiny positive ratio must not read as a flat loss of everything ("0%").
	if (pct > 0 && pct < 0.5) return '<1%';
	return `${Math.round(pct).toLocaleString('en-US')}%`;
}

/**
 * Parse a YouTube ISO 8601 duration string (e.g. "PT4M13S", "PT1H2M10S",
 * "PT45S") into total seconds. Returns null if the string doesn't match the
 * expected `PT[nH][nM][nS]` shape (including an empty match, e.g. "PT").
 */
export function parseIsoDuration(iso: string | null | undefined): number | null {
	if (!iso) return null;
	const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
	if (!match) return null;
	const [, hoursStr, minutesStr, secondsStr] = match;
	if (!hoursStr && !minutesStr && !secondsStr) return null;
	const hours = parseInt(hoursStr ?? '0', 10);
	const minutes = parseInt(minutesStr ?? '0', 10);
	const seconds = parseInt(secondsStr ?? '0', 10);
	return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Format a YouTube ISO 8601 duration (from `contentDetails.duration` on a
 * trending/videos.list result) as "M:SS" or "H:MM:SS", for the Discover
 * page's duration badge. Returns null when unparseable so callers can skip
 * rendering the badge entirely — unlike `formatDuration` below, which is for
 * AG Grid cells where an EMPTY_VALUE dash placeholder is expected instead.
 */
export function formatIsoDuration(iso: string | null | undefined): string | null {
	const totalSeconds = parseIsoDuration(iso);
	if (totalSeconds === null) return null;
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	if (hours > 0) {
		return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
	}
	return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Format ISO date string to locale string.
 */
export function formatDate(isoString: string): string {
	const date = new Date(isoString);
	if (isNaN(date.getTime())) return EMPTY_VALUE;
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
	if (isNaN(date.getTime())) return EMPTY_VALUE;
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
 * Duration cell tooltip: the value plus the format it is in, so the unit is
 * clear ("2:59 (h:mm)" for a movie runtime, "3:47 (m:ss)", "1:02:03 (h:mm:ss)").
 */
export function durationTooltip(params: {
	data?: { length: number | null; lengthUnits: string | null; lengthDisplay?: LengthDisplay | null };
}): string {
	const d = params.data;
	if (!d || d.length == null) return '';
	const precision = d.lengthDisplay?.precision;
	const text = formatDuration(d.length, d.lengthUnits, precision);
	if (d.lengthUnits !== 'seconds') return text;
	const unit = precision === 'MINUTES' ? 'h:mm' : d.length >= 3600 ? 'h:mm:ss' : 'm:ss';
	return `${text} (${unit})`;
}

/**
 * AG Grid value getter for duration column.
 */
export function durationValueGetter(params: {
	data?: { length: number | null; lengthUnits: string | null; lengthDisplay?: LengthDisplay | null };
}): string {
	if (!params.data) return EMPTY_VALUE;
	return formatDuration(params.data.length, params.data.lengthUnits, params.data.lengthDisplay?.precision);
}

/**
 * AG Grid filter value getter for duration column.
 * Returns raw seconds so agNumberColumnFilter compares numerically.
 */
export function durationFilterValueGetter(params: { data?: { length: number | null } }): number | null {
	return params.data?.length ?? null;
}

/**
 * Format seconds as `m:ss` below an hour and `h:mm:ss` from 3600 up. The one
 * duration formatter, shared by YouTube (`formatDuration`), Movie runtime and
 * filter chips.
 */
export function formatDurationSeconds(seconds: number): string {
	const pad = (n: number) => n.toString().padStart(2, '0');
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
	return `${m}:${pad(s)}`;
}

/**
 * Parse duration filter input. Accepts "h:mm:ss", "m:ss" or plain seconds.
 * Returns total seconds, or null if unparseable.
 */
export function parseDurationInput(text: string | null): number | null {
	if (text == null || text.trim() === '') return null;
	const trimmed = text.trim();
	if (trimmed.includes(':')) {
		const parts = trimmed.split(':');
		if (parts.length > 3) return null;
		const nums = parts.map((p) => parseInt(p, 10));
		if (nums.some((n) => isNaN(n))) return null;
		return nums.reduce((total, n) => total * 60 + n, 0);
	}
	const n = parseFloat(trimmed);
	return isNaN(n) ? null : n;
}

/**
 * AG Grid value formatter for date columns.
 */
export function dateValueFormatter(params: { value?: string }): string {
	return params.value ? formatDate(params.value) : EMPTY_VALUE;
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
	if (count === null) return EMPTY_VALUE;
	if (count < 1000) return String(count);
	if (count < 1_000_000) return `${(count / 1_000).toFixed(1)} K`;
	if (count < 1_000_000_000) return `${(count / 1_000_000).toFixed(1)} M`;
	return `${(count / 1_000_000_000).toFixed(1)} B`;
}

/**
 * Format count with comma separators for exact display.
 */
export function formatCountExact(count: number | null): string {
	// Empty (not EMPTY_VALUE): the tooltip layer treats '' as "nothing to show" and opens no popover.
	if (count === null) return '';
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
	if (value === null) return EMPTY_VALUE;
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
	if (!isoString) return EMPTY_VALUE;
	const date = new Date(isoString);
	if (isNaN(date.getTime())) return EMPTY_VALUE;
	const month = date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
	const year = String(date.getUTCFullYear()).slice(2);
	return `${month} '${year}`;
}

/**
 * Format YouTube publish date (ISO string).
 */
export function formatPublishDate(isoString: string | null): string {
	if (!isoString) return EMPTY_VALUE;
	return formatDate(isoString);
}

/**
 * Format tags array to comma-separated string.
 */
export function formatTags(tags: string[] | null): string {
	if (!tags || tags.length === 0) return EMPTY_VALUE;
	return tags.join(', ');
}

/**
 * Truncate description with ellipsis.
 */
export function truncateDescription(desc: string | null, maxLength = 100): string {
	if (!desc) return EMPTY_VALUE;
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
	// No column divider any more (headerColumnBorder is off and the resize handle is an overlay),
	// so nothing to reserve — keeps the full column set inside the max-w-screen-xl page container.
	const separatorEm = 0;
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
/** YouTube play-button icon path (the circle-with-triangle glyph), for typeCellRenderer. */
const YOUTUBE_ICON_PATH =
	'M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z';

/** A plain speech-bubble glyph for CLAIM rows, distinct from the YouTube play button. */
const CLAIM_ICON_PATH =
	'M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4.29 3.71A1 1 0 0 1 3 19V5a1 1 0 0 1 1-1zm2 4h12M6 10.5h8';

/** Film-frame glyph for MOVIE rows (outline, themed stroke). */
const MOVIE_ICON_PATH =
	'M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5';

export function typeCellRenderer(params: { data?: { contentType: string } }): HTMLElement | string {
	if (!params.data) return '';

	const container = document.createElement('div');
	container.className = 'flex items-center justify-center h-full w-full';

	if (params.data.contentType === 'BIBLE_PASSAGE') {
		container.classList.add('text-primary');
		container.innerHTML = BIBLE_PASSAGE_ICON_SVG;
		const label = document.createElement('span');
		label.className = 'sr-only';
		label.textContent = 'Bible Passage';
		container.appendChild(label);
		return container;
	}

	if (params.data.contentType === 'MOVIE') {
		container.title = 'Movie';
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '20');
		svg.setAttribute('height', '20');
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('fill', 'none');
		svg.setAttribute('stroke', 'var(--color-muted-foreground)');
		svg.setAttribute('stroke-width', '2');
		svg.setAttribute('stroke-linecap', 'round');
		svg.setAttribute('stroke-linejoin', 'round');
		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', MOVIE_ICON_PATH);
		svg.appendChild(path);
		const label = document.createElement('span');
		label.className = 'sr-only';
		label.textContent = 'Movie';
		container.appendChild(svg);
		container.appendChild(label);
		return container;
	}

	// Hidden text for filter matching
	const hidden = document.createElement('span');
	hidden.className = 'sr-only';
	hidden.textContent = params.data.contentType ?? '';
	container.appendChild(hidden);

	const isClaim = params.data.contentType === 'CLAIM';

	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('width', '20');
	svg.setAttribute('height', '20');
	svg.setAttribute('viewBox', '0 0 24 24');
	if (isClaim) {
		// Not a brand colour (unlike YouTube red below) — use the theme token.
		svg.setAttribute('fill', 'none');
		svg.setAttribute('stroke', 'var(--color-muted-foreground)');
		svg.setAttribute('stroke-width', '2');
		svg.setAttribute('stroke-linecap', 'round');
		svg.setAttribute('stroke-linejoin', 'round');
	} else {
		svg.setAttribute('fill', '#FF0000'); // YouTube brand red (hex-ok: fixed brand colour, not themeable)
	}

	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	path.setAttribute('d', isClaim ? CLAIM_ICON_PATH : YOUTUBE_ICON_PATH);

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
	data?: {
		primaryCategory: {
			label: string;
			description: string | null;
			wikidataQid: string;
			wikipediaUrl?: string | null;
		} | null;
	};
}): HTMLElement {
	const container = document.createElement('div');
	// h-full w-full required for flexbox centering to fill entire cell (Decision 6 gotcha)
	container.style.cssText = 'display:flex;align-items:center;height:100%;width:100%;cursor:pointer;';

	const category = params.data?.primaryCategory;
	if (category) {
		// Label links out to Wikipedia when available; clicking elsewhere in the
		// cell still opens the category-edit popover (see ActivityTable's grid
		// cell click handler).
		const label: HTMLElement = category.wikipediaUrl ? document.createElement('a') : document.createElement('span');
		label.textContent = category.label;
		label.title = category.description ?? category.wikidataQid;
		label.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
		if (category.wikipediaUrl && label instanceof HTMLAnchorElement) {
			label.href = category.wikipediaUrl;
			label.target = '_blank';
			label.rel = 'noopener noreferrer';
			label.style.textDecoration = 'underline';
			label.addEventListener('click', (e) => e.stopPropagation());
		}
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

// ---------------------------------------------------------------------------
// Movie (TMDB) cells
// ---------------------------------------------------------------------------
//
// Movie rows carry their data in the Content `movie` JSON (list rows) or `response`
// (details query), shaped by backend/internal/adapters/tmdb/parse.go (ShapeMovie).
// Every reader below goes through movieResponse(), which returns null for non-movie
// rows and anything that isn't an object, so a null/foreign payload degrades to EMPTY_VALUE.

export interface MovieCast {
	id: number;
	name: string;
	character?: string;
	order?: number;
}

export interface MovieResponse {
	tmdbId?: number;
	imdbId?: string;
	tagline?: string;
	overview?: string;
	releaseDate?: string;
	year?: number;
	genres?: string[];
	certification?: string;
	runtimeMinutes?: number;
	budget?: number | null;
	revenue?: number | null;
	voteAverage?: number;
	voteCount?: number;
	posterPath?: string | null;
	keywords?: string[];
	cast?: MovieCast[];
	directors?: { id: number; name: string }[];
	collection?: { id?: number; name?: string } | null;
}

/** Minimal row shape the Movie helpers read. */
export interface MovieRow {
	contentType?: string;
	movie?: unknown;
	response?: unknown;
	tags?: string[] | null;
}

/** The parsed Movie payload, or null when the row isn't a Movie or has no usable `movie`/`response`. */
export function movieResponse(row: MovieRow | null | undefined): MovieResponse | null {
	if (!row || row.contentType !== 'MOVIE') return null;
	let r = row.movie ?? row.response;
	if (typeof r === 'string') {
		try {
			r = JSON.parse(r);
		} catch {
			return null;
		}
	}
	if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
	return r as MovieResponse;
}

export interface MoviePerson {
	id: number;
	name: string;
	role: 'director' | 'cast';
	character: string | null;
}

/** Directors first, then cast in billing order. */
export function moviePeople(row: MovieRow | null | undefined): MoviePerson[] {
	const m = movieResponse(row);
	if (!m) return [];
	const directors: MoviePerson[] = (m.directors ?? []).map((d) => ({
		id: d.id,
		name: d.name,
		role: 'director',
		character: null,
	}));
	const cast: MoviePerson[] = [...(m.cast ?? [])]
		.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
		.map((c) => ({ id: c.id, name: c.name, role: 'cast', character: c.character || null }));
	return [...directors, ...cast];
}

/** Most directors / lead cast names the Cast cell lists; everyone else collapses to `+N`. */
export const CAST_CELL_MAX_DIRECTORS = 2;
export const CAST_CELL_MAX_CAST = 3;

/** Attribute on a clickable cast/director name; its value is the TMDB person id (read by ActivityTable's cell click). */
export const PERSON_ID_ATTR = 'data-person-id';

/** The names, comma separated, each wrapped in a span carrying its person id so a click can filter by that person. */
function appendPeople(parent: HTMLElement, people: MoviePerson[]): void {
	people.forEach((p, i) => {
		if (i > 0) parent.appendChild(document.createTextNode(', '));
		const name = document.createElement('span');
		name.setAttribute(PERSON_ID_ATTR, String(p.id));
		name.className = 'cursor-pointer hover:underline';
		name.title = `Show movies with ${p.name}`;
		name.textContent = p.name;
		parent.appendChild(name);
	});
}

function castLine(people: MoviePerson[], directors: boolean): HTMLElement {
	const line = document.createElement('div');
	line.dataset.testid = 'cast-line';
	line.className = 'flex w-full min-w-0 items-baseline gap-1';
	const text = document.createElement('span');
	text.className = 'min-w-0 truncate text-foreground';
	if (directors) {
		const marker = document.createElement('span');
		marker.className = 'text-muted-foreground';
		marker.textContent = 'dir.';
		text.appendChild(marker);
		text.appendChild(document.createTextNode(' '));
	}
	appendPeople(text, people);
	line.appendChild(text);
	return line;
}

/**
 * AG Grid cell renderer for the Cast column: plain text on up to two stacked lines.
 * Line 1 the director(s) (prefixed `dir.`), line 2 the lead cast, each one truncating
 * span. A flex-none `+N` (people not named in the cell) ends the last line, so it is never
 * clipped. With no directors the cast is line 1; with no cast `+N` follows the directors.
 * No people -> EMPTY_VALUE.
 */
export function castCellRenderer(params: { data?: MovieRow }): HTMLElement | string {
	if (!params.data) return '';
	const people = moviePeople(params.data);

	const container = document.createElement('div');
	container.className =
		'flex h-full w-full flex-col justify-center overflow-hidden whitespace-nowrap text-[11px] leading-tight';
	if (people.length === 0) {
		container.textContent = EMPTY_VALUE;
		return container;
	}

	const directors = people.filter((p) => p.role === 'director').slice(0, CAST_CELL_MAX_DIRECTORS);
	const cast = people.filter((p) => p.role === 'cast').slice(0, CAST_CELL_MAX_CAST);
	const lines: HTMLElement[] = [];
	if (directors.length > 0) lines.push(castLine(directors, true));
	if (cast.length > 0) lines.push(castLine(cast, false));
	for (const line of lines) container.appendChild(line);

	const extra = people.length - directors.length - cast.length;
	if (extra > 0) {
		const more = document.createElement('span');
		more.dataset.testid = 'cast-more';
		more.className = 'flex-none text-muted-foreground';
		more.textContent = `+${extra}`;
		lines[lines.length - 1].appendChild(more);
	}
	return container;
}

/** Cast tooltip checklist rows: name, role (Director / as <character>) and TMDB person id. */
export function castTooltipItems(row: MovieRow | null | undefined): string[] {
	return moviePeople(row).map((p) => {
		const role = p.role === 'director' ? 'Director' : p.character ? `as ${p.character}` : null;
		return [p.name, role, `TMDB #${p.id}`].filter(Boolean).join(' · ');
	});
}

/** TMDB reports 0 for "unknown"; the backend stores null, and this guards a stray 0 too. */
function knownNumber(v: number | null | undefined): number | null {
	return v == null || v === 0 ? null : v;
}

/** Box office = revenue (USD); null when unknown. */
export function boxOfficeValueGetter(params: { data?: MovieRow }): number | null {
	return knownNumber(movieResponse(params.data)?.revenue);
}

export function formatBoxOffice(usd: number | null): string {
	return formatMoneyCompact(usd);
}

export function boxOfficeTooltip(params: { data?: MovieRow }): string {
	const revenue = boxOfficeValueGetter(params);
	return revenue == null ? '' : formatMoneyExact(revenue);
}

/** Budget (USD); null when unknown. Picker-only column. */
export function budgetValueGetter(params: { data?: MovieRow }): number | null {
	return knownNumber(movieResponse(params.data)?.budget);
}

/** Revenue as a percentage of budget; null when either side is unknown. */
export function vsBudgetValueGetter(params: { data?: MovieRow }): number | null {
	const m = movieResponse(params.data);
	return vsBudgetPercent(knownNumber(m?.revenue), knownNumber(m?.budget));
}

export function formatVsBudgetCell(pct: number | null): string {
	return formatVsBudget(pct);
}

/** Multiple, net gain/loss, and the marketing caveat. Empty when revenue or budget is unknown. */
export function vsBudgetTooltip(params: { data?: MovieRow }): string {
	const m = movieResponse(params.data);
	const revenue = knownNumber(m?.revenue);
	const budget = knownNumber(m?.budget);
	const pct = vsBudgetPercent(revenue, budget);
	if (pct == null || revenue == null || budget == null) return '';
	const net = revenue - budget;
	const netText =
		net === 0
			? 'broke even'
			: net > 0
				? `net gain ${formatMoneyExact(net)}`
				: `net loss ${formatMoneyExact(Math.abs(net))}`;
	return (
		`Grossed ${(revenue / budget).toFixed(1)}× its ${formatMoneyExact(budget)} budget (${formatVsBudget(pct)}), ${netText}. ` +
		`Ignores marketing and the studio's share of gross, so under 100% does not mean a loss.`
	);
}

const LOW_VOTE_COUNT = 50;

/** TMDB vote average (0-10); null with no votes. */
export function tmdbScoreValueGetter(params: { data?: MovieRow }): number | null {
	const m = movieResponse(params.data);
	if (!m || !m.voteCount || !m.voteAverage) return null;
	return m.voteAverage;
}

/** One decimal out of 10 (`8.4`), never a percent. */
export function formatTmdbScore(score: number | null): string {
	return score == null ? EMPTY_VALUE : score.toFixed(1);
}

/** True when the score rests on fewer than 50 votes (rendered muted). */
export function hasLowVoteCount(params: { data?: MovieRow }): boolean {
	const m = movieResponse(params.data);
	return m != null && (m.voteCount ?? 0) < LOW_VOTE_COUNT;
}

export function tmdbScoreTooltip(params: { data?: MovieRow }): string {
	const score = tmdbScoreValueGetter(params);
	if (score == null) return '';
	const votes = movieResponse(params.data)?.voteCount ?? 0;
	const base = `${score.toFixed(1)} / 10 from ${votes.toLocaleString('en-US')} votes`;
	return hasLowVoteCount(params) ? `${base} (fewer than ${LOW_VOTE_COUNT} votes, so treat it with caution)` : base;
}

/** US certification (`PG-13`); null when TMDB has none. */
export function ratedValueGetter(params: { data?: MovieRow }): string | null {
	return movieResponse(params.data)?.certification || null;
}

const AGE_RATING_ORDER = ['G', 'PG', 'PG-13', 'R', 'NC-17'];

/** G < PG < PG-13 < R < NC-17; anything else (NR, empty) is null so it sorts last. Mirrors the backend AGE_RATING sort. */
export function ageRatingRank(certification: string | null | undefined): number | null {
	const i = AGE_RATING_ORDER.indexOf((certification ?? '').toUpperCase());
	return i === -1 ? null : i;
}

export function genreValueGetter(params: { data?: MovieRow }): string | null {
	const genres = movieResponse(params.data)?.genres;
	return genres && genres.length > 0 ? genres.join(', ') : null;
}

/** ISO release date (`2010-07-15`); null when unknown. */
export function releasedValueGetter(params: { data?: MovieRow }): string | null {
	return movieResponse(params.data)?.releaseDate || null;
}

/** Local-midnight Date for an ISO release date, the shape AG Grid's date filter compares; null when unknown/invalid. */
export function releasedFilterDate(iso: string | null): Date | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
	return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** `Jul 15, 2010`. Formatted in UTC: a date-only string parses as UTC midnight and would otherwise show the previous day west of UTC. */
export function formatReleased(iso: string | null): string {
	if (!iso) return EMPTY_VALUE;
	const d = new Date(iso);
	if (isNaN(d.getTime())) return EMPTY_VALUE;
	return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function votesValueGetter(params: { data?: MovieRow }): number | null {
	return knownNumber(movieResponse(params.data)?.voteCount);
}

export function collectionValueGetter(params: { data?: MovieRow }): string | null {
	return movieResponse(params.data)?.collection?.name || null;
}

export function synopsisValueGetter(params: { data?: MovieRow }): string | null {
	return movieResponse(params.data)?.overview || null;
}

export function tmdbIdValueGetter(params: { data?: MovieRow }): number | null {
	return movieResponse(params.data)?.tmdbId ?? null;
}

/**
 * Tags for a row: the real tags (YouTube) when present, else TMDB keywords for a
 * Movie. Keywords are a source-provided set (see GitHub issue 560 for the planned
 * source vs user tag split; deliberately not modelled here).
 */
export function contentTags(row: MovieRow | null | undefined): string[] | null {
	if (row?.tags && row.tags.length > 0) return row.tags;
	const keywords = movieResponse(row)?.keywords;
	return keywords && keywords.length > 0 ? keywords : null;
}

/** Display text for a nullable string cell. */
export function textOrEmpty(value: string | null | undefined): string {
	return value ? value : EMPTY_VALUE;
}
