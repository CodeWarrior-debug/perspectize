import { defineConfig, devices } from '@playwright/test';
import type { TourOptions } from './fixtures';

/**
 * Demo tours — one script, two outputs:
 *   - `e2e`    fast, assertion-only run of every tour + flow against a demo stack
 *   - `record` the same tours paced for humans, with captions and a visible
 *              cursor, saved as videos to demo/out/videos/<name>.webm
 *
 * Both expect a running demo stack (docker-compose.demo.yml, or backend with
 * DEMO_MODE=true + frontend with VITE_DEMO_MODE=true) whose demo data was just
 * reset — `make demo-test` / `make demo-record` at the repo root handle that.
 */

const baseURL = process.env.DEMO_BASE_URL ?? 'http://localhost:5173';
// Cloud sandboxes ship a Chromium that may not match this Playwright's pinned
// revision; point at it instead of downloading one.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
const viewport = { width: 1280, height: 720 };

export default defineConfig<TourOptions>({
	testDir: '.',
	testMatch: ['tours/**/*.tour.ts', 'flows/**/*.spec.ts'],
	outputDir: 'out/test-results',
	fullyParallel: false,
	workers: 1, // tours share one database; keep them ordered and isolated
	reporter: [['list'], ['html', { outputFolder: 'out/report', open: 'never' }]],
	timeout: 60_000,
	use: {
		baseURL,
		viewport,
		launchOptions: { executablePath },
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
	},
	projects: [
		{
			name: 'e2e',
			use: { ...devices['Desktop Chrome'], viewport, launchOptions: { executablePath }, recording: false },
		},
		{
			name: 'record',
			testMatch: 'tours/**/*.tour.ts',
			timeout: 5 * 60_000,
			use: {
				...devices['Desktop Chrome'],
				viewport,
				deviceScaleFactor: 1,
				launchOptions: { executablePath },
				video: { mode: 'on', size: viewport },
				recording: true,
			},
		},
	],
});
