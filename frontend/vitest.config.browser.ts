import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { playwright } from '@vitest/browser-playwright';

/**
 * All visual output — screenshots AND video — lands in one folder that is
 * already part of the self-verify workflow (see .docs/VERIFICATION.md), rather
 * than test-results/ or a per-test __screenshots__/ tree.
 *
 * Override on machines where the macOS path doesn't exist (cloud sessions, a
 * Linux checkout):  SV_SCREENSHOTS_DIR=/tmp/shots pnpm run test:browser
 */
const SCREENSHOT_DIR = process.env.SV_SCREENSHOTS_DIR ?? '/Users/jamesjordan/Downloads/screenshots';

/**
 * Video is opt-in so green runs don't pile up .webm files:
 *   VITEST_BROWSER_VIDEO=1 pnpm run test:browser
 *
 * Playwright records WebM natively (via its bundled ffmpeg) — no conversion
 * step. Recording is per browser *context*, not per test, so a run captures
 * every test in the file. Narrow it to the case you actually want to watch:
 *   VITEST_BROWSER_VIDEO=1 pnpm run test:browser -t "sorts rows by views"
 */
const VIDEO_SIZE = { width: 1280, height: 720 };

const recordVideo = process.env.VITEST_BROWSER_VIDEO ? { dir: SCREENSHOT_DIR, size: VIDEO_SIZE } : undefined;

/**
 * Escape hatch for environments whose pre-installed Chromium revision doesn't
 * match the one Playwright expects (cloud containers ship their own browsers).
 * Unset on a normal machine, where Playwright resolves its own download.
 */
const executablePath = process.env.PW_CHROMIUM_EXECUTABLE;

export default defineConfig({
	plugins: [svelte()],
	// Tests run inside the browser, where process.env isn't available. Inject the
	// directory so a test can pass an ABSOLUTE path to page.screenshot(): vitest
	// resolves a custom path against the test file, so only an absolute one
	// escapes tests/browser/ and lands flat in SCREENSHOT_DIR.
	define: {
		__SV_SCREENSHOT_DIR__: JSON.stringify(SCREENSHOT_DIR),
	},
	server: {
		fs: {
			// Vite refuses to serve/write outside the project root by default, which
			// blocks writing captures into the shared screenshots folder. '..' keeps
			// the monorepo root readable (the default this list replaces).
			allow: ['..', SCREENSHOT_DIR],
		},
	},
	resolve: {
		conditions: ['browser'],
		alias: {
			$lib: new URL('./src/lib', import.meta.url).pathname,
			'$app/environment': new URL('./tests/browser/mocks/app-environment.ts', import.meta.url).pathname,
			'$app/navigation': new URL('./tests/browser/mocks/app-navigation.ts', import.meta.url).pathname,
			'$app/stores': new URL('./tests/browser/mocks/app-stores.ts', import.meta.url).pathname,
		},
	},
	test: {
		name: 'browser',
		include: ['tests/browser/**/*.test.ts'],
		// Failure screenshots are also copied here as attachments; default is a
		// stray frontend/.vitest-attachments/ dir. Keep it in the same folder.
		attachmentsDir: SCREENSHOT_DIR,
		browser: {
			enabled: true,
			provider: playwright({
				contextOptions: { recordVideo },
				...(executablePath ? { launchOptions: { executablePath } } : {}),
			}),
			instances: [
				{
					browser: 'chromium',
					// Match VIDEO_SIZE: Playwright scales the page to fit recordVideo.size,
					// and the default (414x896) also clips the 1200px-wide test harness out
					// of any screenshot.
					viewport: VIDEO_SIZE,
					// Catches the default-named captures too (including automatic
					// screenshot-on-failure), so nothing lands in test-results/.
					screenshotDirectory: SCREENSHOT_DIR,
				},
			],
		},
	},
});
