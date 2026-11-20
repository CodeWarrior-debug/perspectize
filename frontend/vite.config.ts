import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';
import { faroSourcemapConfig } from './scripts/faro-sourcemaps.ts';
import { computeTag } from './src/lib/utils/buildTag.ts';
import { clerkPreloadValues, clerkPublishableKey } from './src/lib/utils/clerkScript.ts';
import { graphqlPreconnectOrigin } from './src/lib/utils/graphqlOrigin.ts';

// app.html preloads clerk-js via %sveltekit.env.PUBLIC_CLERK_*% placeholders, which read
// the public env at build time. Derive them here from the build env (process.env wins over
// .env files, as in Vite). Sevalla defines PUBLIC_CLERK_PUBLISHABLE_KEY, not the VITE_ name,
// so both prefixes are loaded. Empty when there is no key, so the placeholders render "".
const clerkBuildEnv = loadEnv(process.env.NODE_ENV ?? 'production', fileURLToPath(new URL('.', import.meta.url)), [
	'VITE_',
	'PUBLIC_',
]);
// A static site has no runtime env, so the layout's `import.meta.env.VITE_CLERK_PUBLISHABLE_KEY`
// must be filled at build time from either name (see `define` below), or the deployed app
// throws "Missing publishableKey".
const clerkKey = clerkPublishableKey(clerkBuildEnv);
const clerkPreload = clerkPreloadValues(clerkBuildEnv);
process.env.PUBLIC_CLERK_ORIGIN = clerkPreload.origin;
process.env.PUBLIC_CLERK_SCRIPT_URL = clerkPreload.scriptUrl;
// app.html preconnects to the GraphQL backend origin (%sveltekit.env.PUBLIC_GRAPHQL_ORIGIN%),
// so the connection opens during the Clerk wait. Empty when the endpoint is unset or relative.
process.env.PUBLIC_GRAPHQL_ORIGIN = graphqlPreconnectOrigin(clerkBuildEnv);

// Opt-in Faro source-map upload: empty (no sourcemaps, no plugin) unless
// FARO_SOURCEMAP_API_KEY is set; throws if the key is set without its companion vars.
const faro = faroSourcemapConfig(process.env);
// Resolves frontend build facts for the zzzv console hotkey (see
// lib/utils/versionHotkey.ts) from the local git checkout, at build time.
// Its `tag` is also the app version sent as X-Client-Version / to Faro
// (lib/buildInfo.ts). Separate from SvelteKit's kit.version (stale-tab
// reload hash, see lib/utils/versionWatch.ts).
// Falls back to "unknown" for everything if there's no .git available —
// e.g. the Sevalla static-site build environment isn't confirmed to have
// one (their env vars are Application-only per docs.sevalla.com), so this
// must never throw and break the build.
function resolveGitBuildInfo() {
	const unknown = { tag: 'unknown', branch: 'unknown', commit: 'unknown', commitShort: 'unknown' };
	const git = (...args: string[]) =>
		execFileSync('git', args, { stdio: ['ignore', 'pipe', 'ignore'] })
			.toString()
			.trim();

	try {
		const commit = git('rev-parse', 'HEAD');
		const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
		const committerDate = git('log', '-1', '--format=%cI', 'HEAD');
		return {
			tag: computeTag(committerDate, commit),
			branch,
			commit,
			commitShort: commit.slice(0, 7),
		};
	} catch {
		return unknown;
	}
}

const buildInfo = { ...resolveGitBuildInfo(), buildTime: new Date().toISOString() };

export default defineConfig({
	// The vitest 'unit' project below `extends` this file, so it inherits these too.
	define: {
		__BUILD_INFO__: JSON.stringify(buildInfo),
		// Only when a key resolved, so a plain VITE_ key or an unset one behaves as Vite does by default.
		...(clerkKey ? { 'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': JSON.stringify(clerkKey) } : {}),
	},
	// Fail if the port is taken rather than drifting to the next one: the Clerk sign-in
	// is per origin, and the agent registry's verification slots assume fixed ports.
	server: { strictPort: true },
	preview: { strictPort: true },
	plugins: [
		// Kit 3 reads its options here (svelte.config.js is gone). Poll _app/version.json
		// so a long-lived tab learns about a new deploy (flips `updated.current`); `name`
		// ties version.json to this build's commit, for the zzzv console hotkey.
		sveltekit({
			adapter: adapter({
				pages: 'build',
				assets: 'build',
				fallback: 'index.html',
				strict: false,
			}),
			paths: {
				base: '',
			},
			version: {
				name: buildInfo.commit,
				pollInterval: 5 * 60 * 1000,
			},
			serviceWorker: {
				register: false,
			},
		}),
		tailwindcss(),
		...faro.plugins,
	],
	resolve: {
		conditions: ['browser'],
	},
	build: {
		...(faro.sourcemap ? { sourcemap: faro.sourcemap } : {}),
		rolldownOptions: {
			output: {
				// Tiptap/ProseMirror (the perspective editor's rich-text engine, ~170KB
				// gzipped) is only reachable through a dynamic import (PerspectivePopover),
				// but Rollup's default chunking co-located a few of its small shared
				// helper exports with code the always-loaded root layout imports
				// statically — which pulled the whole editor bundle into every page's
				// critical path. Force it into its own chunk so it stays isolated behind
				// the dynamic import.
				codeSplitting: {
					groups: [
						{
							name: 'tiptap-vendor',
							test: /node_modules[\\/](@tiptap|prosemirror)/,
						},
					],
				},
			},
		},
	},
	test: {
		// In CI, also write every result to a file (uploaded by frontend-test.yml), so
		// when several files fail under load none of them scrolls off the log (#728).
		// `github-actions` keeps the inline PR annotations that overriding `reporters`
		// would otherwise drop. Root-level, like coverage: not a per-project option.
		...(process.env.CI
			? {
					reporters: ['default', 'github-actions', 'json'],
					outputFile: { json: './test-results/vitest-results.json' },
				}
			: {}),
		// Coverage is a root-level (workspace) option, not a per-project one — it
		// used to live under the 'unit' project's `test` block below, which typechecks
		// against ProjectConfig and doesn't have a `coverage` key, so `pnpm run check`
		// failed on this file. `pnpm run test:coverage` still only exercises the
		// 'unit' project (its own `include`/`exclude` scope it to that already).
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			exclude: [
				'node_modules/',
				'.svelte-kit/',
				'**/*.d.ts',
				'**/*.config.*',
				'**/setup.ts',
				'tests/helpers/**',
				'src/lib/components/shadcn/**',
				'src/routes/**',
				'src/lib/components/ActivityTable.svelte',
				// Thin wrapper around a third-party interactive widget (dynamically-
				// imported @jaames/iro canvas color picker) — its own code is just
				// construct-on-mount/teardown-on-destroy glue; meaningfully unit-testing
				// it would mean re-implementing canvas pointer interaction, so it's
				// excluded like ActivityTable.svelte above. ThemeCustomizePanel.svelte,
				// which uses it, is NOT excluded — that one has real logic and is tested
				// with ColorWheel swapped for a stub (see theme-customize-panel.test.ts).
				'src/lib/components/theme/ColorWheel.svelte',
			],
			thresholds: {
				lines: 80,
				functions: 75,
				branches: 75,
				statements: 80,
			},
		},
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'unit',
					include: ['tests/**/*.{test,spec}.{js,ts}'],
					exclude: ['tests/browser/**'],
					environment: 'jsdom',
					globals: true,
					setupFiles: ['./tests/setup.ts'],
				},
			},
			'./vitest.config.browser.ts',
		],
	},
});
