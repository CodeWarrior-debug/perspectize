/**
 * Demo-mode sign-in, in a REAL browser.
 *
 * Regression: in demo mode auth is loaded at mount, so AuthUserSync used to call
 * queryClient.clear() on its first resolution — after sibling queries had
 * already started — which detached them. The messaging launcher (gated on the
 * `me` query) then never rendered for a signed-in persona, and `Me` was sent twice.
 *
 * Run: pnpm run test:browser --browser.headless=true
 */
import { render } from 'vitest-browser-svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';

import DemoSignedInHarness from './fixtures/DemoSignedInHarness.svelte';
import { demoSession } from '$lib/auth/demo.svelte';

// Demo mode is a build-time flag read when $lib/auth loads. Hoisted so it is set
// before the imports above evaluate; each browser test file gets its own page, so
// it doesn't leak into other files. (Not a config `define`: that would leak into
// the unit project too.)
vi.hoisted(() => vi.stubEnv('VITE_DEMO_MODE', 'true'));

const ME = {
	id: '3',
	username: 'alice_demo',
	role: 'DEFAULT',
	onboarding: { version: 1, displayNextSession: false, completedAt: '2026-01-01T00:00:00Z' },
};

let operations: string[];

beforeEach(() => {
	operations = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (_url: unknown, init?: RequestInit) => {
			const { operationName } = JSON.parse(String(init?.body ?? '{}')) as { operationName?: string };
			operations.push(operationName ?? '');
			const data = operationName === 'Me' ? { me: ME } : { messageThreads: [] };
			return new Response(JSON.stringify({ data }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		}),
	);
	demoSession.signInAs('alice');
});

afterEach(() => {
	demoSession.signOut();
	vi.unstubAllGlobals();
});

describe('demo-mode sign-in', () => {
	it('shows the messaging launcher for a signed-in persona and fetches `me` once', async () => {
		render(DemoSignedInHarness);

		await expect.element(page.getByRole('button', { name: 'Open messages' })).toBeVisible();
		expect(operations.filter((op) => op === 'Me')).toHaveLength(1);
	});
});
