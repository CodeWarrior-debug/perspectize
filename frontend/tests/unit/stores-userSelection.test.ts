import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('userSelection store', () => {
	beforeEach(() => {
		// Clear local storage before each test
		window.localStorage.clear();
		// Reset modules to re-initialize store state
		vi.resetModules();
	});

	it('exports selectedUserId', async () => {
		const store = await import('#lib/stores/userSelection.svelte.js');
		// Initial value should be null (no local storage value)
		expect(store.selectedUserId.value).toBeNull();
	});

	it('exports clearUserSelection function', async () => {
		const store = await import('#lib/stores/userSelection.svelte.js');
		expect(typeof store.clearUserSelection).toBe('function');
	});

	it('exports getSelectedUserId function', async () => {
		const store = await import('#lib/stores/userSelection.svelte.js');
		expect(typeof store.getSelectedUserId).toBe('function');
	});

	it('exports setSelectedUserId function', async () => {
		const store = await import('#lib/stores/userSelection.svelte.js');
		expect(typeof store.setSelectedUserId).toBe('function');
	});

	it('loads stored user ID from local storage', async () => {
		window.localStorage.setItem('perspectize:selectedUserId', '42');
		const store = await import('#lib/stores/userSelection.svelte.js');
		expect(store.selectedUserId.value).toBe(42);
	});

	it('returns null for invalid local storage value', async () => {
		window.localStorage.setItem('perspectize:selectedUserId', 'not-a-number');
		const store = await import('#lib/stores/userSelection.svelte.js');
		expect(store.selectedUserId.value).toBeNull();
	});

	it('returns null when local storage is empty', async () => {
		const store = await import('#lib/stores/userSelection.svelte.js');
		expect(store.selectedUserId.value).toBeNull();
	});

	it('returns null for empty string in local storage', async () => {
		window.localStorage.setItem('perspectize:selectedUserId', '');
		const store = await import('#lib/stores/userSelection.svelte.js');
		expect(store.selectedUserId.value).toBeNull();
	});

	it('getSelectedUserId returns the current value', async () => {
		window.localStorage.setItem('perspectize:selectedUserId', '99');
		const store = await import('#lib/stores/userSelection.svelte.js');
		expect(store.getSelectedUserId()).toBe(99);
	});

	it('getSelectedUserId returns null when no value set', async () => {
		const store = await import('#lib/stores/userSelection.svelte.js');
		expect(store.getSelectedUserId()).toBeNull();
	});

	it('setSelectedUserId updates the value and syncs to local storage', async () => {
		const store = await import('#lib/stores/userSelection.svelte.js');
		store.setSelectedUserId(123);
		expect(store.getSelectedUserId()).toBe(123);
		expect(window.localStorage.getItem('perspectize:selectedUserId')).toBe('123');
	});

	it('setSelectedUserId with null removes from local storage', async () => {
		window.localStorage.setItem('perspectize:selectedUserId', '42');
		const store = await import('#lib/stores/userSelection.svelte.js');
		store.setSelectedUserId(null);
		expect(store.getSelectedUserId()).toBeNull();
		expect(window.localStorage.getItem('perspectize:selectedUserId')).toBeNull();
	});

	it('selectedUserId.value setter updates and syncs to local storage', async () => {
		const store = await import('#lib/stores/userSelection.svelte.js');
		store.selectedUserId.value = 55;
		expect(store.selectedUserId.value).toBe(55);
		expect(window.localStorage.getItem('perspectize:selectedUserId')).toBe('55');
	});

	it('selectedUserId.value setter with null removes from local storage', async () => {
		const store = await import('#lib/stores/userSelection.svelte.js');
		store.selectedUserId.value = 77;
		expect(window.localStorage.getItem('perspectize:selectedUserId')).toBe('77');
		store.selectedUserId.value = null;
		expect(store.selectedUserId.value).toBeNull();
		expect(window.localStorage.getItem('perspectize:selectedUserId')).toBeNull();
	});

	it('clearUserSelection sets value to null and clears local storage', async () => {
		window.localStorage.setItem('perspectize:selectedUserId', '42');
		const store = await import('#lib/stores/userSelection.svelte.js');
		expect(store.getSelectedUserId()).toBe(42);
		store.clearUserSelection();
		expect(store.getSelectedUserId()).toBeNull();
		expect(window.localStorage.getItem('perspectize:selectedUserId')).toBeNull();
	});

	it('clearUserSelection works when no value was set', async () => {
		const store = await import('#lib/stores/userSelection.svelte.js');
		store.clearUserSelection();
		expect(store.getSelectedUserId()).toBeNull();
		expect(window.localStorage.getItem('perspectize:selectedUserId')).toBeNull();
	});
});
