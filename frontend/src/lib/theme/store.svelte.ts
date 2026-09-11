import { browser } from '$app/environment';
import { deriveTheme, toCssVarMap, type BaseThemeTokens, type FullThemeTokens } from './derive';
import { DEFAULT_THEME_ID, THEME_PRESETS, THEME_PRESET_TOKENS } from './presets';

export const STORAGE_KEY = 'perspectize-theme';
/** Cached, pre-computed CSS vars for the active theme — lets app.html's inline
 *  pre-paint script apply the right theme without re-running derivation. */
export const APPLIED_CACHE_KEY = 'perspectize-theme-applied';

export interface CustomTheme {
	id: string;
	name: string;
	tokens: BaseThemeTokens;
}

export interface ThemeState {
	activeThemeId: string;
	customThemes: CustomTheme[];
}

function defaultState(): ThemeState {
	return { activeThemeId: DEFAULT_THEME_ID, customThemes: [] };
}

function isCustomTheme(state: ThemeState, id: string): CustomTheme | undefined {
	return state.customThemes.find((t) => t.id === id);
}

export function loadThemeState(): ThemeState {
	if (!browser) return defaultState();
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return defaultState();
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed.activeThemeId !== 'string' || !Array.isArray(parsed.customThemes)) {
			return defaultState();
		}
		return parsed as ThemeState;
	} catch {
		return defaultState();
	}
}

function saveThemeState(state: ThemeState): void {
	if (!browser) return;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

interface AppliedCache {
	dataThemeId: string | null; // preset id to set as data-theme, or null for default/custom
	vars: Record<string, string> | null; // inline vars for a custom theme, or null for a preset
}

/**
 * Apply a resolved theme (preset via attribute, custom via inline vars) to the document.
 * @param cacheForPrePaint When false (live wheel-drag preview), skip writing the pre-paint
 *   cache so an unsaved preview never becomes what the next page load shows.
 */
export function applyThemeToDom(state: ThemeState, cacheForPrePaint = true): void {
	if (!browser) return;
	const root = document.documentElement;
	const custom = isCustomTheme(state, state.activeThemeId);
	let cache: AppliedCache;

	if (custom) {
		root.removeAttribute('data-theme');
		const tokens = deriveTheme(custom.tokens);
		const vars = toCssVarMap(tokens);
		for (const [k, v] of Object.entries(vars)) {
			root.style.setProperty(k, v);
		}
		cache = { dataThemeId: null, vars };
	} else {
		// Preset: clear any leftover inline custom-theme vars, use the data-theme CSS block instead.
		const preset = THEME_PRESETS.find((p) => p.id === state.activeThemeId) ?? THEME_PRESETS[0];
		clearInlineThemeVars(root);
		if (preset.id === DEFAULT_THEME_ID) {
			root.removeAttribute('data-theme');
			cache = { dataThemeId: null, vars: null };
		} else {
			root.setAttribute('data-theme', preset.id);
			cache = { dataThemeId: preset.id, vars: null };
		}
	}

	if (!cacheForPrePaint) return;
	try {
		localStorage.setItem(APPLIED_CACHE_KEY, JSON.stringify(cache));
	} catch {
		// localStorage unavailable (private mode / quota) — pre-paint script just falls back to default.
	}
}

function clearInlineThemeVars(root: HTMLElement): void {
	const props = [
		'--color-background',
		'--color-foreground',
		'--color-card',
		'--color-card-foreground',
		'--color-popover',
		'--color-popover-foreground',
		'--color-primary',
		'--color-primary-hover',
		'--color-primary-foreground',
		'--color-secondary',
		'--color-secondary-hover',
		'--color-secondary-foreground',
		'--color-muted',
		'--color-muted-foreground',
		'--color-accent',
		'--color-accent-foreground',
		'--color-destructive',
		'--color-destructive-hover',
		'--color-destructive-foreground',
		'--color-border',
		'--color-input',
		'--color-ring',
		'--color-rating-positive',
		'--color-rating-neutral',
		'--color-rating-negative',
		'--color-rating-undecided',
	];
	for (const p of props) root.style.removeProperty(p);
}

/** Reactive theme store. Instantiate once (e.g. module-level) and use across the app. */
export function createThemeStore() {
	const state = $state<ThemeState>(loadThemeState());

	// Apply the persisted theme immediately (app.html's inline script already
	// avoided the flash pre-paint; this keeps the reactive DOM in sync on mount).
	applyThemeToDom(state);

	function persistAndApply() {
		saveThemeState(state);
		applyThemeToDom(state);
	}

	function selectPreset(id: string) {
		state.activeThemeId = id;
		persistAndApply();
	}

	function selectCustom(id: string) {
		if (!isCustomTheme(state, id)) return;
		state.activeThemeId = id;
		persistAndApply();
	}

	function previewCustomTokens(tokens: BaseThemeTokens) {
		// Live-preview without persisting or changing activeThemeId — used while dragging the wheel
		// before the user has saved a name.
		applyThemeToDom({ activeThemeId: '__preview__', customThemes: [{ id: '__preview__', name: '', tokens }] }, false);
	}

	function saveCustomTheme(name: string, tokens: BaseThemeTokens): CustomTheme {
		const theme: CustomTheme = { id: crypto.randomUUID(), name, tokens };
		state.customThemes.push(theme);
		state.activeThemeId = theme.id;
		persistAndApply();
		return theme;
	}

	function deleteCustomTheme(id: string) {
		state.customThemes = state.customThemes.filter((t) => t.id !== id);
		if (state.activeThemeId === id) {
			state.activeThemeId = DEFAULT_THEME_ID;
		}
		persistAndApply();
	}

	function activeFullTokens(): FullThemeTokens {
		const custom = isCustomTheme(state, state.activeThemeId);
		if (custom) return deriveTheme(custom.tokens);
		return THEME_PRESET_TOKENS[state.activeThemeId] ?? THEME_PRESET_TOKENS[DEFAULT_THEME_ID];
	}

	return {
		get state() {
			return state;
		},
		selectPreset,
		selectCustom,
		previewCustomTokens,
		saveCustomTheme,
		deleteCustomTheme,
		activeFullTokens,
	};
}

export type ThemeStore = ReturnType<typeof createThemeStore>;
