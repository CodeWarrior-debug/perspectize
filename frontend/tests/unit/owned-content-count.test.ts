import { describe, it, expect, vi, beforeEach } from 'vitest';

const request = vi.hoisted(() => vi.fn());
vi.mock('#lib/queries/client.js', () => ({ graphqlRequest: request }));

import { ownedContentCountQuery } from '#lib/queries/content/useOwnedContentCount.js';
import { isLibraryListKey } from '#lib/queries/content/contentCreatedEviction.js';
import { makeClient } from '../helpers/queryBudget';

const me = { id: 7, username: 'dana' };

function respondWithAdders(...ids: string[]) {
	request.mockResolvedValue({ content: { items: ids.map((addedByUserID, i) => ({ id: String(i), addedByUserID })) } });
}

async function count() {
	const options = ownedContentCountQuery(me);
	const data = await makeClient().fetchQuery(options);
	return options.select(data);
}

describe('ownedContentCountQuery', () => {
	beforeEach(() => request.mockReset());

	it('asks the server for rows added by this user, not the newest rows of anyone', async () => {
		respondWithAdders('7');
		await count();
		expect(request).toHaveBeenCalledTimes(1);
		expect(request.mock.calls[0][1]).toMatchObject({ filter: { addedByUsername: 'dana' } });
	});

	it('counts only exact id matches, since the server matches usernames by substring', async () => {
		respondWithAdders('7', '8', '7');
		expect(await count()).toBe(2);
	});

	it('is disabled without a user', () => {
		expect(ownedContentCountQuery(null).enabled).toBe(false);
	});

	it('changes its key with the user and stays out of the library lists', () => {
		const key = ownedContentCountQuery(me).queryKey;
		expect(key).not.toEqual(ownedContentCountQuery({ id: 8, username: 'dana' }).queryKey);
		expect(key).not.toEqual(ownedContentCountQuery({ id: 7, username: 'dee' }).queryKey);
		expect(isLibraryListKey(key)).toBe(false);
	});
});
