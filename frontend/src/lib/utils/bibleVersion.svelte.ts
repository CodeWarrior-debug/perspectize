import translations from '$lib/data/bible-translations.json';
import { DEFAULT_VERSION } from './bibleLinks';

export const BIBLE_VERSION_KEY = 'perspectize:bible-version';

const isKnown = (code: string | null): code is string => !!code && translations.some((t) => t.code === code);

function readStored(): string {
	try {
		const stored = localStorage.getItem(BIBLE_VERSION_KEY);
		if (isKnown(stored)) return stored;
	} catch {
		// storage blocked/unavailable — fall through to the default
	}
	return DEFAULT_VERSION;
}

/** Reader's preferred Bible Gateway version (AN Q15): per-device, persisted best-effort. */
export function createBibleVersionStore() {
	let code = $state(readStored());
	return {
		get code() {
			return code;
		},
		set(next: string) {
			if (!isKnown(next)) return;
			code = next;
			try {
				localStorage.setItem(BIBLE_VERSION_KEY, next);
			} catch {
				// keep the in-memory choice for this session
			}
		},
	};
}

export type BibleVersionStore = ReturnType<typeof createBibleVersionStore>;

/** Shared instance so every passage link in the app follows the same choice. */
export const bibleVersion = createBibleVersionStore();
