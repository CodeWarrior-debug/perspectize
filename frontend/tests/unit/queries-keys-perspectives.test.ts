import { describe, expect, it } from 'vitest';
import { queryKeys } from '$lib/queries/keys';

describe('queryKeys.perspectives namespace', () => {
	describe('all()', () => {
		it('returns base perspectives key', () => {
			expect(queryKeys.perspectives.all()).toEqual(['app', 'perspectives']);
		});
	});

	describe('lists()', () => {
		it('returns perspectives list prefix', () => {
			expect(queryKeys.perspectives.lists()).toEqual(['app', 'perspectives', 'list']);
		});

		it('builds on perspectives.all()', () => {
			const allKey = queryKeys.perspectives.all();
			expect(queryKeys.perspectives.lists()).toEqual([...allKey, 'list']);
		});
	});

	describe('listByUser(userId)', () => {
		it('returns key with a byUser branch tag and userId object', () => {
			const result = queryKeys.perspectives.listByUser(42);
			expect(result).toEqual(['app', 'perspectives', 'list', 'byUser', { userId: 42 }]);
		});

		it('builds on perspectives.byUserLists()', () => {
			const branchKey = queryKeys.perspectives.byUserLists();
			const result = queryKeys.perspectives.listByUser(123);
			expect(result).toEqual([...branchKey, { userId: 123 }]);
		});

		it('handles different user IDs independently', () => {
			const user1 = queryKeys.perspectives.listByUser(1);
			const user2 = queryKeys.perspectives.listByUser(2);
			expect(user1).toEqual(['app', 'perspectives', 'list', 'byUser', { userId: 1 }]);
			expect(user2).toEqual(['app', 'perspectives', 'list', 'byUser', { userId: 2 }]);
			expect(user1).not.toEqual(user2);
		});
	});

	describe('listByContent(contentId)', () => {
		it('returns key with a byContent branch tag and contentId object', () => {
			const result = queryKeys.perspectives.listByContent(10);
			expect(result).toEqual(['app', 'perspectives', 'list', 'byContent', { contentId: 10 }]);
		});

		it('builds on perspectives.byContentLists()', () => {
			const branchKey = queryKeys.perspectives.byContentLists();
			const result = queryKeys.perspectives.listByContent(11);
			expect(result).toEqual([...branchKey, { contentId: 11 }]);
		});
	});

	describe('activityFeed(includePrivate)', () => {
		it('keeps its existing key shape (unchanged by the byUser/byContent split)', () => {
			expect(queryKeys.perspectives.activityFeed(false)).toEqual([
				'app',
				'perspectives',
				'list',
				'activityFeed',
				{ includePrivate: false },
			]);
			expect(queryKeys.perspectives.activityFeed(true)).toEqual([
				'app',
				'perspectives',
				'list',
				'activityFeed',
				{ includePrivate: true },
			]);
		});

		it('builds on perspectives.activityFeeds()', () => {
			const branchKey = queryKeys.perspectives.activityFeeds();
			expect(queryKeys.perspectives.activityFeed(true)).toEqual([...branchKey, { includePrivate: true }]);
		});
	});

	describe('details()', () => {
		it('returns perspectives detail prefix', () => {
			expect(queryKeys.perspectives.details()).toEqual(['app', 'perspectives', 'detail']);
		});

		it('builds on perspectives.all()', () => {
			const allKey = queryKeys.perspectives.all();
			expect(queryKeys.perspectives.details()).toEqual([...allKey, 'detail']);
		});
	});

	describe('detail(id)', () => {
		it('returns key with perspective id', () => {
			const result = queryKeys.perspectives.detail('perspective-123');
			expect(result).toEqual(['app', 'perspectives', 'detail', 'perspective-123']);
		});

		it('builds on perspectives.details()', () => {
			const detailsKey = queryKeys.perspectives.details();
			const result = queryKeys.perspectives.detail('456');
			expect(result).toEqual([...detailsKey, '456']);
		});

		it('handles different perspective IDs independently', () => {
			const p1 = queryKeys.perspectives.detail('id-1');
			const p2 = queryKeys.perspectives.detail('id-2');
			expect(p1).toEqual(['app', 'perspectives', 'detail', 'id-1']);
			expect(p2).toEqual(['app', 'perspectives', 'detail', 'id-2']);
			expect(p1).not.toEqual(p2);
		});
	});

	describe('hierarchical prefix matching', () => {
		it('listByUser keys start with lists() prefix', () => {
			const listsPrefix = queryKeys.perspectives.lists();
			const userKey = queryKeys.perspectives.listByUser(99);
			expect(userKey.slice(0, listsPrefix.length)).toEqual(listsPrefix);
		});

		it('detail keys start with details() prefix', () => {
			const detailsPrefix = queryKeys.perspectives.details();
			const singleDetail = queryKeys.perspectives.detail('test-id');
			expect(singleDetail.slice(0, detailsPrefix.length)).toEqual(detailsPrefix);
		});

		it('all perspectives keys start with perspectives.all() prefix', () => {
			const perspectivesPrefix = queryKeys.perspectives.all();
			expect(queryKeys.perspectives.lists()[0]).toEqual(perspectivesPrefix[0]);
			expect(queryKeys.perspectives.lists()[1]).toEqual(perspectivesPrefix[1]);
		});
	});

	describe('branch non-overlap (regression guard for gap #3 — the prefix-match cache-corruption bug)', () => {
		// Two keys "overlap" if one is a prefix of the other — that's exactly what
		// TanStack Query's default (non-exact) queryKey matching treats as "the same
		// cache entry (or a match under this filter)". Before the fix, listByUser,
		// listByContent and activityFeed all sat directly under lists() with nothing
		// distinguishing their branches, so a filter scoped to one matched all three.
		function isPrefixOf(prefix: readonly unknown[], key: readonly unknown[]): boolean {
			if (prefix.length > key.length) return false;
			return prefix.every((part, i) => JSON.stringify(part) === JSON.stringify(key[i]));
		}

		it('byUserLists(), byContentLists() and activityFeeds() are mutually non-overlapping branches', () => {
			const branches = [
				queryKeys.perspectives.byUserLists(),
				queryKeys.perspectives.byContentLists(),
				queryKeys.perspectives.activityFeeds(),
			];
			for (let i = 0; i < branches.length; i++) {
				for (let j = 0; j < branches.length; j++) {
					if (i === j) continue;
					expect(isPrefixOf(branches[i], branches[j])).toBe(false);
				}
			}
		});

		it('a listByUser key does not fall under byContentLists() or activityFeeds()', () => {
			const userKey = queryKeys.perspectives.listByUser(1);
			expect(isPrefixOf(queryKeys.perspectives.byContentLists(), userKey)).toBe(false);
			expect(isPrefixOf(queryKeys.perspectives.activityFeeds(), userKey)).toBe(false);
		});

		it('a listByContent key does not fall under byUserLists() or activityFeeds()', () => {
			const contentKey = queryKeys.perspectives.listByContent(1);
			expect(isPrefixOf(queryKeys.perspectives.byUserLists(), contentKey)).toBe(false);
			expect(isPrefixOf(queryKeys.perspectives.activityFeeds(), contentKey)).toBe(false);
		});

		it('an activityFeed key does not fall under byUserLists() or byContentLists()', () => {
			const feedKey = queryKeys.perspectives.activityFeed(true);
			expect(isPrefixOf(queryKeys.perspectives.byUserLists(), feedKey)).toBe(false);
			expect(isPrefixOf(queryKeys.perspectives.byContentLists(), feedKey)).toBe(false);
		});

		it('every branch still starts with the lists() umbrella (kept for shape-agnostic invalidation)', () => {
			const listsPrefix = queryKeys.perspectives.lists();
			expect(isPrefixOf(listsPrefix, queryKeys.perspectives.listByUser(1))).toBe(true);
			expect(isPrefixOf(listsPrefix, queryKeys.perspectives.listByContent(1))).toBe(true);
			expect(isPrefixOf(listsPrefix, queryKeys.perspectives.activityFeed(true))).toBe(true);
		});
	});

	describe('type safety (as const)', () => {
		it('returns readonly arrays', () => {
			const key = queryKeys.perspectives.all();
			expect(Array.isArray(key)).toBe(true);
		});

		it('listByUser returns readonly array with object as its last element', () => {
			const key = queryKeys.perspectives.listByUser(1);
			expect(Array.isArray(key)).toBe(true);
			expect(typeof key[4]).toBe('object');
		});
	});
});
