import faroUploader from '@grafana/faro-rollup-plugin';
import type { Plugin } from 'vite';

// Source-map upload to Grafana Faro (observability plan, Task 11).
//
// Opt-in: only when FARO_SOURCEMAP_API_KEY is present at build time. With the key unset this
// returns an empty object, so the Vite config is exactly what it was before (no sourcemaps,
// no plugin) — local dev, CI and the unit tests need no Grafana account.
//
// 'hidden' maps are written to disk for the uploader but Vite suppresses the
// `//# sourceMappingURL=` comment in the emitted JS, so browsers never ask for them.
// scripts/strip-sourcemaps.mjs then deletes any *.map left in build/ so they are never served.

export const FARO_APP_NAME = 'perspectize-web';

const REQUIRED_WITH_KEY = ['FARO_APP_ID', 'FARO_STACK_ID', 'FARO_API_ENDPOINT'] as const;

export interface FaroSourcemapConfig {
	sourcemap?: 'hidden';
	plugins: Plugin[];
}

export function faroSourcemapConfig(env: Record<string, string | undefined>): FaroSourcemapConfig {
	const apiKey = env.FARO_SOURCEMAP_API_KEY;
	if (!apiKey) return { plugins: [] };

	const missing = REQUIRED_WITH_KEY.filter((name) => !env[name]);
	if (missing.length > 0) {
		throw new Error(
			`FARO_SOURCEMAP_API_KEY is set but ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} missing. ` +
				'Set all of FARO_APP_ID, FARO_STACK_ID and FARO_API_ENDPOINT (Grafana Frontend Observability → ' +
				'Settings → Source Maps), or unset FARO_SOURCEMAP_API_KEY to build without source-map upload.',
		);
	}

	const uploader = faroUploader({
		appName: FARO_APP_NAME,
		endpoint: env.FARO_API_ENDPOINT as string,
		appId: env.FARO_APP_ID as string,
		stackId: env.FARO_STACK_ID as string,
		apiKey,
		gzipContents: true,
	}) as unknown as Plugin;

	return {
		sourcemap: 'hidden',
		plugins: [
			{
				...uploader,
				// SvelteKit runs a client and an SSR (prerender) build; only the client bundle
				// reaches browsers, so only its maps are worth uploading.
				apply: (_config, { command, isSsrBuild }) => command === 'build' && !isSsrBuild,
			},
		],
	};
}
