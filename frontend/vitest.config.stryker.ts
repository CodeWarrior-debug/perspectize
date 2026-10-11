import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

/**
 * Vitest config used only by StrykerJS (see stryker.config.json).
 *
 * vite.config.ts can't be reused as-is: its `test.projects` also pulls in the
 * Playwright browser project, and it loads the PWA plugin and shells out to git
 * for build info — none of which a mutation run wants (Stryker re-runs the unit
 * project hundreds of times, in a sandbox copy of the tree with no .git).
 * Keep `test` in sync with the `unit` project in vite.config.ts.
 */
export default defineConfig({
	define: {
		// Fixed stand-in for the git-derived value vite.config.ts injects.
		__BUILD_INFO__: JSON.stringify({
			tag: 'unknown',
			branch: 'unknown',
			commit: 'unknown',
			commitShort: 'unknown',
			buildTime: '1970-01-01T00:00:00.000Z',
		}),
	},
	plugins: [sveltekit()],
	resolve: {
		conditions: ['browser'],
	},
	test: {
		name: 'unit',
		include: ['tests/**/*.{test,spec}.{js,ts}'],
		exclude: [
			'tests/browser/**',
			// Stryker runs in a sandbox copy of frontend/ only. These two read files that live
			// outside it (repo-root data/bible/ and testdata/), fail unmutated there, and would
			// abort the dry run. Their mutants (buildTag.ts, bibleVersion) read as LIVED.
			'tests/unit/bibleVersion.test.ts',
			'tests/unit/buildTag.test.ts',
		],
		environment: 'jsdom',
		globals: true,
		setupFiles: ['./tests/setup.ts'],
		// Mutation runs execute instrumented code, several runners at once — the Bible
		// verse-ordinal round-trip test blows the 5s default there while passing in ~1s
		// normally. A dry-run timeout aborts Stryker, so give it headroom.
		testTimeout: 30_000,
	},
});
