import { useClerkContext } from 'svelte-clerk';
import { DEMO_MODE, demoSession } from './demo.svelte';

export interface AuthState {
	readonly isLoaded: boolean;
	/** Clerk user id (demo mode: `demo_<persona>`), or null when signed out. */
	readonly userId: string | null;
}

/**
 * Auth state for components, independent of whether Clerk or demo mode is
 * active. Must be called during component init (it reads Clerk's context).
 */
export function useAuthState(): AuthState {
	if (DEMO_MODE) {
		return {
			get isLoaded() {
				return true;
			},
			get userId() {
				return demoSession.userId;
			},
		};
	}
	const clerk = useClerkContext();
	return {
		get isLoaded() {
			return clerk.isLoaded;
		},
		get userId() {
			return clerk.auth.userId ?? null;
		},
	};
}
