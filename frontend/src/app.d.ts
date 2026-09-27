// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	/** package.json version, injected by vite.config.ts `define`. */
	const __APP_VERSION__: string;
	/** Short git SHA of the build ('unknown' without .git), injected by vite.config.ts `define`. */
	const __GIT_SHA__: string;

	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

interface ImportMetaEnv {
	readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
	readonly VITE_ONBOARDING_VIDEO_GUEST_PRODUCT?: string;
	readonly VITE_ONBOARDING_VIDEO_HOW_ADD_VIDEO?: string;
	readonly VITE_ONBOARDING_VIDEO_HOW_PERSPECTIVE?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

export {};
