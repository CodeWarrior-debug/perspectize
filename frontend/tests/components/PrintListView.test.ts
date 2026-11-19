import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import PrintListView from '$lib/components/PrintListView.svelte';
import type { ExportTable } from '$lib/utils/exportTable';

const appCss = readFileSync(resolve(process.cwd(), 'src/app.css'), 'utf8');

const table: ExportTable = {
	columnIds: ['item', 'type'],
	headers: ['Item', 'Type'],
	rows: [
		['Alpha', 'Video'],
		['Beta', 'Book'],
	],
	rowUrls: ['https://example.com/a', null],
};

type Spacing = 'compact' | 'standard' | 'roomy';

function mount(props: { title?: string; spacing?: Spacing } = {}) {
	return render(PrintListView, {
		props: { table, title: 'My Library', spacing: 'standard' as Spacing, ...props },
	});
}

describe('PrintListView', () => {
	it('renders an h1 with the title when non-empty', () => {
		mount();
		expect(document.querySelector('h1')?.textContent).toBe('My Library');
	});

	it('renders no h1 when the title is empty', () => {
		mount({ title: '' });
		expect(document.querySelector('h1')).toBeNull();
	});

	it('puts the headers in a single thead row', () => {
		mount();
		const rows = document.querySelectorAll('thead tr');
		expect(rows).toHaveLength(1);
		expect([...rows[0].querySelectorAll('th')].map((th) => th.textContent)).toEqual(['Item', 'Type']);
	});

	it('renders one tbody row per table row', () => {
		mount();
		expect(document.querySelectorAll('tbody tr')).toHaveLength(2);
	});

	it('links the item cell when the row has a url and uses plain text otherwise', () => {
		mount();
		const rows = document.querySelectorAll('tbody tr');
		const link = rows[0].querySelector('td a');
		expect(link?.getAttribute('href')).toBe('https://example.com/a');
		expect(link?.textContent).toBe('Alpha');
		expect(rows[1].querySelector('a')).toBeNull();
		expect(rows[1].querySelectorAll('td')[0].textContent).toBe('Beta');
	});

	it.each(['compact', 'standard', 'roomy'] as const)('sets data-spacing=%s', (spacing) => {
		mount({ spacing });
		expect(document.querySelector('.print-root')?.getAttribute('data-spacing')).toBe(spacing);
	});

	it('moves itself to a direct child of body and removes itself on unmount', () => {
		const { unmount } = mount();
		expect(document.body.querySelector(':scope > .print-root')).not.toBeNull();
		unmount();
		expect(document.body.querySelector('.print-root')).toBeNull();
	});

	it('ships print css that repeats headers and keeps rows whole', () => {
		expect(appCss).toContain('table-header-group');
		expect(appCss).toContain('break-inside: avoid');
	});
});
