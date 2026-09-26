import { describe, it, expect } from 'vitest';
import {
	formatDuration,
	formatDurationSeconds,
	parseDurationInput,
	formatDate,
	formatDateCompact,
	formatDateTime,
	formatCount,
	formatCountExact,
	percentLikedValueGetter,
	formatPercentLiked,
	percentLikedTooltip,
	formatPublishDate,
	formatTags,
	truncateDescription,
	extractVideoIdFromUrl,
	itemCellRenderer,
	typeCellRenderer,
	nameCellRenderer,
	categoryCellRenderer,
	durationValueGetter,
	durationFilterValueGetter,
	dateValueFormatter,
	contentRowId,
	headerMinWidth,
	getSourceDataCooldown,
	formatRemainingTime,
	SOURCE_DATA_COOLDOWN_MS,
} from '$lib/utils/formatting';

describe('formatDuration', () => {
	it('returns dash for null length', () => {
		expect(formatDuration(null, null)).toBe('—');
	});

	it('returns dash for null length with units', () => {
		expect(formatDuration(null, 'seconds')).toBe('—');
	});

	it('formats seconds as minutes:seconds', () => {
		expect(formatDuration(300, 'seconds')).toBe('5:00');
	});

	it('formats seconds with padded seconds part', () => {
		expect(formatDuration(65, 'seconds')).toBe('1:05');
	});

	it('formats zero seconds', () => {
		expect(formatDuration(0, 'seconds')).toBe('0:00');
	});

	it('formats seconds under a minute', () => {
		expect(formatDuration(45, 'seconds')).toBe('0:45');
	});

	it('formats large durations', () => {
		expect(formatDuration(3661, 'seconds')).toBe('61:01');
	});

	it('formats non-seconds units with value and unit', () => {
		expect(formatDuration(10, 'minutes')).toBe('10 minutes');
	});

	it('formats with null units', () => {
		expect(formatDuration(10, null)).toBe('10 null');
	});
});

describe('formatDate', () => {
	it('formats a valid ISO date string', () => {
		expect(formatDate('2026-01-15T12:00:00Z')).toMatch(/Jan 15, 2026/);
	});

	it('formats another valid date', () => {
		expect(formatDate('2026-06-20T12:00:00Z')).toMatch(/Jun 20, 2026/);
	});

	it('returns dash for invalid date string', () => {
		expect(formatDate('not-a-date')).toBe('—');
	});

	it('returns dash for empty string', () => {
		expect(formatDate('')).toBe('—');
	});
});

describe('durationValueGetter', () => {
	it('returns dash when data is missing', () => {
		expect(durationValueGetter({ data: undefined })).toBe('—');
	});

	it('returns formatted duration for seconds', () => {
		expect(durationValueGetter({ data: { length: 300, lengthUnits: 'seconds' } })).toBe('5:00');
	});

	it('returns dash for null length', () => {
		expect(durationValueGetter({ data: { length: null, lengthUnits: null } })).toBe('—');
	});

	it('returns formatted duration for non-seconds', () => {
		expect(durationValueGetter({ data: { length: 10, lengthUnits: 'minutes' } })).toBe('10 minutes');
	});
});

describe('durationFilterValueGetter', () => {
	it('returns null when data is missing', () => {
		expect(durationFilterValueGetter({ data: undefined })).toBeNull();
	});

	it('returns raw seconds for valid data', () => {
		expect(durationFilterValueGetter({ data: { length: 137 } })).toBe(137);
	});

	it('returns null for null length', () => {
		expect(durationFilterValueGetter({ data: { length: null } })).toBeNull();
	});

	it('returns zero for zero length', () => {
		expect(durationFilterValueGetter({ data: { length: 0 } })).toBe(0);
	});
});

