import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

export default defineConfig({
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
	],
	resolve: {
		conditions: ['browser'],
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
