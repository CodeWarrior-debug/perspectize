import { execFileSync } from 'node:child_process';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { faroSourcemapConfig } from './scripts/faro-sourcemaps';
import { computeTag } from './src/lib/utils/buildTag';

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
	},
	plugins: [
		sveltekit(),
		tailwindcss(),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			workbox: {
				globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
				// registerType: 'autoUpdate' alone doesn't make a new service worker take
				// over immediately — without these, a newly-deployed SW installs but sits
				// in the "waiting" state until every old tab closes, so a page loaded
				// right around a deploy can straddle old/new asset versions with no way
				// out but a manual refresh (issue #311).
				skipWaiting: true,
				clientsClaim: true,
			},
			manifest: {
				name: 'Perspectize',
				short_name: 'Perspectize',
				description: 'Store, refine, and share perspectives on content',
				theme_color: '#1a365d',
				background_color: '#1a365d',
				display: 'standalone',
				scope: '/',
				start_url: '/',
				icons: [
					{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
					{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
					{
						src: 'icons/icon-512-maskable.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable',
					},
				],
			},
		}),
		...faro.plugins,
	],
	resolve: {
		conditions: ['browser'],
	},
	build: {
		...(faro.sourcemap ? { sourcemap: faro.sourcemap } : {}),
		rollupOptions: {
			output: {
				// Tiptap/ProseMirror (the perspective editor's rich-text engine, ~170KB
				// gzipped) is only reachable through a dynamic import (PerspectivePopover),
				// but Rollup's default chunking co-located a few of its small shared
				// helper exports with code the always-loaded root layout imports
				// statically — which pulled the whole editor bundle into every page's
				// critical path. Force it into its own chunk so it stays isolated behind
				// the dynamic import.
				manualChunks(id) {
					if (id.includes('node_modules/@tiptap') || id.includes('node_modules/prosemirror')) {
						return 'tiptap-vendor';
					}
				},
			},
		},
	},
	test: {
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
