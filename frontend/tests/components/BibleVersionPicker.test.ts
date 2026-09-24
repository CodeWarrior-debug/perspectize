import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import BibleVersionPicker from '$lib/components/BibleVersionPicker.svelte';
import { createBibleVersionStore, BIBLE_VERSION_KEY } from '$lib/utils/bibleVersion.svelte';

describe('BibleVersionPicker', () => {
	beforeEach(() => localStorage.clear());

	it('shows all 10 translations with the default selected', () => {
		render(BibleVersionPicker, { props: { store: createBibleVersionStore() } });
		const select = screen.getByLabelText(/bible gateway version/i) as HTMLSelectElement;
		expect(select.options).toHaveLength(10);
		expect(select.value).toBe('ESV');
	});

	it('marks the Catholic translation', () => {
		render(BibleVersionPicker, { props: { store: createBibleVersionStore() } });
		expect(screen.getByRole('option', { name: /NABRE.*Catholic/i })).toBeInTheDocument();
	});

	it('preselects a persisted choice', () => {
		localStorage.setItem(BIBLE_VERSION_KEY, 'NIV');
		render(BibleVersionPicker, { props: { store: createBibleVersionStore() } });
		expect((screen.getByLabelText(/bible gateway version/i) as HTMLSelectElement).value).toBe('NIV');
	});

	it('updates the store and storage when the user picks a version', async () => {
		const store = createBibleVersionStore();
		render(BibleVersionPicker, { props: { store } });
		await fireEvent.change(screen.getByLabelText(/bible gateway version/i), { target: { value: 'KJV' } });
		expect(store.code).toBe('KJV');
		expect(localStorage.getItem(BIBLE_VERSION_KEY)).toBe('KJV');
	});
});
