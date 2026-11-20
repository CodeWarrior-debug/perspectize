import { describe, expect, it } from 'vitest';
import { queryKeys } from '#lib/queries/keys.js';

describe('queryKeys factory', () => {
	describe('root level', () => {
		it('all returns base app key', () => {
			expect(queryKeys.all).toEqual(['app']);
		});
	});

	describe('content namespace', () => {
		it('all() returns hierarchical prefix', () => {
			expect(queryKeys.content.all()).toEqual(['app', 'content']);
		});

		it('lists() returns list prefix', () => {
			expect(queryKeys.content.lists()).toEqual(['app', 'content', 'list']);
		});

		it('list() with filters returns key with filters object', () => {
			const result = queryKeys.content.list({
				sortBy: 'UPDATED_AT',
				sortOrder: 'DESC',
				search: 'test',
				first: 10,
				after: null,
			});

			expect(result).toEqual([
				'app',
				'content',
				'list',
				{
					sortBy: 'UPDATED_AT',
					sortOrder: 'DESC',
					search: 'test',
					first: 10,
					after: null,
				},
			]);
		});

		it('list() with partial filters includes only provided filters', () => {
			const result = queryKeys.content.list({ sortBy: 'UPDATED_AT' });

			expect(result).toEqual(['app', 'content', 'list', { sortBy: 'UPDATED_AT' }]);
		});

		it('details() returns detail prefix', () => {
			expect(queryKeys.content.details()).toEqual(['app', 'content', 'detail']);
		});

		it('detail() returns key with id', () => {
			expect(queryKeys.content.detail('123')).toEqual(['app', 'content', 'detail', '123']);
		});
	});

	describe('users namespace', () => {
		it('all() returns hierarchical prefix', () => {
			expect(queryKeys.users.all()).toEqual(['app', 'users']);
		});

		it('lists() returns list prefix', () => {
			expect(queryKeys.users.lists()).toEqual(['app', 'users', 'list']);
		});

		it('list() returns list key', () => {
			expect(queryKeys.users.list()).toEqual(['app', 'users', 'list']);
		});

		it('details() returns detail prefix', () => {
			expect(queryKeys.users.details()).toEqual(['app', 'users', 'detail']);
		});

		it('detail() returns key with id', () => {
			expect(queryKeys.users.detail('user-456')).toEqual(['app', 'users', 'detail', 'user-456']);
		});
	});

	describe('hierarchical prefix matching', () => {
		it('content.all() matches all content queries', () => {
			const contentPrefix = queryKeys.content.all();

			// Verify that list and detail keys start with content.all()
			expect(queryKeys.content.lists()).toEqual([...contentPrefix, 'list']);
			expect(queryKeys.content.details()).toEqual([...contentPrefix, 'detail']);
		});

		it('content.lists() matches all content list queries', () => {
			const listsPrefix = queryKeys.content.lists();

			// Verify that specific list queries start with lists()
			const specificList = queryKeys.content.list({ sortBy: 'UPDATED_AT' });
			expect(specificList.slice(0, listsPrefix.length)).toEqual(listsPrefix);
		});

		it('users.all() matches all user queries', () => {
			const usersPrefix = queryKeys.users.all();

			// Verify that list and detail keys start with users.all()
			expect(queryKeys.users.lists()).toEqual([...usersPrefix, 'list']);
			expect(queryKeys.users.details()).toEqual([...usersPrefix, 'detail']);
		});
	});
});
