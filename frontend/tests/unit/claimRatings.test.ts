import { describe, expect, it } from 'vitest';
import { perspectiveRating } from '$lib/utils/grid-config';
import { formatRatingScore } from '$lib/utils/formatting';
import { activityItemCellRenderer } from '$lib/utils/activityItemCellRenderer';

describe('perspectiveRating', () => {
	const byContentId = new Map([
		['13', { quality: 7000, importance: 4000, agreement: null }],
	]);

	it('returns the viewer rating for the row content id', () => {
		expect(perspectiveRating(byContentId, 13, 'quality')).toBe(7000);
		expect(perspectiveRating(byContentId, '13', 'importance')).toBe(4000);
	});

	it('is null when the viewer has rated that field as empty', () => {
		expect(perspectiveRating(byContentId, 13, 'agreement')).toBeNull();
	});

	it('is null when the viewer has no perspective on the row', () => {
		expect(perspectiveRating(byContentId, 99, 'quality')).toBeNull();
	});

	it('is null when there is no perspective map or no row id', () => {
		expect(perspectiveRating(undefined, 13, 'quality')).toBeNull();
		expect(perspectiveRating(byContentId, undefined, 'quality')).toBeNull();
	});
});

describe('formatRatingScore', () => {
	it('shows a 0-10000 rating as a 0-100 score', () => {
		expect(formatRatingScore(7000)).toBe('70');
		expect(formatRatingScore(0)).toBe('0');
		expect(formatRatingScore(10000)).toBe('100');
	});

	it('shows a dash when there is no rating', () => {
		expect(formatRatingScore(null)).toBe('—');
		expect(formatRatingScore(undefined)).toBe('—');
	});
});

describe('activityItemCellRenderer for claims', () => {
	const params = (contentType: string) => ({
		data: { id: 189, name: 'The glove did not fit O.J. Simpson', url: null, contentType },
		context: { onOpenDetails: () => {} },
	});

	it('draws no thumbnail for a claim, only the title', () => {
		const cell = activityItemCellRenderer(params('CLAIM') as never) as HTMLElement;
		expect(cell.querySelector('[data-testid="item-thumb"]')).toBeNull();
		expect(cell.querySelector('[data-testid="item-title"]')?.textContent).toBe(
			'The glove did not fit O.J. Simpson',
		);
	});

	it('keeps the thumbnail slot for a YouTube video', () => {
		const cell = activityItemCellRenderer(params('YOUTUBE_VIDEO') as never) as HTMLElement;
		expect(cell.querySelector('[data-testid="item-thumb"]')).not.toBeNull();
	});
});
