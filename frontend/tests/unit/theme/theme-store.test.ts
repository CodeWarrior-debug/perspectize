import { describe, it, expect, beforeEach } from 'vitest';
import { createThemeStore, loadThemeState, STORAGE_KEY } from '$lib/theme/store.svelte';
import { DEFAULT_THEME_ID, THEME_PRESETS } from '$lib/theme/presets';

beforeEach(() => {
	localStorage.clear();
});

describe('loadThemeState', () => {
	it('returns the default state when localStorage is empty', () => {
		const state = loadThemeState();
		expect(state.activeThemeId).toBe(DEFAULT_THEME_ID);
		expect(state.customThemes).toEqual([]);
	});

	it('returns the default state when localStorage holds corrupt JSON', () => {
		localStorage.setItem(STORAGE_KEY, '{not valid json');
		const state = loadThemeState();
		expect(state.activeThemeId).toBe(DEFAULT_THEME_ID);
	});

	it('returns the default state when the stored shape is missing required fields', () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ foo: 'bar' }));
		const state = loadThemeState();
		expect(state.activeThemeId).toBe(DEFAULT_THEME_ID);
	});
});

describe('createThemeStore', () => {
	it('starts on the default preset', () => {
		const store = createThemeStore();
		expect(store.state.activeThemeId).toBe(DEFAULT_THEME_ID);
	});

	it('selecting a preset updates state and persists to localStorage', () => {
		const store = createThemeStore();
		const target = THEME_PRESETS.find((p) => p.id !== DEFAULT_THEME_ID)!;
		store.selectPreset(target.id);

		expect(store.state.activeThemeId).toBe(target.id);
		const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
		expect(persisted.activeThemeId).toBe(target.id);
	});

	it('saving a custom theme adds it to customThemes and activates it', () => {
		const store = createThemeStore();
		const tokens = THEME_PRESETS[0].base;
		const saved = store.saveCustomTheme('My Theme', tokens);

		expect(store.state.customThemes).toHaveLength(1);
		expect(store.state.customThemes[0].name).toBe('My Theme');
		expect(store.state.activeThemeId).toBe(saved.id);
	});

	it('round-trips a saved custom theme through localStorage reload', () => {
		const store = createThemeStore();
		const saved = store.saveCustomTheme('Round Trip', THEME_PRESETS[0].base);

		const reloaded = loadThemeState();
		expect(reloaded.activeThemeId).toBe(saved.id);
		expect(reloaded.customThemes).toHaveLength(1);
		expect(reloaded.customThemes[0].name).toBe('Round Trip');
	});

	it('deleting the active custom theme falls back to the default preset', () => {
		const store = createThemeStore();
		const saved = store.saveCustomTheme('Temp', THEME_PRESETS[0].base);
		expect(store.state.activeThemeId).toBe(saved.id);

		store.deleteCustomTheme(saved.id);

		expect(store.state.customThemes).toHaveLength(0);
		expect(store.state.activeThemeId).toBe(DEFAULT_THEME_ID);
	});

	it('deleting a non-active custom theme leaves the active theme untouched', () => {
		const store = createThemeStore();
		const saved = store.saveCustomTheme('Keep Me', THEME_PRESETS[0].base);
		store.selectPreset(DEFAULT_THEME_ID);

		store.deleteCustomTheme(saved.id);

		expect(store.state.activeThemeId).toBe(DEFAULT_THEME_ID);
		expect(store.state.customThemes).toHaveLength(0);
	});

	it('activeFullTokens returns the preset tokens when a preset is active', () => {
		const store = createThemeStore();
		const tokens = store.activeFullTokens();
		expect(tokens.primary).toBe(THEME_PRESETS[0].base.primary);
	});

	it('activeFullTokens returns derived custom tokens when a custom theme is active', () => {
		const store = createThemeStore();
		const customPrimary = '#123456';
		store.saveCustomTheme('Custom', { ...THEME_PRESETS[0].base, primary: customPrimary });

		expect(store.activeFullTokens().primary).toBe(customPrimary);
	});
});
