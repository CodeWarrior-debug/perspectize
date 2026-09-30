/**
 * Demo mode (VITE_DEMO_MODE=true): Clerk is bypassed and the visitor picks one
 * of the seeded demo personas. Requests then carry `Bearer demo.<persona>`,
 * which only a backend started with DEMO_MODE=true accepts (it refuses to
 * start that way in production).
 *
 * Persona selection comes from, in order: a `?demo_as=<key>` URL param (what
 * tours and E2E tests use — `?demo_as=` signs out), then localStorage.
 */

export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

export interface DemoPersona {
	key: string;
	name: string;
	blurb: string;
}

/** Mirrors backend/internal/demo/fixtures.go `Personas` — keep in sync. */
export const DEMO_PERSONAS: readonly DemoPersona[] = [
	{ key: 'alice', name: 'Alice', blurb: 'Prolific reviewer — lots of perspectives, public and private' },
	{ key: 'ben', name: 'Ben', blurb: 'Disagrees with Alice on most things — great for Compare' },
	{ key: 'carmen', name: 'Carmen (admin)', blurb: 'Admin — sees admin-only controls' },
	{ key: 'newbie', name: 'Newbie', blurb: 'Brand-new account — empty library, onboarding coach active' },
];

const STORAGE_KEY = 'perspectize.demoPersona';
const URL_PARAM = 'demo_as';

function isPersonaKey(value: string | null | undefined): value is string {
	return !!value && DEMO_PERSONAS.some((p) => p.key === value);
}

function readStored(): string | null {
	try {
		return localStorage.getItem(STORAGE_KEY);
	} catch {
		return null;
	}
}

function writeStored(key: string | null) {
	try {
		if (key) localStorage.setItem(STORAGE_KEY, key);
		else localStorage.removeItem(STORAGE_KEY);
	} catch {
		// private mode / blocked storage: the session just won't persist
	}
}

export class DemoSession {
	persona = $state<string | null>(null);
	pickerOpen = $state(false);

	get signedIn(): boolean {
		return this.persona !== null;
	}

	get current(): DemoPersona | null {
		return DEMO_PERSONAS.find((p) => p.key === this.persona) ?? null;
	}

	/** The Clerk-shaped user id the rest of the app keys caches on. */
	get userId(): string | null {
		return this.persona ? `demo_${this.persona}` : null;
	}

	get token(): string | null {
		return this.persona ? `demo.${this.persona}` : null;
	}

	/** Resolve the initial persona from the URL param, else storage. */
	init(url: URL) {
		if (url.searchParams.has(URL_PARAM)) {
			this.signInAs(url.searchParams.get(URL_PARAM));
			return;
		}
		const stored = readStored();
		this.persona = isPersonaKey(stored) ? stored : null;
	}

	signInAs(key: string | null) {
		this.persona = isPersonaKey(key) ? key : null;
		writeStored(this.persona);
		this.pickerOpen = false;
	}

	signOut() {
		this.signInAs(null);
	}
}

export const demoSession = new DemoSession();

if (DEMO_MODE && typeof window !== 'undefined') {
	demoSession.init(new URL(window.location.href));
}
