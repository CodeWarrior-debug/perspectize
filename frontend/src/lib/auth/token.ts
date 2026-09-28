import { DEMO_MODE, demoSession } from './demo.svelte';

/** Bearer token for API calls, or null when signed out. */
export async function getAuthToken(): Promise<string | null> {
	if (DEMO_MODE) return demoSession.token;
	try {
		const token = await window.Clerk?.session?.getToken();
		return token ?? null;
	} catch {
		return null;
	}
}
