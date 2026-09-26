import adapter from '@sveltejs/adapter-static';

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
		// the new deploy already deleted.
		version: {
			pollInterval: 5 * 60 * 1000,
		},
		serviceWorker: {
			register: false,
		},
	},
};

export default config;
