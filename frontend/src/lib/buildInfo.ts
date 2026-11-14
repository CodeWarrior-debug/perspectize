import { Capacitor } from '@capacitor/core';
import type { FrontendBuildInfo } from '$lib/utils/versionInfo';

// typeof guard keeps this importable from configs that lack the `define` (e.g. the
// standalone vitest browser project) instead of throwing a ReferenceError.
const info: Partial<FrontendBuildInfo> = typeof __BUILD_INFO__ === 'object' ? __BUILD_INFO__ : {};

/**
 * Frontend version identity: the deterministic build tag `v<YYYY.MM.DD>-<short7sha>`
 * (committer date + short commit SHA, see utils/buildTag.ts `computeTag`), read from the
 * `__BUILD_INFO__` define that vite.config.ts computes at build time — the same value the
 * zzzv hotkey prints (utils/versionInfo.ts). 'unknown' when built without .git.
 * Sent as `X-Client-Version` and reported to Faro as the app version. Distinct from
 * SvelteKit's `kit.version` (see utils/versionWatch.ts), a per-build hash used only for
 * stale-tab reloads.
 */
export const APP_VERSION: string = info.tag || 'unknown';

/** Short (7-char) git commit SHA of the build, or 'unknown' when built without .git. */
export const GIT_SHA: string = info.commitShort || 'unknown';

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
