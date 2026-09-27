import { Capacitor } from '@capacitor/core';

/**
 * Frontend release version (package.json `version`), injected at build time via
 * vite.config.ts `define`. Distinct from SvelteKit's `version` (see utils/versionWatch.ts),
 * which is a per-build hash used only for stale-tab reloads.
 */
// typeof guards keep this importable from configs that lack the `define` (e.g. the
// standalone vitest browser project) instead of throwing a ReferenceError.
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown';

/** Short git commit SHA of the build, or 'unknown' when built without .git. */
export const GIT_SHA: string = typeof __GIT_SHA__ === 'string' ? __GIT_SHA__ : 'unknown';

export type ClientPlatform = 'web' | 'ios' | 'android';

/** Current runtime platform, bounded to 'web' | 'ios' | 'android'. */
export function clientPlatform(): ClientPlatform {
	let platform: string;
	try {
		platform = Capacitor.getPlatform();
	} catch {
		return 'web';
	}
	return platform === 'ios' || platform === 'android' ? platform : 'web';
}

/** Headers the backend reads to attribute requests to a client version/platform. */
export function clientInfoHeaders(): Record<string, string> {
	return {
		'X-Client-Version': APP_VERSION,
		'X-Client-Platform': clientPlatform(),
	};
}
