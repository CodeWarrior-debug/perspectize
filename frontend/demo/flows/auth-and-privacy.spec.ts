import type { APIRequestContext } from '@playwright/test';
import { test, expect, activityRow, type Persona } from '../fixtures';

// Regression flows that need real, multi-user auth — previously only
// checkable by hand with several Clerk accounts. e2e project only (no video).

const GRAPHQL_URL = process.env.DEMO_GRAPHQL_URL ?? 'http://localhost:8080/graphql';

async function gql<T>(
	request: APIRequestContext,
	persona: Persona | null,
	query: string,
	variables: Record<string, unknown> = {},
): Promise<T> {
	const res = await request.post(GRAPHQL_URL, {
		headers: persona ? { Authorization: `Bearer demo.${persona}` } : {},
		data: { query, variables },
	});
	expect(res.ok()).toBeTruthy();
	const body = await res.json();
	expect(body.errors, JSON.stringify(body.errors)).toBeUndefined();
	return body.data as T;
}

async function contentIdByName(request: APIRequestContext, name: string): Promise<string> {
	const data = await gql<{ content: { items: { id: string; name: string }[] } }>(
		request,
		'alice',
		'query { content(first: 50) { items { id name } } }',
	);
	const item = data.content.items.find((c) => c.name === name);
	expect(item, `seeded content "${name}"`).toBeDefined();
	return item!.id;
}

test.describe('auth', () => {
	test('signed-out visitors get the guest landing, not data', async ({ page, tour }) => {
		await tour.start({ persona: null });
		await expect(page.getByRole('region', { name: 'Perspectize' })).toBeVisible();
		await expect(page.locator('.ag-row')).toHaveCount(0);
	});

	test('switching persona swaps identity and data', async ({ page, tour }) => {
		await tour.start({ persona: 'alice' });
		await expect(page.getByTestId('demo-banner')).toContainText('Alice');
		await expect(activityRow(page, 'But what is a neural network?')).toBeVisible();

		await page.getByTestId('demo-user-menu').click();
		await page.getByTestId('demo-persona-ben').click();
		await expect(page.getByTestId('demo-banner')).toContainText('Ben');
		await expect(page.getByTestId('demo-user-menu')).toHaveText('B');

		await page.getByTestId('demo-user-menu').click();
		await page.getByTestId('demo-sign-out').click();
		await expect(page.getByRole('region', { name: 'Perspectize' })).toBeVisible();
	});

	test('the API rejects anonymous and unknown-persona callers for me', async ({ request }) => {
		const cases: Record<string, string>[] = [
			{},
			{ Authorization: 'Bearer demo.mallory' },
			{ Authorization: 'Bearer demo.' },
		];
		for (const headers of cases) {
			const res = await request.post(GRAPHQL_URL, { headers, data: { query: '{ me { id } }' } });
			const body = await res.json();
			expect(body.data?.me ?? null).toBeNull();
		}
		const me = await gql<{ me: { username: string; role: string } }>(request, 'carmen', '{ me { username role } }');
		expect(me.me).toEqual({ username: 'carmen_admin', role: 'ADMIN' });
	});
});

test.describe('perspective privacy', () => {
	const TITLE = 'Do schools kill creativity? | Sir Ken Robinson | TED';
	const PERSPECTIVES = `query ($contentID: IntID) {
		perspectives(filter: { contentID: $contentID }, first: 50) { items { userID privacy review } }
	}`;

	test('a private perspective is visible to its owner and hidden from everyone else', async ({ request }) => {
		const contentID = await contentIdByName(request, TITLE);
		type Result = { perspectives: { items: { userID: string; privacy: string; review: string | null }[] } };

		const asAlice = await gql<Result>(request, 'alice', PERSPECTIVES, { contentID });
		expect(asAlice.perspectives.items.some((p) => p.privacy === 'PRIVATE')).toBe(true);

		for (const viewer of ['ben', 'carmen', null] as const) {
			const data = await gql<Result>(request, viewer, PERSPECTIVES, { contentID });
			expect(
				data.perspectives.items.filter((p) => p.privacy === 'PRIVATE'),
				`private rows leaked to ${viewer ?? 'anonymous'}`,
			).toEqual([]);
		}
	});
});

test.describe('messaging', () => {
	test('seeded thread shows unread messages for both participants', async ({ page, tour }) => {
		for (const persona of ['alice', 'ben'] as const) {
			await tour.start({ persona });
			const launcher = page.getByRole('button', { name: 'Open messages' });
			await expect(launcher).toBeVisible();
			await expect(launcher).toContainText('4');
		}
	});
});
