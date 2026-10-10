/**
 * Console output for the zzzv hotkey (see versionHotkey.ts): frontend build
 * facts baked in at build time (__BUILD_INFO__, injected by vite.config.ts),
 * plus the backend's GET /version, fetched from the same origin the app's
 * GraphQL client talks to.
 */

export interface FrontendBuildInfo {
	tag: string;
	branch: string;
	commit: string;
	commitShort: string;
	buildTime: string;
}

export function frontendBuildInfo(): FrontendBuildInfo {
	return __BUILD_INFO__;
}

/** The backend origin the frontend talks to, derived from its GraphQL URL. */
export function apiOriginFromGraphqlUrl(graphqlUrl: string): string {
	try {
		return new URL(graphqlUrl).origin;
	} catch {
		return 'unknown';
	}
}

export interface PrintVersionInfoOptions {
	graphqlUrl: string;
	fetchFn?: typeof fetch;
	console?: Pick<Console, 'group' | 'groupEnd' | 'table' | 'log' | 'error'>;
}

/**
 * Prints frontend build facts immediately, then fetches and prints the
 * backend's /version in the same console group. A fetch failure prints a
 * clear error line instead of throwing.
 */
export async function printVersionInfo({
	graphqlUrl,
	fetchFn = fetch,
	console: con = console,
}: PrintVersionInfoOptions): Promise<void> {
	const apiOrigin = apiOriginFromGraphqlUrl(graphqlUrl);

	con.group('Perspectize build info');
	con.table([{ scope: 'frontend', ...frontendBuildInfo() }]);
	con.log('API URL:', apiOrigin);

	try {
		const res = await fetchFn(`${apiOrigin}/version`);
		if (!res.ok) {
			throw new Error(`backend /version responded ${res.status}`);
		}
		const backend = await res.json();
		con.table([{ scope: 'backend', ...backend }]);
	} catch (err) {
		con.error('backend /version fetch failed:', err instanceof Error ? err.message : err);
	}

	con.groupEnd();
}
