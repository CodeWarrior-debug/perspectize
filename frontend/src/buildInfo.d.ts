import type { FrontendBuildInfo } from '$lib/utils/versionInfo';

// Injected by vite.config.ts's `define`, computed from the local git
// checkout at build time (or "unknown" for every field when git isn't
// available — see resolveGitBuildInfo in vite.config.ts).
declare global {
	const __BUILD_INFO__: FrontendBuildInfo;
}

export {};
