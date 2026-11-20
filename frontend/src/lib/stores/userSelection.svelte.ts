import { browser } from '$app/env';

const STORAGE_KEY = 'perspectize:selectedUserId';

function loadFromStorage(): number | null {
	if (!browser) return null;
	const stored = window.localStorage.getItem(STORAGE_KEY);
	if (!stored) return null;
	const parsed = parseInt(stored, 10);
	return Number.isNaN(parsed) ? null : parsed;
}

function syncToStorage(value: number | null): void {
	if (!browser) return;
	if (value !== null) {
		window.localStorage.setItem(STORAGE_KEY, String(value));
	} else {
		window.localStorage.removeItem(STORAGE_KEY);
	}
}

// Internal reactive state
let _selectedUserId = $state<number | null>(loadFromStorage());

// Export getter/setter functions for external access
export function getSelectedUserId(): number | null {
	return _selectedUserId;
}

export function setSelectedUserId(value: number | null): void {
	_selectedUserId = value;
	syncToStorage(value);
}

// Export object with value getter/setter for convenience
export const selectedUserId = {
	get value() {
		return _selectedUserId;
	},
	set value(newValue: number | null) {
		_selectedUserId = newValue;
		syncToStorage(newValue);
	},
};

// Helper to clear selection
export function clearUserSelection(): void {
	_selectedUserId = null;
	syncToStorage(null);
}