describe('formatDurationSeconds', () => {
	it('formats seconds as m:ss', () => {
		expect(formatDurationSeconds(137)).toBe('2:17');
	});

	it('formats zero seconds', () => {
		expect(formatDurationSeconds(0)).toBe('0:00');
	});

	it('formats exact minutes', () => {
		expect(formatDurationSeconds(300)).toBe('5:00');
	});

	it('pads single-digit seconds', () => {
		expect(formatDurationSeconds(65)).toBe('1:05');
	});

	it('formats large durations', () => {
		expect(formatDurationSeconds(3661)).toBe('61:01');
	});

	it('formats sub-minute durations', () => {
		expect(formatDurationSeconds(45)).toBe('0:45');
	});
});

describe('parseDurationInput', () => {
	it('returns null for null', () => {
		expect(parseDurationInput(null)).toBeNull();
	});

	it('returns null for empty string', () => {
		expect(parseDurationInput('')).toBeNull();
	});

	it('returns null for whitespace-only', () => {
		expect(parseDurationInput('   ')).toBeNull();
	});

	it('parses m:ss format to seconds', () => {
		expect(parseDurationInput('5:00')).toBe(300);
	});

	it('parses m:ss with non-zero seconds', () => {
		expect(parseDurationInput('2:17')).toBe(137);
	});

	it('parses 0:45 as 45 seconds', () => {
		expect(parseDurationInput('0:45')).toBe(45);
	});

	it('parses large minute values', () => {
		expect(parseDurationInput('61:01')).toBe(3661);
	});

	it('parses plain number as seconds', () => {
		expect(parseDurationInput('300')).toBe(300);
	});

	it('parses plain decimal number', () => {
		expect(parseDurationInput('45.5')).toBe(45.5);
	});

	it('returns null for non-numeric input', () => {
		expect(parseDurationInput('abc')).toBeNull();
	});

	it('returns null for malformed m:ss', () => {
		expect(parseDurationInput(':30')).toBeNull();
	});

	it('trims whitespace before parsing', () => {
		expect(parseDurationInput(' 5:00 ')).toBe(300);
	});
});

describe('dateValueFormatter', () => {
	it('formats a valid date value', () => {
		expect(dateValueFormatter({ value: '2026-06-20T12:00:00Z' })).toMatch(/Jun 20, 2026/);
	});

	it('returns dash for null value', () => {
		expect(dateValueFormatter({ value: undefined })).toBe('—');
	});

	it('returns dash for empty string value', () => {
		expect(dateValueFormatter({ value: '' })).toBe('—');
	});

	it('returns dash for invalid date', () => {
		expect(dateValueFormatter({ value: 'not-a-date' })).toBe('—');
	});
});

describe('contentRowId', () => {
	it('returns string ID from numeric data', () => {
		expect(contentRowId({ data: { id: 42 } })).toBe('42');
	});

	it('returns string ID from string data', () => {
		expect(contentRowId({ data: { id: 'abc' } })).toBe('abc');
	});

	it('returns empty string when data is undefined', () => {
		expect(contentRowId({ data: undefined })).toBe('');
	});
});

describe('nameCellRenderer', () => {
	it('returns empty string when data is missing', () => {
		expect(nameCellRenderer({ data: undefined })).toBe('');
	});

	it('returns anchor element when URL is present', () => {
		const result = nameCellRenderer({
			data: { name: 'My Video', url: 'https://youtube.com/watch?v=abc' },
		});
		expect(result).toBeInstanceOf(HTMLAnchorElement);
		const anchor = result as HTMLAnchorElement;
		expect(anchor.href).toBe('https://youtube.com/watch?v=abc');
		expect(anchor.textContent).toBe('My Video');
		expect(anchor.target).toBe('_blank');
		expect(anchor.rel).toBe('noopener noreferrer');
		expect(anchor.className).toBe('text-primary hover:underline');
	});

	it('returns span element when URL is null', () => {
		const result = nameCellRenderer({
			data: { name: 'No URL Video', url: null },
		});
		expect(result).toBeInstanceOf(HTMLSpanElement);
		expect((result as HTMLSpanElement).textContent).toBe('No URL Video');
	});

	it('returns span element when URL is empty string', () => {
		const result = nameCellRenderer({
			data: { name: 'Empty URL', url: '' as unknown as null },
		});
		expect(result).toBeInstanceOf(HTMLSpanElement);
		expect((result as HTMLSpanElement).textContent).toBe('Empty URL');
	});
});

