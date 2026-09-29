// $state-backed stand-in for svelte-clerk's context so tests can change auth
// mid-life and let AuthUserSync's effects re-run through real reactivity.
export const reactiveClerk = $state({
	isLoaded: true,
	auth: { userId: null as string | null },
});
