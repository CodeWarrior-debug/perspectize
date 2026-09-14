import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { createThemeStore, STORAGE_KEY } from '$lib/theme/store.svelte';
import { THEME_PRESETS } from '$lib/theme/presets';

// ColorWheel wraps a third-party canvas widget (@jaames/iro) — stubbed out here
// the same way ActivityTable.test.ts stubs ag-grid-svelte5 (see vite.config.ts's
// coverage exclude comment for why ColorWheel itself isn't unit-tested).
vi.mock('$lib/components/theme/ColorWheel.svelte', () => ({
	default: vi.fn(() => ({ $$: {}, $set: vi.fn(), $on: vi.fn(), $destroy: vi.fn() })),
}));

import ThemeCustomizePanel from '$lib/components/theme/ThemeCustomizePanel.svelte';

describe('ThemeCustomizePanel', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it('renders a swatch button for every preset', () => {
		const store = createThemeStore();
		render(ThemeCustomizePanel, { props: { store } });
		expect(screen.getByLabelText('Theme presets')).toBeInTheDocument();
		for (const preset of THEME_PRESETS) {
			expect(screen.getByText(preset.name)).toBeInTheDocument();
		}
	});

	it('clicking a preset swatch selects it on the store', async () => {
		const store = createThemeStore();
		const target = THEME_PRESETS.find((p) => p.id !== store.state.activeThemeId)!;
		render(ThemeCustomizePanel, { props: { store } });

		await fireEvent.click(screen.getByText(target.name));

		expect(store.state.activeThemeId).toBe(target.id);
	});

	it('"Customize" reveals the color-editing rows, seeded from the active theme', async () => {
		const store = createThemeStore();
		render(ThemeCustomizePanel, { props: { store } });

		await fireEvent.click(screen.getByRole('button', { name: 'Customize' }));

		expect(screen.getByLabelText('Primary value (oklch)')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Export CSS' })).toBeInTheDocument();
	});

	it('typing a valid hex into a token field previews it on the store (not yet saved)', async () => {
		const store = createThemeStore();
		render(ThemeCustomizePanel, { props: { store } });
		await fireEvent.click(screen.getByRole('button', { name: 'Customize' }));

		const input = screen.getByLabelText('Primary value (oklch)') as HTMLInputElement;
		await fireEvent.focus(input);
		await fireEvent.input(input, { target: { value: '#123456' } });

		expect(input.getAttribute('aria-invalid')).toBe('false');
		expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#123456');
		expect(store.state.customThemes).toHaveLength(0); // preview only, not saved
	});

	it('typing an unparseable value marks the row invalid without touching the preview', async () => {
		const store = createThemeStore();
		render(ThemeCustomizePanel, { props: { store } });
		await fireEvent.click(screen.getByRole('button', { name: 'Customize' }));

		const input = screen.getByLabelText('Primary value (oklch)') as HTMLInputElement;
		const before = document.documentElement.style.getPropertyValue('--color-primary');
		await fireEvent.focus(input);
		await fireEvent.input(input, { target: { value: 'not a color' } });

		expect(input.getAttribute('aria-invalid')).toBe('true');
		expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe(before);
	});

	it('"Save as..." then Save persists a new custom theme', async () => {
		const store = createThemeStore();
		render(ThemeCustomizePanel, { props: { store } });
		await fireEvent.click(screen.getByRole('button', { name: 'Customize' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Save as...' }));

		const nameInput = screen.getByPlaceholderText('Name your theme');
		await fireEvent.input(nameInput, { target: { value: 'My Palette' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		expect(store.state.customThemes).toHaveLength(1);
		expect(store.state.customThemes[0].name).toBe('My Palette');
	});

	it('Save is a no-op when the name field is blank', async () => {
		const store = createThemeStore();
		render(ThemeCustomizePanel, { props: { store } });
		await fireEvent.click(screen.getByRole('button', { name: 'Customize' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Save as...' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		expect(store.state.customThemes).toHaveLength(0);
	});

	it('deleting a saved custom theme removes it from the store', async () => {
		const store = createThemeStore();
		store.saveCustomTheme('Delete Me', THEME_PRESETS[0].base);
		render(ThemeCustomizePanel, { props: { store } });

		await fireEvent.click(screen.getByRole('button', { name: 'Delete Delete Me' }));

		expect(store.state.customThemes).toHaveLength(0);
	});
});