describe('formatCount', () => {
	it('returns — for null', () => {
		expect(formatCount(null)).toBe('—');
	});

	it('returns number as string for counts under 1000', () => {
		expect(formatCount(0)).toBe('0');
		expect(formatCount(500)).toBe('500');
		expect(formatCount(999)).toBe('999');
	});

	it('formats thousands with K suffix', () => {
		expect(formatCount(1000)).toBe('1.0 K');
		expect(formatCount(1234)).toBe('1.2 K');
		expect(formatCount(5678)).toBe('5.7 K');
		expect(formatCount(999999)).toBe('1000.0 K');
	});

	it('formats millions with M suffix', () => {
		expect(formatCount(1000000)).toBe('1.0 M');
		expect(formatCount(1234567)).toBe('1.2 M');
		expect(formatCount(5678901)).toBe('5.7 M');
	});

	it('formats billions with B suffix', () => {
		expect(formatCount(1000000000)).toBe('1.0 B');
		expect(formatCount(2500000000)).toBe('2.5 B');
	});
});

describe('formatCountExact', () => {
	it('returns an empty string (so no tooltip opens) for null', () => {
		expect(formatCountExact(null)).toBe('');
	});

	it('formats small numbers without commas', () => {
		expect(formatCountExact(0)).toBe('0');
		expect(formatCountExact(999)).toBe('999');
	});

	it('formats thousands with commas', () => {
		expect(formatCountExact(1000)).toBe('1,000');
		expect(formatCountExact(1234567)).toBe('1,234,567');
	});

	it('formats millions with commas', () => {
		expect(formatCountExact(1000000)).toBe('1,000,000');
	});
});

describe('percentLikedValueGetter', () => {
	it('computes likes as a percentage of views', () => {
		expect(percentLikedValueGetter({ data: { viewCount: 1000, likeCount: 42 } })).toBeCloseTo(4.2);
	});

	it('returns null when views is 0', () => {
		expect(percentLikedValueGetter({ data: { viewCount: 0, likeCount: 5 } })).toBeNull();
	});

	it('returns null when views is null', () => {
		expect(percentLikedValueGetter({ data: { viewCount: null, likeCount: 5 } })).toBeNull();
	});

	it('returns null when likes is null', () => {
		expect(percentLikedValueGetter({ data: { viewCount: 1000, likeCount: null } })).toBeNull();
	});

	it('returns null when data is missing', () => {
		expect(percentLikedValueGetter({})).toBeNull();
	});

	it('returns 0 when likes is 0 but views is positive', () => {
		expect(percentLikedValueGetter({ data: { viewCount: 1000, likeCount: 0 } })).toBe(0);
	});
});

describe('formatPercentLiked', () => {
	it('formats to 1 decimal place', () => {
		expect(formatPercentLiked(4.2)).toBe('4.2%');
		expect(formatPercentLiked(4.234)).toBe('4.2%');
	});

	it('renders — for null', () => {
		expect(formatPercentLiked(null)).toBe('—');
	});

	it('formats 0 as 0.0%, not —', () => {
		expect(formatPercentLiked(0)).toBe('0.0%');
	});
});

describe('percentLikedTooltip', () => {
	it('shows the exact calculation with math symbols, 3 decimal places', () => {
		expect(percentLikedTooltip({ data: { viewCount: 1000, likeCount: 42 } })).toBe('42 ÷ 1,000 × 100 = 4.200%');
	});

	it('shows a no-views message when views is 0', () => {
		expect(percentLikedTooltip({ data: { viewCount: 0, likeCount: 5 } })).toBe('No views recorded');
	});

	it('shows a no-views message when views is null', () => {
		expect(percentLikedTooltip({ data: { viewCount: null, likeCount: 5 } })).toBe('No views recorded');
	});

	it('shows a no-views message when likes is null', () => {
		expect(percentLikedTooltip({ data: { viewCount: 1000, likeCount: null } })).toBe('No views recorded');
	});
});

