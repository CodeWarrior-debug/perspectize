// Lighthouse CI config. Runs a real Chrome audit against each route below,
// isolated per URL, so a slow page doesn't get hidden in an average score.
//
// The app is a client-rendered SPA (ssr = false, see src/routes/+layout.ts),
// so scores mostly reflect bundle size / hydration / render cost rather than
// server response time — that's what a Node version bump on the build/runtime
// side is most likely to move.
//
// Usage:
//   pnpm run perf:lighthouse            # build + serve + audit all routes
//   pnpm run perf:lighthouse -- --collect.url=http://localhost:4173/discover
module.exports = {
	ci: {
		collect: {
			// `pnpm run preview` serves the production build on :4173.
			startServerCommand: 'pnpm run preview',
			startServerReadyPattern: 'Local:',
			startServerReadyTimeout: 30000,
			url: [
				'http://localhost:4173/',
				'http://localhost:4173/discover',
				'http://localhost:4173/messages',
			],
			numberOfRuns: 3,
		},
		assert: {
			assertions: {
				'categories:performance': ['warn', { minScore: 0.7 }],
				'categories:accessibility': ['warn', { minScore: 0.9 }],
			},
		},
		upload: {
			target: 'filesystem',
			outputDir: './perf/lighthouse/results',
			reportFilenamePattern: '%%HOSTNAME%%-%%PATHNAME%%-%%DATETIME%%-report.%%EXTENSION%%',
		},
	},
};
