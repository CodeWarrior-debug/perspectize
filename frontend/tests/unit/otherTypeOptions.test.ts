import { describe, it, expect } from 'vitest';
import { otherTypeOptionsWhenOne } from '#lib/utils/gridUrlState.js';
import { CONTENT_TYPE_OPTIONS } from '#lib/utils/grid-config.js';

describe('otherTypeOptionsWhenOne', () => {
	it('offers no switches without a type filter', () => {
		expect(otherTypeOptionsWhenOne({})).toEqual([]);
	});

	it('offers no switches for an empty type value', () => {
		expect(otherTypeOptionsWhenOne({ type: '' })).toEqual([]);
	});

	it('offers every other type when exactly one is selected', () => {
		const values = otherTypeOptionsWhenOne({ type: 'youtube_video' }).map((o) => o.value);
		expect(values).not.toContain('youtube_video');
		expect(values).toHaveLength(CONTENT_TYPE_OPTIONS.length - 1);
	});

	it('offers no switches when several types are selected', () => {
		expect(otherTypeOptionsWhenOne({ type: 'youtube_video,movie' })).toEqual([]);
	});

	it('matches the selected type case-insensitively and ignores spacing', () => {
		const values = otherTypeOptionsWhenOne({ type: ' MOVIE ' }).map((o) => o.value);
		expect(values).not.toContain('movie');
		expect(values).toContain('youtube_video');
	});
});