describe('formatDateCompact', () => {
	it('returns — for null', () => {
		expect(formatDateCompact(null)).toBe('—');
	});

	it('returns — for empty string', () => {
		expect(formatDateCompact('')).toBe('—');
	});

	it('returns — for invalid date', () => {
		expect(formatDateCompact('not-a-date')).toBe('—');
	});

	it("formats date as MMM 'YY", () => {
		expect(formatDateCompact('2010-07-18T12:00:00Z')).toBe("Jul '10");
	});

	it('formats recent date correctly', () => {
		expect(formatDateCompact('2026-02-14T12:00:00Z')).toBe("Feb '26");
	});

	it('formats date with single-digit year', () => {
		expect(formatDateCompact('2005-03-15T12:00:00Z')).toBe("Mar '05");
	});
});

describe('formatPublishDate', () => {
	it('returns — for null', () => {
		expect(formatPublishDate(null)).toBe('—');
	});

	it('formats valid ISO date string', () => {
		expect(formatPublishDate('2026-01-15T12:00:00Z')).toMatch(/Jan 15, 2026/);
	});
});

describe('formatTags', () => {
	it('returns — for null', () => {
		expect(formatTags(null)).toBe('—');
	});

	it('returns — for empty array', () => {
		expect(formatTags([])).toBe('—');
	});

	it('formats single tag', () => {
		expect(formatTags(['technology'])).toBe('technology');
	});

	it('formats multiple tags comma-separated', () => {
		expect(formatTags(['tech', 'science', 'ai'])).toBe('tech, science, ai');
	});
});

describe('truncateDescription', () => {
	it('returns — for null', () => {
		expect(truncateDescription(null)).toBe('—');
	});

	it('returns — for empty string', () => {
		expect(truncateDescription('')).toBe('—');
	});

	it('returns full description if under max length', () => {
		expect(truncateDescription('Short description', 100)).toBe('Short description');
	});

	it('truncates description with ellipsis if over max length', () => {
		const long = 'A'.repeat(150);
		const result = truncateDescription(long, 100);
		expect(result).toBe('A'.repeat(100) + '...');
		expect(result.length).toBe(103);
	});

	it('uses default max length of 100', () => {
		const long = 'A'.repeat(150);
		const result = truncateDescription(long);
		expect(result).toBe('A'.repeat(100) + '...');
	});
});

