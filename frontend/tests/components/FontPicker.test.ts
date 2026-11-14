import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import FontPicker from '$lib/components/fonts/FontPicker.svelte';
import { parseCatalog, type FontCatalogRow } from '$lib/fonts/googleFonts';
import { FONT_SLOT_INFO } from '$lib/fonts/slots';

const CATALOG = parseCatalog([
	['Inter', 'a', [400, 500, 600, 700], 1, 1],
	['Literata', 's', [400, 700], 1, 1],
	['Lobster', 'd', [400], 0, 0],
	['Merriweather', 's', [300, 400, 700], 1, 1],
] as FontCatalogRow[]);

const info = { ...FONT_SLOT_INFO.longform, recommended: [['Literata', 'Designed for e-reading']] as const };

function setup(value: { family: string; category: 's'; weights: number[]; italic: boolean } | null = null) {
	const onCommit = vi.fn();
	const onPreview = vi.fn();
	const onPreviewEnd = vi.fn();
	render(FontPicker, {
		props: { id: 'font-longform', info, catalog: CATALOG, value, onCommit, onPreview, onPreviewEnd },
	});
	const input = screen.getByRole('combobox') as HTMLInputElement;
	return { input, onCommit, onPreview, onPreviewEnd };
}

const optionNames = () => screen.getAllByRole('option').map((o) => o.textContent?.replace(/\s+/g, ' ').trim());

beforeEach(() => {
	document.head.querySelectorAll('[data-font-preview]').forEach((l) => l.remove());
});

describe('FontPicker', () => {
	it('shows the default font while nothing is picked, and the pick otherwise', () => {
		const { input } = setup();
		expect(input.value).toBe('Charter + Georgia (default)');
		document.body.innerHTML = '';
		const picked = setup({ family: 'Merriweather', category: 's', weights: [400], italic: true });
		expect(picked.input.value).toBe('Merriweather');
	});

	it('opens with the app default, then recommended, then everything else A–Z', async () => {
		const { input } = setup();
		await fireEvent.focus(input);
		expect(input.getAttribute('aria-expanded')).toBe('true');
		const names = optionNames();
		expect(names[0]).toContain('Charter + Georgia');
		expect(names[1]).toContain('Literata');
		expect(names[1]).toContain('Designed for e-reading');
		expect(names.slice(2).map((n) => n?.split(' ')[0])).toEqual(['Inter', 'Lobster', 'Merriweather']);
		expect(screen.getByText('Recommended for long-form reading')).toBeTruthy();
	});

	it('filters as you type and previews the first match', async () => {
		const { input, onPreview } = setup();
		await fireEvent.focus(input);
		await fireEvent.input(input, { target: { value: 'mer' } });
		expect(optionNames()).toHaveLength(1);
		expect(optionNames()[0]).toContain('Merriweather');
		expect(onPreview).toHaveBeenLastCalledWith({
			family: 'Merriweather',
			category: 's',
			weights: [300, 400, 700],
			italic: true,
		});
	});

	it('filters by category', async () => {
		const { input } = setup();
		await fireEvent.focus(input);
		await fireEvent.click(screen.getByRole('button', { name: 'Display' }));
		expect(optionNames()).toHaveLength(1);
		expect(optionNames()[0]).toContain('Lobster');
	});

	it('arrow keys preview on the page and Enter keeps the font', async () => {
		const { input, onPreview, onCommit } = setup();
		await fireEvent.focus(input);
		await fireEvent.keyDown(input, { key: 'ArrowDown' }); // default row
		expect(onPreview).toHaveBeenLastCalledWith(null);
		await fireEvent.keyDown(input, { key: 'ArrowDown' }); // Literata
		expect(onPreview).toHaveBeenLastCalledWith(expect.objectContaining({ family: 'Literata' }));
		expect(input.getAttribute('aria-activedescendant')).toBe('font-longform-opt-1');
		await fireEvent.keyDown(input, { key: 'Enter' });
		expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ family: 'Literata' }));
		expect(input.getAttribute('aria-expanded')).toBe('false');
	});

	it('clicking the default row resets the slot', async () => {
		const { input, onCommit } = setup({ family: 'Literata', category: 's', weights: [400], italic: false });
		await fireEvent.focus(input);
		await fireEvent.click(screen.getAllByRole('option')[0]);
		expect(onCommit).toHaveBeenCalledWith(null);
	});

	it('Escape cancels the preview without committing, and stops the dialog from closing', async () => {
		const { input, onCommit, onPreviewEnd } = setup();
		await fireEvent.focus(input);
		await fireEvent.keyDown(input, { key: 'ArrowDown' });
		const bubbleSpy = vi.fn();
		document.addEventListener('keydown', bubbleSpy);
		await fireEvent.keyDown(input, { key: 'Escape' });
		document.removeEventListener('keydown', bubbleSpy);
		expect(bubbleSpy).not.toHaveBeenCalled();
		expect(onPreviewEnd).toHaveBeenCalled();
		expect(onCommit).not.toHaveBeenCalled();
		expect(input.getAttribute('aria-expanded')).toBe('false');
	});

	it('says so when nothing matches', async () => {
		const { input } = setup();
		await fireEvent.focus(input);
		await fireEvent.input(input, { target: { value: 'zzz' } });
		expect(screen.getByText('No fonts match.')).toBeTruthy();
	});
});
