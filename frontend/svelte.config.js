import { execFileSync } from 'node:child_process';
import adapter from '@sveltejs/adapter-static';

// Same best-effort git lookup as vite.config.ts's resolveGitBuildInfo — kept
// separate (not imported) because this file is loaded outside Vite's own
// module pipeline and can't rely on it transpiling a shared TS helper.
function currentCommitOrUnknown() {
	try {
		return execFileSync('git', ['rev-parse', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] })
			.toString()
			.trim();
	} catch {
		return 'unknown';
	}
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: 'index.html',
			strict: false,
		}),
		paths: {
			base: '',
		},
		// Poll _app/version.json so a long-lived tab learns about a new deploy
		// (flips `updated.current`), and the layout's beforeNavigate hook turns
		// its next navigation into a full page load instead of requesting chunks
		// the new deploy already deleted. `name` ties version.json to the exact
		// commit this build came from, for the zzzv console hotkey.
		version: {
			name: currentCommitOrUnknown(),
			pollInterval: 5 * 60 * 1000,
		},
		serviceWorker: {
			register: false,
		},
	},
};

export default config;
