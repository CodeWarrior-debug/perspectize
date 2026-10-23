// Browser-mode stand-in for SvelteKit's `$app/state`. `url` is a plain value a
// test can replace before rendering (the real one is reactive router state).
export const page = {
	url: new URL('http://localhost/activity'),
	params: {},
	route: { id: '/activity' },
	status: 200,
	error: null,
	data: {},
	form: null,
	state: {},
};

export const navigating = { from: null, to: null, type: null, willUnload: null, delta: null, complete: null };
export const updated = { current: false, check: () => Promise.resolve(false) };
