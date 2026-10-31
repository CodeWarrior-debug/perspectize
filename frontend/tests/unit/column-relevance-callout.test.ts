import { describe, it, expect } from 'vitest';
import { showColumnRelevanceCallout } from '$lib/utils/grid-config';

describe('showColumnRelevanceCallout', () => {
	it('shows with no type filter', () => {
		expect(showColumnRelevanceCallout(undefined)).toBe(true);
		expect(showColumnRelevanceCallout('')).toBe(true);
		expect(showColumnRelevanceCallout(' , ')).toBe(true);
	});

	it('shows for two or more types', () => {
		expect(showColumnRelevanceCallout('youtube_video,movie')).toBe(true);
		expect(showColumnRelevanceCallout('youtube_video, movie ,bible_passage')).toBe(true);
	});

	it('hides for exactly one type, whatever its case or repeats', () => {
		expect(showColumnRelevanceCallout('movie')).toBe(false);
		expect(showColumnRelevanceCallout('YouTube_Video')).toBe(false);
		expect(showColumnRelevanceCallout('movie,movie')).toBe(false);
	});
});
