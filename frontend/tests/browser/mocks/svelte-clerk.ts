// Browser-mode stand-in for svelte-clerk. The real package imports SvelteKit
// virtual modules ($app/state, $env/dynamic/public) that don't resolve under
// vitest browser mode. Browser tests run with VITE_DEMO_MODE=true, where the
// auth facade never reaches Clerk, so these are only here to satisfy imports.
export const Show = () => {};
export const ClerkProvider = () => {};
export const ClerkLoaded = () => {};
export const ClerkLoading = () => {};

export function useClerkContext(): never {
	throw new Error('svelte-clerk is stubbed in browser tests; run them in demo mode (VITE_DEMO_MODE=true)');
}