describe('extractVideoIdFromUrl', () => {
	it('returns null for null url', () => {
		expect(extractVideoIdFromUrl(null)).toBeNull();
	});

	it('extracts ID from youtube.com/watch URL', () => {
		expect(extractVideoIdFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
		expect(extractVideoIdFromUrl('https://youtube.com/watch?v=abc123')).toBe('abc123');
		expect(extractVideoIdFromUrl('https://m.youtube.com/watch?v=xyz789')).toBe('xyz789');
	});

	it('extracts ID from youtu.be URL', () => {
		expect(extractVideoIdFromUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
		expect(extractVideoIdFromUrl('https://youtu.be/abc123')).toBe('abc123');
	});

	it('returns null for invalid URL', () => {
		expect(extractVideoIdFromUrl('not a url')).toBeNull();
	});

	it('returns null for non-YouTube URL', () => {
		expect(extractVideoIdFromUrl('https://example.com')).toBeNull();
	});

	it('returns null for YouTube URL without video ID', () => {
		expect(extractVideoIdFromUrl('https://www.youtube.com')).toBeNull();
		expect(extractVideoIdFromUrl('https://www.youtube.com/channel/UC123')).toBeNull();
	});
});

describe('itemCellRenderer', () => {
	it('returns empty string when data is missing', () => {
		expect(itemCellRenderer({ data: undefined })).toBe('');
	});

	it('renders container with thumbnail and title link', () => {
		const result = itemCellRenderer({
			data: { name: 'My Video', url: 'https://youtube.com/watch?v=abc123' },
		}) as HTMLElement;

		expect(result).toBeInstanceOf(HTMLDivElement);
		expect(result.className).toContain('flex');
		expect(result.className).toContain('items-center');

		const img = result.querySelector('img');
		expect(img).toBeTruthy();
		expect(img?.src).toBe('https://i.ytimg.com/vi/abc123/default.jpg');
		expect(img?.className).toContain('w-10');

		const link = result.querySelector('a');
		expect(link).toBeTruthy();
		expect(link?.href).toBe('https://youtube.com/watch?v=abc123');
		expect(link?.textContent).toBe('My Video');
		expect(link?.target).toBe('_blank');
	});

	it('renders without thumbnail when no video ID', () => {
		const result = itemCellRenderer({
			data: { name: 'No URL', url: null },
		}) as HTMLElement;

		expect(result.querySelector('img')).toBeNull();
		const span = result.querySelector('span');
		expect(span?.textContent).toBe('No URL');
	});

	it('adds thumbnail-mobile-hide class to thumbnail', () => {
		const result = itemCellRenderer({
			data: { name: 'Video with thumbnail', url: 'https://youtube.com/watch?v=test123' },
		}) as HTMLElement;

		const img = result.querySelector('img');
		expect(img?.className).toContain('thumbnail-mobile-hide');
	});
});

describe('typeCellRenderer', () => {
	it('returns empty string when data is missing', () => {
		expect(typeCellRenderer({ data: undefined })).toBe('');
	});

	it('renders YouTube play icon with full centering', () => {
		const result = typeCellRenderer({
			data: { contentType: 'youtube_video' },
		}) as HTMLElement;

		expect(result).toBeInstanceOf(HTMLDivElement);
		expect(result.className).toContain('flex');
		expect(result.className).toContain('items-center');
		expect(result.className).toContain('justify-center');
		expect(result.className).toContain('h-full');
		expect(result.className).toContain('w-full');

		const svg = result.querySelector('svg');
		expect(svg).toBeTruthy();
		expect(svg?.getAttribute('fill')).toBe('#FF0000');
		expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');

		const path = svg?.querySelector('path');
		expect(path).toBeTruthy();
	});

	it('includes sr-only span with content type for filter matching', () => {
		const result = typeCellRenderer({
			data: { contentType: 'YOUTUBE' },
		}) as HTMLElement;

		const hidden = result.querySelector('.sr-only');
		expect(hidden).toBeTruthy();
		expect(hidden?.textContent).toBe('YOUTUBE');
	});

	// Gap #12 in the UI gap audit: a CLAIM row rendered with the YouTube play
	// icon, same as a YOUTUBE row — nothing distinguished them in the grid.
	it('renders a different, theme-token-coloured icon for a CLAIM row (not the YouTube icon)', () => {
		const claim = typeCellRenderer({ data: { contentType: 'CLAIM' } }) as HTMLElement;
		const youtube = typeCellRenderer({ data: { contentType: 'YOUTUBE' } }) as HTMLElement;

		const claimSvg = claim.querySelector('svg');
		const claimPath = claimSvg?.querySelector('path')?.getAttribute('d');
		const youtubePath = youtube.querySelector('svg')?.querySelector('path')?.getAttribute('d');

		expect(claimSvg?.getAttribute('fill')).toBe('none');
		expect(claimSvg?.getAttribute('stroke')).toBe('var(--color-muted-foreground)');
		expect(claimPath).toBeTruthy();
		expect(claimPath).not.toBe(youtubePath);
	});

	it('shows the Bible passage icon (not the YouTube icon) for BIBLE_PASSAGE', () => {
		const result = typeCellRenderer({
			data: { contentType: 'BIBLE_PASSAGE' },
		}) as HTMLElement;

		expect(result.querySelector('svg[data-icon="bible-passage"]')).toBeTruthy();
		expect(result.querySelector('svg[fill="#FF0000"]')).toBeNull();
		expect(result.querySelector('.sr-only')?.textContent).toBe('Bible Passage');
	});
});

describe('headerMinWidth', () => {
	it('returns a positive integer', () => {
		const result = headerMinWidth('Type');
		expect(result).toBeGreaterThan(0);
		expect(Number.isInteger(result)).toBe(true);
	});

	it('longer names produce wider minimums', () => {
		const short = headerMinWidth('Date');
		const long = headerMinWidth('Description');
		expect(long).toBeGreaterThan(short);
	});

	it('filter icon adds width', () => {
		const withFilter = headerMinWidth('Item', true);
		const withoutFilter = headerMinWidth('Item', false);
		expect(withFilter).toBeGreaterThan(withoutFilter);
	});

	it('defaults hasFilter to true', () => {
		const defaultCall = headerMinWidth('Type');
		const explicitTrue = headerMinWidth('Type', true);
		expect(defaultCall).toBe(explicitTrue);
	});

	it('empty name still has space for icons and padding', () => {
		const result = headerMinWidth('');
		expect(result).toBeGreaterThan(0);
	});

	it('produces consistent results for known headers', () => {
		// These are the actual column headers — verify they produce reasonable widths
		const headers = ['Type', 'Length', 'Views', 'Likes', 'Date', 'Channel', 'Tags'];
		for (const name of headers) {
			const width = headerMinWidth(name);
			// Must be wide enough for text + icons (at least 60px) and not absurdly large
			expect(width).toBeGreaterThanOrEqual(60);
			expect(width).toBeLessThanOrEqual(200);
		}
	});

	it('width scales linearly with character count', () => {
		const w4 = headerMinWidth('AAAA');
		const w8 = headerMinWidth('AAAAAAAA');
		// 4 extra chars at ~0.55em * 14px = ~30.8px difference
		const diff = w8 - w4;
		expect(diff).toBeGreaterThanOrEqual(28);
		expect(diff).toBeLessThanOrEqual(34);
	});
});

describe('formatDateTime', () => {
	it('returns dash for invalid date', () => {
		expect(formatDateTime('not-a-date')).toBe('—');
	});

	it('includes both date and time-of-day', () => {
		// Midday UTC to avoid local-timezone date shifting in CI (see CLAUDE.md gotcha)
		const result = formatDateTime('2026-09-03T12:15:00Z');
		expect(result).toMatch(/2026/);
		expect(result).toMatch(/:\d{2}/); // has a time component, unlike formatDate
	});
});

describe('getSourceDataCooldown', () => {
	it('is active immediately after an update', () => {
		const now = new Date('2026-09-03T12:00:00Z');
		const result = getSourceDataCooldown('2026-09-03T12:00:00Z', now);
		expect(result.active).toBe(true);
		expect(result.remainingMs).toBe(SOURCE_DATA_COOLDOWN_MS);
	});

	it('is still active partway through the window', () => {
		const now = new Date('2026-09-03T14:00:00Z'); // 2h after update
		const result = getSourceDataCooldown('2026-09-03T12:00:00Z', now);
		expect(result.active).toBe(true);
		expect(result.remainingMs).toBe(SOURCE_DATA_COOLDOWN_MS - 2 * 60 * 60 * 1000);
	});

	it('is inactive exactly at the TTL boundary', () => {
		const now = new Date('2026-09-03T18:00:00Z'); // exactly 6h after update
		const result = getSourceDataCooldown('2026-09-03T12:00:00Z', now);
		expect(result.active).toBe(false);
		expect(result.remainingMs).toBe(0);
	});

	it('is inactive well past the window', () => {
		const now = new Date('2026-09-04T12:00:00Z'); // 24h after update
		const result = getSourceDataCooldown('2026-09-03T12:00:00Z', now);
		expect(result.active).toBe(false);
		expect(result.remainingMs).toBe(0);
	});

	it('returns inactive for an invalid updatedAt', () => {
		const result = getSourceDataCooldown('not-a-date');
		expect(result.active).toBe(false);
		expect(result.remainingMs).toBe(0);
	});
});

describe('formatRemainingTime', () => {
	it('formats hours and minutes', () => {
		expect(formatRemainingTime(5 * 60 * 60 * 1000 + 42 * 60 * 1000)).toBe('5h 42m');
	});

	it('formats whole hours with no minutes remainder', () => {
		expect(formatRemainingTime(3 * 60 * 60 * 1000)).toBe('3h');
	});

	it('formats minutes only under an hour', () => {
		expect(formatRemainingTime(42 * 60 * 1000)).toBe('42m');
	});

	it('rounds up so it never reads 0m while time remains', () => {
		expect(formatRemainingTime(30_000)).toBe('1m'); // 30 seconds left
	});

	it('returns 0m for zero or negative durations', () => {
		expect(formatRemainingTime(0)).toBe('0m');
		expect(formatRemainingTime(-1000)).toBe('0m');
	});
});

describe('categoryCellRenderer', () => {
	it('renders span with label text when primaryCategory is present', () => {
		const result = categoryCellRenderer({
			data: {
				primaryCategory: {
					label: 'Science',
					description: 'Natural science',
					wikidataQid: 'Q336',
				},
			},
		});

		expect(result).toBeInstanceOf(HTMLDivElement);
		const span = result.querySelector('span');
		expect(span).toBeTruthy();
		expect(span?.textContent).toBe('Science');
	});

	it('renders "+" icon when primaryCategory is null', () => {
		const result = categoryCellRenderer({
			data: { primaryCategory: null },
		});

		expect(result).toBeInstanceOf(HTMLDivElement);
		const span = result.querySelector('span');
		expect(span).toBeTruthy();
		expect(span?.textContent).toBe('+');
		// JSDOM normalizes hex colors to rgb() format
		expect(span?.style.color).toBe('rgb(163, 163, 163)');
	});

	it('sets title attribute to description when present', () => {
		const result = categoryCellRenderer({
			data: {
				primaryCategory: {
					label: 'Physics',
					description: 'Study of matter and energy',
					wikidataQid: 'Q413',
				},
			},
		});

		const span = result.querySelector('span');
		expect(span?.title).toBe('Study of matter and energy');
	});

	it('sets title attribute to wikidataQid when description is null', () => {
		const result = categoryCellRenderer({
			data: {
				primaryCategory: {
					label: 'Chemistry',
					description: null,
					wikidataQid: 'Q2329',
				},
			},
		});

		const span = result.querySelector('span');
		expect(span?.title).toBe('Q2329');
	});

	it('renders "+" when data is undefined', () => {
		const result = categoryCellRenderer({ data: undefined });

		const span = result.querySelector('span');
		expect(span?.textContent).toBe('+');
	});

	it('has cursor pointer style', () => {
		const result = categoryCellRenderer({
			data: { primaryCategory: null },
		});

		expect(result.style.cursor).toBe('pointer');
	});

	it('has full height and width for cell fill', () => {
		const result = categoryCellRenderer({
			data: { primaryCategory: null },
		});

		expect(result.style.height).toBe('100%');
		expect(result.style.width).toBe('100%');
	});

	it('renders label as a link to wikipediaUrl when present', () => {
		const result = categoryCellRenderer({
			data: {
				primaryCategory: {
					label: 'Science',
					description: 'Natural science',
					wikidataQid: 'Q336',
					wikipediaUrl: 'https://en.wikipedia.org/wiki/Science',
				},
			},
		});

		const link = result.querySelector('a');
		expect(link).toBeTruthy();
		expect(link?.textContent).toBe('Science');
		expect(link?.href).toBe('https://en.wikipedia.org/wiki/Science');
		expect(link?.target).toBe('_blank');
		expect(link?.rel).toBe('noopener noreferrer');
	});

	it('renders plain span (no link) when wikipediaUrl is absent', () => {
		const result = categoryCellRenderer({
			data: {
				primaryCategory: {
					label: 'Science',
					description: 'Natural science',
					wikidataQid: 'Q336',
					wikipediaUrl: null,
				},
			},
		});

		expect(result.querySelector('a')).toBeNull();
		expect(result.querySelector('span')?.textContent).toBe('Science');
	});
});
