import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiOriginFromGraphqlUrl, frontendBuildInfo, printVersionInfo } from '$lib/utils/versionInfo';

function fakeConsole() {
	return {
		group: vi.fn(),
		groupEnd: vi.fn(),
		table: vi.fn(),
		log: vi.fn(),
		error: vi.fn(),
	};
}

describe('apiOriginFromGraphqlUrl', () => {
	it('extracts the origin from a GraphQL URL', () => {
		expect(apiOriginFromGraphqlUrl('http://localhost:8080/graphql')).toBe('http://localhost:8080');
	});

	it('handles a production URL', () => {
		expect(apiOriginFromGraphqlUrl('https://api.perspectize.com/graphql')).toBe('https://api.perspectize.com');
	});

	it('returns "unknown" for an invalid URL instead of throwing', () => {
		expect(apiOriginFromGraphqlUrl('not-a-url')).toBe('unknown');
	});
});

describe('frontendBuildInfo', () => {
	it('returns the build-time injected __BUILD_INFO__', () => {
		// Vitest's test config defines __BUILD_INFO__ the same way vite.config.ts
		// does for a real build (see resolveGitBuildInfo), so this just proves
		// the global is wired through, not any specific value.
		const info = frontendBuildInfo();
		expect(typeof info.tag).toBe('string');
		expect(typeof info.commit).toBe('string');
		expect(typeof info.commitShort).toBe('string');
		expect(typeof info.branch).toBe('string');
		expect(typeof info.buildTime).toBe('string');
	});
});

describe('printVersionInfo', () => {
	let con: ReturnType<typeof fakeConsole>;

	beforeEach(() => {
		con = fakeConsole();
	});

	it('prints the frontend facts immediately', async () => {
		const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
		await printVersionInfo({ graphqlUrl: 'http://localhost:8080/graphql', fetchFn, console: con });

		expect(con.group).toHaveBeenCalledWith('Perspectize build info');
		expect(con.table).toHaveBeenCalledWith([expect.objectContaining({ scope: 'frontend' })]);
		expect(con.groupEnd).toHaveBeenCalled();
	});

	it('prints backend facts on fetch success', async () => {
		const backend = { commit: 'abc1234', branch: 'main', tag: 'v2024.01.09-abc1234' };
		const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => backend });

		await printVersionInfo({ graphqlUrl: 'http://localhost:8080/graphql', fetchFn, console: con });

		expect(fetchFn).toHaveBeenCalledWith('http://localhost:8080/version');
		expect(con.table).toHaveBeenCalledWith([expect.objectContaining({ scope: 'backend', ...backend })]);
		expect(con.error).not.toHaveBeenCalled();
	});

	it('prints a clear error line on fetch failure', async () => {
		const fetchFn = vi.fn().mockRejectedValue(new Error('network error'));

		await printVersionInfo({ graphqlUrl: 'http://localhost:8080/graphql', fetchFn, console: con });

		expect(con.error).toHaveBeenCalledWith('backend /version fetch failed:', 'network error');
	});

	it('prints an error line on a non-OK response instead of throwing', async () => {
		const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

		await expect(
			printVersionInfo({ graphqlUrl: 'http://localhost:8080/graphql', fetchFn, console: con }),
		).resolves.toBeUndefined();
		expect(con.error).toHaveBeenCalledWith('backend /version fetch failed:', 'backend /version responded 500');
	});
});
