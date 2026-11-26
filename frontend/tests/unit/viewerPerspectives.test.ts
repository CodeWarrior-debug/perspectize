import { describe, it, expect } from 'vitest';
import { groupPerspectivesByContent } from '#lib/queries/perspectives/viewerPerspectives.js';
import type { PerspectiveItem } from '#lib/queries/perspectives/index.js';

function row(id: string, contentID: string | null, updatedAt: string): PerspectiveItem {
	return {
		id,
		userID: '42',
		contentID,
		quality: null,
		agreement: null,
		importance: null,
		confidence: null,
		like: null,
		review: null,
		privacy: 'PUBLIC',
		description: null,
		primaryPerspectiveID: null,
		relatedPerspectiveIDs: null,
		customFields: null,
		feelings: null,
		createdAt: '2026-01-01T00:00:00Z',
		updatedAt,
	};
}

describe('groupPerspectivesByContent', () => {
	it('keeps every perspective on an item (two sharing slots), latest first', () => {
		const map = groupPerspectivesByContent([
			row('a', '10', '2026-01-01T00:00:00Z'),
			row('b', '10', '2026-03-01T00:00:00Z'),
			row('c', '11', '2026-02-01T00:00:00Z'),
		]);
		expect(map.get('10')?.map((p) => p.id)).toEqual(['b', 'a']);
		expect(map.get('11')?.map((p) => p.id)).toEqual(['c']);
	});

	it('skips rows with no content id and returns an empty map for no rows', () => {
		expect(groupPerspectivesByContent([row('x', null, '2026-01-01T00:00:00Z')]).size).toBe(0);
		expect(groupPerspectivesByContent([]).size).toBe(0);
	});
});
