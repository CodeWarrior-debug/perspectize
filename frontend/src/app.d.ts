// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
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
	/** Grafana Faro collector URL; unset = telemetry disabled. */
	readonly VITE_FARO_URL?: string;
	/** Deployment environment reported to Faro (falls back to the Vite mode). */
	readonly VITE_APP_ENV?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

export {};
