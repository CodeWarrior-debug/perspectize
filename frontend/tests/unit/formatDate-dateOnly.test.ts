import { describe, it, expect } from 'vitest';
import { dateValueFormatter, formatDate, formatPublishDate } from '#lib/utils/formatting.js';
import { webPublishedFilterValueGetter, formatWebPublished } from '#lib/utils/webPageFormatting.js';

// A date-only string is a calendar date, not a UTC instant. '2017-06-12' is Jun 12 in every timezone;
// parsed as UTC midnight it reads Jun 11 in US timezones. Full ISO timestamps keep their instant.

describe('date-only strings render as their own calendar date', () => {
	it('formatDate shows the stated day, not the day before', () => {
		expect(formatDate('2017-06-12')).toBe('Jun 12, 2017');
	});

	it('formatPublishDate (the Published cell and tile) shows the stated day', () => {
		expect(formatPublishDate('2017-06-12')).toBe('Jun 12, 2017');
		expect(formatWebPublished('2017-06-12')).toBe('Jun 12, 2017');
	});

	it('dateValueFormatter (AG Grid date columns) shows the stated day', () => {
		expect(dateValueFormatter({ value: '2017-06-12' })).toBe('Jun 12, 2017');
	});

	it('the Published date filter compares against the same calendar day', () => {
		const value = webPublishedFilterValueGetter({
			data: { url: null, webPage: { publishedAt: '2017-06-12' } } as never,
		});
		expect(value).toEqual(new Date(2017, 5, 12));
	});
});

describe('full ISO timestamps are unchanged', () => {
	it('a midday UTC timestamp still formats as its own day in any timezone', () => {
		expect(formatDate('2017-06-12T12:00:00Z')).toBe('Jun 12, 2017');
	});
});
